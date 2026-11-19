"""Append-only proposed source corrections, independent of OCR and approvals."""
import copy
import json
import re
from datetime import datetime
from uuid import uuid4

from registry_pool.dictionary import digest
from registry_pool.store import encode

CORRECTION_DDL='''
CREATE TABLE IF NOT EXISTS source_corrections(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,correction_id TEXT NOT NULL UNIQUE,
 request_id TEXT NOT NULL UNIQUE,request_sha256 TEXT NOT NULL,
 package_id TEXT NOT NULL,revision INTEGER NOT NULL,candidate_type TEXT NOT NULL,
 candidate_id TEXT NOT NULL,payload TEXT NOT NULL,
 FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE INDEX IF NOT EXISTS corrections_by_candidate
 ON source_corrections(package_id,revision,candidate_type,candidate_id,sequence);
'''

SPECIMEN_FIELDS=('collection_date','collection_time','amount','checkbox_state')
LAB_SLOTS={'result','intensity','pre_measured','pre_percent_predicted','post_measured','post_percent_predicted'}


def editable_source(kind,item):
    data=item['source_data']
    if kind=='metadata':
        if item.get('key')=='additional_lab_result' and isinstance(data.get('value'),dict):
            lab=data['value'];results=lab.get('results')
            if isinstance(results,dict) and results and set(results)<=LAB_SLOTS:
                # Symbol/legend interpretations require their own editor. Keep
                # them intact instead of deriving a new class from a changed index.
                slots=[] if lab.get('class_raw') or lab.get('interpretation') else list(results)
                return ['result:'+slot for slot in slots]+['unit_raw']
        # Other structured metadata never accepts arbitrary JSON corrections.
        return ['value_raw'] if not isinstance(data.get('value'),(dict,list)) else []
    return list(SPECIMEN_FIELDS) if kind=='specimen' else []


def corrected_value(kind,item,before,changes):
    """Normalize transcribed text, never repair malformed OCR by guessing."""
    if not isinstance(changes,dict) or not changes or set(changes)-set(editable_source(kind,item)):
        raise ValueError('Select supported source attributes explicitly')
    if any(v is not None and (not isinstance(v,str) or not v.strip() or len(v)>16000) for v in changes.values()):
        raise ValueError('Correction values require source text or null')
    value=copy.deepcopy(before)
    if kind=='metadata' and item.get('key')=='additional_lab_result':
        from ocr_pool.pipeline import result_value
        lab=value['value']
        for key,raw in changes.items():
            if key=='unit_raw':
                lab['unit_raw']=raw
                continue
            if raw is None:
                raise ValueError('Lab results require explicit source text; withdraw approval to remove a result')
            slot=key.split(':',1)[1]
            parsed,flags=result_value(raw,'mixed',{'specimen':lab.get('specimen')})
            if parsed['result_type']=='missing':
                raise ValueError('Lab results require a visible source value')
            lab['results'][slot]=raw
            lab.setdefault('parsed_results',{})[slot]=dict(**parsed,flags=flags)
        value['value_raw']=' | '.join(lab['results'].values())
    elif kind=='metadata':
        from ocr_pool.metadata import normalize_value,DATE_KEYS,ADM_FIELDS
        raw=changes['value_raw']
        key=item['key']
        if raw is None:
            raise ValueError('Missing metadata cannot be approved; withdraw source approval to remove a value')
        if key in DATE_KEYS|set(ADM_FIELDS)|{'pid','sid','identity_number','unresolved_identifier'}:
            normalized,flags=normalize_value(key,raw.strip(),value.get('label_raw',''),
                dict(date_order='DMY',decimal_separator=','))
            if normalized is None or flags:
                raise ValueError('Source text does not support a valid metadata value')
        else:normalized=raw.strip()
        value.update(value=normalized,value_raw=raw)
        if key=='source_diagnosis':
            from ocr_pool.supplemental import UNCERTAIN
            from ocr_pool.metadata import fold
            value['source_uncertain']=bool(UNCERTAIN.search(fold(normalized))) if normalized else None
    else:
        for key,raw in changes.items():
            if key=='collection_date':
                normalized=None
                if raw is not None:
                    if not re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}',raw.strip()):
                        raise ValueError('Collection date requires explicit DD/MM/YYYY source text')
                    normalized=datetime.strptime(raw.strip(),'%d/%m/%Y').date().isoformat()
                value['collection_datetime'].update(date=normalized,date_raw=raw)
            elif key=='collection_time':
                normalized=None
                if raw is not None:
                    if not re.fullmatch(r'\d{1,2}:\d{2}',raw.strip()):
                        raise ValueError('Collection time requires an explicit HH:MM source clock')
                    normalized=datetime.strptime(raw.strip(),'%H:%M').strftime('%H:%M')
                value['collection_datetime'].update(time=normalized,time_raw=raw)
            elif key=='amount':
                from form_pool.sample_collection import amount
                if raw is None:
                    result=dict(raw=None,numeric_value=None,unit_raw=None,mapping_method=None)
                else:
                    result,flags=amount(raw.strip())
                    if flags:raise ValueError('Amount requires a valid explicit number and unit')
                value['amount']=result
            else:
                markers={'checked':'☑','unchecked':'☐','unreadable':None}
                if raw not in markers:raise ValueError('Unknown source checkbox state')
                value.update(checkbox_state=raw,checkbox_raw=markers[raw])
    if value==before:raise ValueError('No source value changed')
    # OCR flags remain intact as historical evidence. This marker distinguishes
    # a human transcription from a model result without changing the raw import.
    value['source_value_origin']='source_transcription'
    return value


