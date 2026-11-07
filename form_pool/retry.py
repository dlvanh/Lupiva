"""Select valid source-cell re-reads without changing raw OCR or good values."""
import copy
import hashlib
import re

from registry_pool.dictionary import digest
from .sample_collection import collection_time,amount


def apply_cell_retries(base,retry_documents,*,date_order='DMY'):
    result=copy.deepcopy(base)
    result['schema_version']='sample-collection-candidates-0.2'
    result['retry_decisions']=[]
    candidates={c['sample_candidate_id']:c for c in result['candidates']}
    evidence={e['evidence_id']:e for e in result['evidence']}
    attempts={}
    for doc in retry_documents:
        for cell in doc.get('text_regions',[]):
            layout=cell.get('region',{}).get('layout',{})
            if layout.get('method') not in {'source_sample_form_ruled_cell','source_sample_form_blue_ink_extent'}:
                continue
            parent=candidates.get(layout.get('parent_sample_candidate_id'))
            if not parent:
                raise ValueError('Sample retry has an unknown parent candidate')
            original=evidence[parent['evidence_ids'][0]]
            if (doc['document_id']!=parent['document_id'] or doc.get('input_sha256')!=parent['source_document_sha256']
                    or original['table_sha256']!=layout.get('parent_raw_sha256')
                    or original['table_id']!=layout.get('parent_table_id')
                    or original['row_index_0based']!=layout.get('parent_row_index_0based')):
                raise ValueError('Sample retry source, parent row or raw hash differs')
            attribute=layout.get('attribute')
            if attribute not in {'collection_datetime','amount'}:
                raise ValueError('Unknown sample retry attribute')
            if cell.get('truncated') or cell.get('generation_status','ok')!='ok':
                result['retry_decisions'].append(dict(region_id=cell['table_id'],accepted=False,reason='incomplete_retry'))
                continue
            ev=dict(document_id=doc['document_id'],input_sha256=doc['input_sha256'],table_id=cell['table_id'],
                table_sha256=hashlib.sha256(cell['raw'].encode('utf-8')).hexdigest(),raw=cell['raw'],
                region=cell['region'],evidence_kind='sample_form_cell',attribute=attribute,
                parent_evidence_id=original['evidence_id'],mapping_method='source_cell_retry_with_explicit_parent_lineage')
            ev['evidence_id']='formev-'+digest(ev)
            result['evidence'].append(ev)
            parent['evidence_ids'].append(ev['evidence_id'])
            raw=' '.join(cell['raw'].split())
            if attribute=='collection_datetime':
                parsed,flags=collection_time(raw,date_order)
                valid=parsed['date'] is not None
                comparison=(parsed['date'],parsed['time'] or parent[attribute]['time'])
                # A line retry may report date only. Never copy a clock from
                # another sample or overwrite an already valid clock.
                if parsed['time'] and parent[attribute]['time'] and parsed['time']!=parent[attribute]['time']:
                    valid=False
                    flags.append('collection_time_retry_conflict')
            else:
                parsed,flags=amount(raw)
                if parsed['numeric_value'] is None and re.fullmatch(r'\d+',raw) and parent['amount']['unit_raw']:
                    parsed,flags=amount(raw+' '+parent['amount']['unit_raw'])
                    parsed['raw']=cell['raw']
                    parsed['mapping_method']='source_numeric_cell_and_same_parent_cell_unit'
                valid=parsed['numeric_value'] is not None
                comparison=(parsed['numeric_value'],parsed['unit_raw'])
                if (parent[attribute]['unit_raw'] and parsed['unit_raw'] and
                        parent[attribute]['unit_raw']!=parsed['unit_raw']):
                    valid=False
                    flags.append('collection_unit_retry_conflict')
            decision=dict(region_id=cell['table_id'],parent_sample_candidate_id=layout['parent_sample_candidate_id'],
                attribute=attribute,accepted=False,reason='invalid_or_incomplete_value' if not valid else 'awaiting_consensus',
                retry_flags=flags,evidence_id=ev['evidence_id'])
            result['retry_decisions'].append(decision)
            attempts.setdefault((layout['parent_sample_candidate_id'],attribute),[]).append((parsed,valid,comparison,decision))
    for (cid,attribute),items in attempts.items():
        parent=candidates[cid]
        valid=[item for item in items if item[1]]
        fingerprints={i[2] for i in valid}
        if len(fingerprints)>1:
            parent['flags'].append('form_retry_value_conflict')
            for _,_,_,decision in valid:
                decision['reason']='conflicting_valid_retries'
            continue
        if not valid:
            continue
        parsed=valid[0][0]
        current=parent[attribute]
        value_key='date' if attribute=='collection_datetime' else 'numeric_value'
        if current[value_key] is not None:
            for _,_,_,decision in valid:
                decision['reason']='valid_parent_value_preserved'
            continue
        parent.setdefault('original_values',{})[attribute]=copy.deepcopy(current)
        if attribute=='collection_datetime':
            current['date']=parsed['date']
            current['date_raw']=parsed['date_raw']
            if current['time'] is None and parsed['time']:
                current['time']=parsed['time']
                current['time_raw']=parsed['time_raw']
            clear={'invalid_metadata_date','missing_date_convention','collection_date_not_reported_in_ocr'}
        else:
            parent[attribute]=parsed
            clear={'unparsed_collection_amount','ambiguous_collection_amount','amount_not_reported_in_ocr'}
        parent['flags']=[flag for flag in parent['flags'] if flag not in clear]
        parent['flags'].append('source_cell_retry_selected')
        for _,_,_,decision in valid:
            decision.update(accepted=True,reason='unique_valid_source_cell_value')
    for candidate in result['candidates']:
        candidate['evidence_ids']=list(dict.fromkeys(candidate['evidence_ids']))
        candidate['flags']=list(dict.fromkeys(candidate['flags']))
        old=candidate.pop('sample_candidate_id')
        candidate['parent_sample_candidate_id']=old
        candidate['sample_candidate_id']='sample-'+digest(candidate)
    return result
