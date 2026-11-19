"""Read-only export snapshot. Explicit identity and human decisions are mandatory."""
import copy
import json

from registry_pool.dictionary import digest
from registry_review.store import ReviewStore


def snapshot(path,dictionary,*,synthetic=False):
    store=ReviewStore(path,read_only=True)
    try:
        # One consistent SQLite read transaction, including review and identity state.
        store.db.execute('BEGIN')
        summary=store.summary()
        for row in store.db.execute('SELECT payload FROM dictionaries'):
            if digest(json.loads(row[0]))!=digest(dictionary):
                raise ValueError('Database dictionary differs from export dictionary')
        catalog={f['field_id']:f for f in dictionary['fields']}
        cases=summary['cases'];case_ids={c['case_id'] for c in cases}
        encounters=summary['encounters']
        packages={};observations=[];excluded=[];metadata=[];specimens=[]

        def exclude(kind,item,pid,rev,reason):
            identity=store.assignment(item['document_id'])
            confirmed=identity and identity['identity_status']=='confirmed'
            excluded.append(dict(kind=kind,id=item.get('observation_id') or item.get('candidate_id') or item.get('sample_id'),
                document_id=item['document_id'],package_id=pid,revision=rev,
                case_id=identity['case_id'] if confirmed else None,
                encounter_id=identity['encounter_id'] if confirmed else None,reason=reason))

        def package(pid,rev):
            if (pid,rev) not in packages:
                packages[pid,rev]=store.registry.package(pid,rev)
            return packages[pid,rev]

        for case in cases:
            for item in store.effective_pool(case['case_id'])['observations']:
                if not item['eligible_for_verified_pool']:
                    exclude('observation',item,item['package_id'],item['revision'],'conflicting_accepted_values')
                    continue
                if item['field_id'] not in catalog or item['component'] not in {
                    c['component_id'] for c in catalog[item['field_id']]['components']}:
                    raise ValueError('Accepted observation is outside the mapped dictionary')
                source=next(o for o in package(item['package_id'],item['revision'])['observations']
                            if o['observation_id']==item['observation_id'])
                record=copy.deepcopy(item)
                record['value']=copy.deepcopy(source['source_data'])
                record['value'].update(item['value'])
                # Pending/source flags describe OCR history, not the accepted overlay.
                for name in ('review_status','eligible_for_verified_pool','validation_status'):
                    record['value'].pop(name,None)
                record['assignment_id']=store.assignment(item['document_id'])['assignment_id']
                observations.append(record)

        latest={}
        for p in summary['packages']:latest[p['package_id']]=p['revision']
        accepted_ids={o['observation_id'] for o in observations}
        seen={'metadata':set(),'specimen':set()}
        for pid,rev in sorted(latest.items()):
            raw=package(pid,rev)
            approved=store.source_reviewed_pool(pid,rev)
            for item in raw['observations']:
                if item['observation_id'] not in accepted_ids:
                    if not any(e['id']==item['observation_id'] and e['package_id']==pid and e['revision']==rev for e in excluded):
                        exclude('observation',item,pid,rev,'no_current_uncontested_case_acceptance')
            for kind,group,id_key,out in [('metadata','metadata_candidates','candidate_id',metadata),
                                          ('specimen','specimen_candidates','sample_id',specimens)]:
                approved_ids={v[id_key] for v in approved.get(group,[])}
                for item in raw.get(group,[]):
                    if item[id_key] not in approved_ids:
                        exclude(kind,item,pid,rev,'no_source_approval_for_latest_revision')
                for item in approved.get(group,[]):
                    identity=store.assignment(item['document_id'])
                    if not identity or identity['identity_status']!='confirmed' or identity['case_id'] not in case_ids:
                        exclude(kind,item,pid,rev,'no_confirmed_case_assignment')
                        continue
                    if item[id_key] in seen[kind]:continue
                    seen[kind].add(item[id_key])
                    out.append(dict(**copy.deepcopy(item),case_id=identity['case_id'],
                        encounter_id=identity['encounter_id'],assignment_id=identity['assignment_id'],
                        package_id=pid,revision=rev))
        documents={}
        for (pid,rev),raw in sorted(packages.items()):
            for document in raw['documents']:
                identity=store.assignment(document['document_id'])
                if identity and identity['identity_status']=='confirmed' and identity['case_id'] in case_ids:
                    documents[document['document_id']]=dict(**copy.deepcopy(document),package_id=pid,revision=rev,
                        case_id=identity['case_id'],encounter_id=identity['encounter_id'],assignment_id=identity['assignment_id'])
        states={}
        for case in cases:
            selected=[o for o in observations if o['case_id']==case['case_id']]
            states[case['case_id']]={f['field_id']:dict(
                status='accepted' if any(o['field_id']==f['field_id'] for o in selected) else 'no_accepted_value',
                components={c['component_id']:[o['observation_id'] for o in selected
                    if o['field_id']==f['field_id'] and o['component']==c['component_id']] for c in f['components']})
                for f in dictionary['fields']}
        result=dict(schema_version='registry-export-snapshot-0.1',synthetic=synthetic,
            dictionary_sha256=digest(dictionary),cases=cases,encounters=encounters,
            documents=list(documents.values()),observations=observations,metadata=metadata,specimens=specimens,field_states=states,
            excluded=excluded,readiness='ready_for_draft_export' if cases else 'blocked_no_confirmed_registry_cases',
            policies=dict(observations='current_explicit_case_acceptance_only',
                metadata_and_specimens='source_approval_and_confirmed_document_assignment_only; not clinical acceptance',
                dates='never_infer_measurement_date_from_visit',missing='null_and_source_placeholders_preserved'),
            source_packages=[dict(package_id=pid,revision=rev,sha256=digest(p)) for (pid,rev),p in sorted(packages.items())])
        result['snapshot_sha256']=digest(result)
        return result
    finally:
        store.close()