class SourceCorrections:
    def pending_correction(self,package_id,revision,kind,candidate_id,decision):
        history=self.correction_history(package_id,revision,kind,candidate_id)
        if history and history[-1]['status']=='pending' and history[-1]['expected_review_id']==(decision['review_id'] if decision else None):
            return history[-1]
        return None

    def correction_history(self,package_id,revision,kind,candidate_id):
        # Older read-only databases remain exportable before schema migration.
        if not self.db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='source_corrections'").fetchone():
            return []
        return [json.loads(r[0]) for r in self.db.execute(
            'SELECT payload FROM source_corrections WHERE package_id=? AND revision=? AND candidate_type=? AND candidate_id=? ORDER BY sequence',
            (package_id,revision,kind,candidate_id))]

    def source_value(self,kind,item,decision):
        if kind in {'metadata','specimen'} and decision and decision['action']=='approve' and decision.get('correction_id'):
            return copy.deepcopy(decision['after'])
        return copy.deepcopy(item['source_data'])

    def propose_source_correction(self,package_id,revision,*,candidate_type,candidate_id,changes,
            evidence_ids,reason,actor,role,request_id,expected_package_sha256,
            expected_candidate_sha256,expected_review_id,expected_correction_id,action='propose'):
        from .source import candidates
        from .store import actor_info,text,now
        who=actor_info(actor,role)
        if action not in {'propose','withdraw'}:raise ValueError('Unknown correction action')
        if action=='withdraw' and (role=='assistant' or changes!={}):
            raise ValueError('A human reviewer must withdraw a proposal without editing source values')
        reason=text(reason,'Source correction reason');request_id=text(request_id,'Correction request ID')
        if candidate_type not in {'metadata','specimen'}:raise ValueError('Use the observation editor for clinical values')
        if (not isinstance(evidence_ids,list) or not evidence_ids or
                any(not isinstance(e,str) for e in evidence_ids) or len(set(evidence_ids))!=len(evidence_ids)):
            raise ValueError('Select source evidence for the correction')
        request=dict(package_id=package_id,revision=revision,candidate_type=candidate_type,candidate_id=candidate_id,
            changes=changes,evidence_ids=evidence_ids,reason=reason,reviewer=who,
            expected_package_sha256=expected_package_sha256,expected_candidate_sha256=expected_candidate_sha256,
            expected_review_id=expected_review_id,expected_correction_id=expected_correction_id)
        if action!='propose':request['action']=action
        checksum=digest(request)
        with self.transaction():
            old=self.db.execute('SELECT request_sha256,payload FROM source_corrections WHERE request_id=?',(request_id,)).fetchone()
            if old:
                if old[0]!=checksum:raise ValueError('Correction request ID reused with different content')
                return dict(status='already_recorded',correction=json.loads(old[1]))
            package=self.registry.package(package_id,revision)
            latest=self.db.execute('SELECT MAX(revision) FROM packages WHERE package_id=?',(package_id,)).fetchone()[0]
            if revision!=latest:raise ValueError('Only the current package revision can be corrected')
            if digest(package)!=expected_package_sha256:raise ValueError('Source package changed; reload')
            item=candidates(package).get((candidate_type,candidate_id))
            if item is None or digest(item)!=expected_candidate_sha256:raise ValueError('Source candidate changed or outside revision')
            if set(evidence_ids)-set(item['evidence_ids']):raise ValueError('Evidence is outside this source candidate')
            previous=self.source_review_index(package_id,revision).get((candidate_type,candidate_id))
            history=self.correction_history(package_id,revision,candidate_type,candidate_id)
            if ((previous['review_id'] if previous else None)!=expected_review_id or
                    (history[-1]['correction_id'] if history else None)!=expected_correction_id):
                raise ValueError('Source correction or review changed; reload')
            before=self.source_value(candidate_type,item,previous)
            if action=='withdraw':
                if not history or history[-1]['status']!='pending' or history[-1]['expected_review_id']!=expected_review_id:
                    raise ValueError('Only a current pending correction can be withdrawn')
                after=copy.deepcopy(before)
            else:after=corrected_value(candidate_type,item,before,changes)
            record=dict(correction_id='source-correction-'+uuid4().hex,request_id=request_id,
                **request,before=before,after=after,document_id=item['document_id'],
                created_at_utc=now(),status='pending' if action=='propose' else 'withdrawn',clinical_assessment=False)
            self.db.execute('INSERT INTO source_corrections(correction_id,request_id,request_sha256,package_id,revision,candidate_type,candidate_id,payload) VALUES(?,?,?,?,?,?,?,?)',
                (record['correction_id'],request_id,checksum,package_id,revision,candidate_type,candidate_id,encode(record)))
            self.registry._audit('source_correction_proposed' if action=='propose' else 'source_correction_withdrawn',record)
        return dict(status='recorded',correction=record)
