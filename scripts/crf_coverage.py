"""Per-case CRF pre-fill coverage from a read-only review database.

Every dictionary field/component is classified with the same functions the
review UI uses (CRFReview.view, patient_workspace, the stored knowledge rules
and evidence_proposals), into exactly one state:

- reviewed:  the latest CRF form review (crf_form_reviewed) decided this slot.
             Accepting an observation alone keeps the slot a candidate until
             the form review selects it.
- candidate: extracted values with sources are waiting for review (the view's
             options; the case study id offered on ADM01 is not a candidate).
- suggested: the knowledge base proposes an answer from other values: a form
             finding rule, a lab-derived finding rule, the calculated BMI, an
             EULAR/ACR score evidence proposal, or an already stored LLM draft
             for the current snapshot. This script never calls a model or the
             network.
- blocked:   a knowledge rule targets the slot's result component but cannot
             fire. Missing inputs are the rule's input fields that have no
             current extracted result (the same source population the rule
             engine reads). Inputs that exist but do not meet the rule are
             not listed as missing.
- empty:     none of the above.

A field's state is the best state of its components, in the order above; the
fill rate counts reviewed + candidate + suggested over all fields (and over
all components). "Would unblock" counts blocked fields whose only missing
input is that field; "needed by" counts every blocked rule listing it. In the
cross-case table a section is "entirely empty" for a case when none of its
fields is reviewed, candidate or suggested (blocked rules are potential, not
pre-filled content), so a case with no data has every section entirely empty.

Not derivable from stored data alone, and therefore not invented here:
- SLEDAI-2K rules (score evidence and lab-derived alike) need the doctor's
  assessment date, entered at scoring time rather than stored as a field value.
  Without it they cannot fire, so those score fields are blocked even when every
  lab input is present.
- A slot targeted by several libraries lists the lab-derived rule's inputs when
  one exists (REN07, MUS02, HEM12, LUNG01), otherwise the form-finding or score
  rule's inputs. Judgment-only rules with no input fields are blocked with an
  empty missing-input list.
- Low-complement and above-reference rules need reference ranges; a missing range
  is not a field input and is not listed.
The report contains field ids, labels, sections, states and counts only: no
extracted values, no source text, no patient identifiers except the case id.
"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from registry_review.crf import CRFReview, current_sources
from registry_review.crf_knowledge import FINDINGS_VERSION, LAB_FINDINGS_VERSION, load_knowledge, read_knowledge
from registry_review.crf_lab_findings import lab_finding_proposals
from registry_review.crf_scores import evidence_proposals
from registry_review.exports import ExportManager
from registry_review.references import matched_references
from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace

STATES=('reviewed','candidate','suggested','blocked','empty')
FILLED=STATES[:3]


class ReadOnlyApplication:
    """CRFReview only needs exports and bundles. ReviewApplication would open a
    writable store and intake workspaces, so this shim keeps the run read-only."""
    def __init__(self,database):
        self.database=Path(database).resolve()
        self.bundles={}
        self.exports=ExportManager(self)


def lab_missing_inputs(rule,present_slots):
    missing=[]
    for criterion in rule['criteria']:
        field=criterion['field']
        if (field,criterion.get('component','result')) not in present_slots and field not in missing:
            missing.append(field)
    return missing


def classify_slots(view,workspace,references,rules,finding_rules,lab_rules):
    sources=current_sources(workspace)
    present={s['field_id'] for s in sources if s['kind']=='observation' and s['component']=='result'}
    present_slots={(s['field_id'],s['component']) for s in sources if s['kind']=='observation'}
    score_suggestions=evidence_proposals(sources,references,None,rules)
    lab_suggestions=lab_finding_proposals(workspace,references,lab_rules)
    reviewed=(view['review'] or {}).get('values',{})
    slots={}
    for field in view['fields']:
        fid,component=field['slot'].split('/',1)
        rule=(lab_rules.get(fid) or finding_rules.get(fid) or rules.get(fid)) if component=='result' else None
        if field['slot'] in reviewed:
            state,missing='reviewed',[]
        elif any(option['sources'] for option in field['options']):
            state,missing='candidate',[]
        elif field.get('proposal') or (component=='result' and fid in score_suggestions) or field['slot'] in lab_suggestions:
            state,missing='suggested',[]
        elif rule is not None:
            state='blocked'
            missing=lab_missing_inputs(rule,present_slots) if 'criteria' in rule else [f for f in rule['fields'] if f not in present]
        else:
            state,missing='empty',[]
        slots[field['slot']]=dict(field_id=fid,component=component,label=field['label'],
            section=field['section'],state=state,missing_inputs=missing)
    return slots


def state_counts(items):
    counts=Counter(item['state'] for item in items)
    return {state:counts[state] for state in STATES}


def fill_rate(counts):
    total=sum(counts.values())
    return round(sum(counts[state] for state in FILLED)/total,4) if total else 0.0


def case_coverage(crf,store,dictionary,rules,finding_rules,lab_rules,case_id):
    store.db.execute('BEGIN')
    try:
        view=crf.view(store,case_id)
        workspace=patient_workspace(store,dictionary,case_id)
        references=matched_references(store,workspace)
    finally:
        store.db.execute('ROLLBACK')
    slots=classify_slots(view,workspace,references,rules,finding_rules,lab_rules)
    rank={state:i for i,state in enumerate(STATES)}
    fields=[]
    for definition in dictionary['fields']:
        fid=definition['field_id']
        components=[slots[fid+'/'+c['component_id']] for c in definition['components']]
        best=min(components,key=lambda s:rank[s['state']])
        fields.append(dict(field_id=fid,label=definition['label'],section=definition['section'],
            state=best['state'],components=[dict(component=s['component'],state=s['state'],
                missing_inputs=s['missing_inputs']) for s in components]))
    needed_by,unblocks,targets=Counter(),Counter(),defaultdict(set)
    for slot in slots.values():
        if slot['state']!='blocked':continue
        for fid in slot['missing_inputs']:
            needed_by[fid]+=1
            targets[fid].add(slot['field_id'])
        if len(slot['missing_inputs'])==1:unblocks[slot['missing_inputs'][0]]+=1
    labels={f['field_id']:f['label'] for f in dictionary['fields']}
    missing_inputs=[dict(field_id=fid,label=labels[fid],unblocks=unblocks[fid],
        needed_by=needed_by[fid],targets=sorted(targets[fid]))
        for fid in sorted(needed_by,key=lambda f:(-unblocks[f],-needed_by[f],f))]
    sections=[]
    for section in dict.fromkeys(f['section'] for f in dictionary['fields']):
        counts=state_counts([f for f in fields if f['section']==section])
        sections.append(dict(section=section,fields=counts,
            components=state_counts([s for s in slots.values() if s['section']==section]),
            fill_rate=fill_rate(counts)))
    totals=dict(fields=state_counts(fields),components=state_counts(slots.values()))
    return dict(case_id=case_id,totals=totals,
        fill_rate=dict(fields=fill_rate(totals['fields']),components=fill_rate(totals['components'])),
        sections=sections,missing_inputs=missing_inputs,
        blocked_without_missing_inputs=sum(s['state']=='blocked' and not s['missing_inputs'] for s in slots.values()),
        fields=fields)


def coverage(database,case_ids=None):
    app=ReadOnlyApplication(database)
    store=ReviewStore(app.database,read_only=True)
    try:
        dictionary,_,_=app.exports.configuration()
        known=[c['case_id'] for c in store.summary()['cases']]
        selected=known
        if case_ids is not None:
            unknown=sorted(set(case_ids)-set(known))
            if unknown:raise ValueError('Unknown case id: '+', '.join(unknown))
            selected=[c for c in known if c in set(case_ids)]
        rules=load_knowledge(store.db)
        finding_rules=read_knowledge(store.db,FINDINGS_VERSION)['rules']
        lab_rules=read_knowledge(store.db,LAB_FINDINGS_VERSION)['rules']
        crf=CRFReview(app)
        cases=[case_coverage(crf,store,dictionary,rules,finding_rules,lab_rules,cid) for cid in selected]
    finally:
        store.close()
    cross=[dict(section=section,entirely_empty_cases=sum(
        all(f['state'] not in FILLED for f in case['fields'] if f['section']==section) for case in cases))
        for section in dict.fromkeys(f['section'] for f in dictionary['fields'])]
    return dict(schema_version='crf-coverage-1',field_count=len(dictionary['fields']),
        component_count=sum(len(f['components']) for f in dictionary['fields']),
        states=list(STATES),cases=cases,cross_case=dict(case_count=len(cases),sections=cross))


def cell(text):
    return str(text).replace('|','\\|')


def render_markdown(report):
    lines=['# CRF coverage report','',
        f"{report['field_count']} fields, {report['component_count']} components, {len(report['cases'])} case(s).",
        'Fill rate = reviewed + candidate + suggested. A field takes the best state of its components.','']
    for case in report['cases']:
        totals=case['totals']
        filled=sum(totals['fields'][s] for s in FILLED)
        filled_slots=sum(totals['components'][s] for s in FILLED)
        lines+=[f"## Case {case['case_id']}",'',
            f"Fill rate: {filled}/{report['field_count']} fields ({case['fill_rate']['fields']:.1%}); "
            f"{filled_slots}/{report['component_count']} components ({case['fill_rate']['components']:.1%}).",'',
            '| State | Fields | Components |','|---|---|---|']
        lines+=[f"| {s} | {totals['fields'][s]} | {totals['components'][s]} |" for s in STATES]
        lines+=['','### Sections (field counts)','','| Section | '+' | '.join(STATES)+' | Fill rate |',
            '|---|'+'---|'*(len(STATES)+1)]
        for section in case['sections']:
            counts=section['fields']
            lines.append('| '+cell(section['section'])+' | '+' | '.join(str(counts[s]) for s in STATES)
                +f" | {section['fill_rate']:.1%} |")
        lines+=['','### Missing inputs across blocked rules','']
        if case['missing_inputs']:
            lines+=['| Input | Label | Would unblock | Needed by | Blocked targets |','|---|---|---|---|---|']
            for item in case['missing_inputs']:
                lines.append(f"| {item['field_id']} | {cell(item['label'])} | {item['unblocks']} | "
                    f"{item['needed_by']} | {', '.join(item['targets'])} |")
        else:
            lines.append('No blocked rule lists a missing field input.')
        lines+=['',f"Blocked fields without a missing field input: {case['blocked_without_missing_inputs']} "
            '(inputs present but not qualifying, judgment-only rules, or non-field inputs such as the SLEDAI assessment date).','']
    lines+=['## Cross-case: entirely empty sections','',
        f"| Section | Entirely empty cases (of {report['cross_case']['case_count']}) |",'|---|---|']
    for section in report['cross_case']['sections']:
        lines.append(f"| {cell(section['section'])} | {section['entirely_empty_cases']} |")
    return '\n'.join(lines)+'\n'


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',required=True,type=Path)
    parser.add_argument('--case',action='append',help='Case id; repeat to select several (default: all)')
    parser.add_argument('--out',type=Path,help='Write the Markdown report to this file')
    parser.add_argument('--json',type=Path,dest='json_out',help='Write the JSON report to this file')
    args=parser.parse_args()
    if not args.db.is_file():parser.exit(2,'Database not found: '+str(args.db)+'\n')
    try:
        report=coverage(args.db,args.case)
    except ValueError as error:
        parser.exit(2,str(error)+'\n')
    markdown=render_markdown(report)
    if args.out:args.out.write_text(markdown,encoding='utf-8')
    if args.json_out:args.json_out.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
    if not args.out:print(markdown,end='')


if __name__=='__main__':main()