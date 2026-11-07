"""Create an offline review page showing each OCR crop and its candidate rows."""
import argparse
from html import escape
import json
from pathlib import Path


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('run', type=Path)
    p.add_argument('--output',type=Path,help='Fresh HTML filename in the run directory; preserve an existing workflow review')
    args = p.parse_args()
    output=args.output or args.run/'review.html'
    if output.parent.resolve()!=args.run.resolve():
        raise ValueError('Review HTML must stay beside its raw/crop assets')
    if args.output and output.exists():
        raise FileExistsError('Choose a fresh review HTML filename')
    pool = json.loads((args.run/'candidate-pool.json').read_text(encoding='utf-8'))
    envelope = json.loads((args.run/'ocr-tables.json').read_text(encoding='utf-8'))
    assessment_path=args.run/'self-assessment.json'
    assessment=''
    if assessment_path.exists():
        report=json.loads(assessment_path.read_text(encoding='utf-8'))
        score=report['exact_scoped_tuples']
        assessment='<p><strong>'+escape(report['assessment_label'])+'</strong></p><p>Exact scoped tuples: '+str(score['matched_count'])+'/'+str(score['expected_count'])+'. Development images reused; see self-assessment.json for component scores and limitations.</p>'
    ev = {e['evidence_id']: e for e in pool['evidence']}
    sections = []
    for doc in envelope['documents']:
        samples=[s for s in pool.get('specimen_candidates',[]) if s['document_id']==doc['document_id']]
        if samples:
            parts=[]
            for sample in samples:
                links=[]
                for eid in sample['evidence_ids']:
                    source=ev[eid]
                    links.append('<a href="crops/'+escape(source['table_id'])+'.png">'+escape(source['table_id'])+'</a>')
                parts.append('<h3>'+escape(sample['sample_type']+' / '+sample['checkbox_state'])+'</h3><p>'+
                    ' · '.join(links)+'</p><pre>'+escape(json.dumps(sample,ensure_ascii=False,indent=2))+'</pre>')
            sections.append('<section><h2>'+escape(doc['document_id'])+' / Sample collection candidates</h2>'+
                '<p>Pending source-form metadata. Unchecked is not clinical No. Specimen identity and event association remain unconfirmed.</p>'+''.join(parts)+'</section>')
        for text in doc.get('text_regions', []):
            tid = text['table_id']
            if text.get('purpose')=='sample_form_retry':
                sections.append('<section><h2>'+escape(tid)+'</h2><p>Source sample-form cell retry; pending review.</p><div class="pair"><a href="crops/'+escape(tid)+'.png"><img src="crops/'+escape(tid)+'.png" alt="Sample form source cell"></a><pre>'+escape(text['raw'])+'</pre></div></section>')
                continue
            rows = []
            for item in pool.get('metadata_candidates', []):
                source = ev[item['evidence_ids'][0]]
                if item['document_id'] != doc['document_id'] or source['table_id'] != tid:
                    continue
                values = [item['key'], item['label_raw'], item['value_raw'], item['value'],
                          ', '.join(item['flags']) or item['validation_status']]
                rows.append('<tr id="'+escape(source['evidence_id'])+'">'+''.join('<td>'+escape(str(v) if v is not None else '')+'</td>' for v in values)+'</tr>')
            status = 'Incomplete OCR; excluded from extraction.' if text.get('truncated') or text.get('generation_status', 'ok') != 'ok' else 'Pending review; identity unconfirmed.'
            if text.get('purpose') in {'source_context','superseded_context'}:
                status += ' Context only; excluded from metadata extraction.'
            exclusions = text.get('context', {}).get('metadata_exclude_keys', [])
            if exclusions:
                status += ' Keys superseded by focused crops: ' + ', '.join(exclusions)
            sections.append('<section><h2>'+escape(doc['document_id']+' / '+tid)+'</h2><p>'+escape(status)+'</p><div class="pair"><a href="crops/'+escape(tid)+'.png"><img src="crops/'+escape(tid)+'.png" alt="Metadata source crop"></a><div><table><thead><tr><th>Metadata</th><th>Source label</th><th>Raw value</th><th>Normalized candidate</th><th>Status / flags</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table><details><summary>Raw metadata OCR</summary><pre>'+escape(text['raw'])+'</pre></details></div></div></section>')
        for table in doc.get('tables', []):
            tid = table['table_id']
            rows = []
            for obs in pool['observations']:
                evidence = ev[obs['evidence_ids'][0]]
                if obs['document_id'] != doc['document_id'] or evidence['table_id'].rsplit('.',1)[0] != tid:
                    continue
                values = [obs['field_id'], pool['fields'][obs['field_id']]['label'], obs['component'],
                          obs['result_raw'], obs.get('unit_raw') or '',
                          obs.get('source_date') or '', obs.get('date_type') or '',
                          ', '.join(obs['flags']) or obs['extraction_status']]
                rows.append('<tr>'+''.join('<td>'+escape(str(v))+'</td>' for v in values)+'</tr>')
            status=''
            if table.get('purpose')=='superseded_context':
                status='<p>Superseded for clinical extraction; retained for source context, metadata and audit.</p>'
            elif table.get('purpose')=='source_legend':
                status='<p>Printed source legend; excluded from clinical observations.</p>'
            sections.append('<section><h2>'+escape(tid)+'</h2>'+status+'<div class="pair"><a href="crops/'+escape(tid)+'.png"><img src="crops/'+escape(tid)+'.png" alt="Source OCR crop"></a><div><table><thead><tr><th>Field</th><th>Label</th><th>Component</th><th>Raw result</th><th>Unit</th><th>Source date</th><th>Date type</th><th>Status / flags</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table><details><summary>Raw model output</summary><pre>'+escape(table['raw'])+'</pre></details></div></div></section>')
        adm_rows = [o for o in pool['observations'] if o['document_id'] == doc['document_id'] and o.get('metadata_candidate_id')]
        if adm_rows:
            sections.append('<section><h2>'+escape(doc['document_id'])+' / ADM candidates</h2><pre>'+escape(json.dumps(adm_rows, ensure_ascii=False, indent=2))+'</pre></section>')
    sections.append('<section><h2>Issues requiring review</h2><pre>'+escape(json.dumps(pool['issues'], ensure_ascii=False, indent=2))+'</pre></section>')
    content = '''<!doctype html><html lang="vi"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'">
<title>OCR candidate pool review</title><style>
body{font:15px system-ui;margin:24px;color:#17232e;background:#f6f8fb}section{background:white;padding:16px;margin:20px 0;border:1px solid #d9e1e8;border-radius:8px}.pair{display:grid;grid-template-columns:minmax(250px,45%) 1fr;gap:20px}.pair>div{overflow:auto}img{width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:13px}td,th{padding:8px;border:1px solid #d9e1e8;text-align:left;vertical-align:top}th{background:#edf2f8}pre{white-space:pre-wrap;word-break:break-word;max-height:400px;overflow:auto}@media(max-width:900px){.pair{grid-template-columns:1fr}}
</style><h1>OCR → candidate pool</h1><p>Local review only. All observations are pending. The development reference is unreviewed; matching it does not prove clinical accuracy. Click each crop to inspect it at full size.</p>'''+''.join(sections)+'</html>'
    content=content.replace('<h1>OCR',assessment+'<h1>OCR',1)
    output.write_text(content, encoding='utf-8')
    print('Saved offline crop and candidate review page.')


if __name__ == '__main__':
    main()
