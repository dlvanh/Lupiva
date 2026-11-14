"""Patch only verified Word slots; preserve every other package part verbatim."""
from collections import defaultdict
import hashlib
import io
import zipfile
from xml.dom import minidom

from .mapping import (CRF_TEMPLATE_SHA256, PFT_COMPONENT_LABELS, PFT_REPEATED_ROWS,
                      PFT_TEMPLATE_ROWS, checkbox_groups, validate_mapping, NS)

W=NS['w']


def elements(node):return [n for n in node.childNodes if n.nodeType==n.ELEMENT_NODE]


def texts(node):return list(node.getElementsByTagNameNS(W,'t'))


def content(node):return ''.join(n.data for t in texts(node) for n in t.childNodes if n.nodeType==n.TEXT_NODE)


def replace_text(document,node,value):
    nodes=texts(node)
    if not nodes:raise ValueError('Expected a text slot')
    for t in nodes:
        while t.firstChild:t.removeChild(t.firstChild)
    nodes[0].appendChild(document.createTextNode(value))
    nodes[0].setAttribute('xml:space','preserve')


def display(value):
    kind=value.get('result_type')
    if kind=='missing':return value.get('result_raw') or '[source placeholder]'
    parts=[]
    if value.get('numeric_value') is not None:
        parts.append(('' if value.get('comparator')=='=' else value.get('comparator') or '')+value['numeric_value'])
    for k in ('qualitative_value','text_value','symbolic_value','pattern_raw','grade_raw','class_raw','titre_raw','source_flag_raw'):
        if value.get(k) is not None:parts.append(value[k])
    if not parts:parts.append(value.get('result_raw') or '[no printable value]')
    if value.get('unit_raw'):parts.append(value['unit_raw'])
    if value.get('source_date'):parts.append('('+value['source_date']+'; '+(value.get('date_type') or '')+')')
    return ' '.join(parts)


def fill_binding(document, target, label, binding, value):
    if content(label) != binding['expected_label_text'] or content(target) != binding['expected_target_text']:
        raise ValueError('Word slot label or placeholder differs from its verified binding')
    if binding.get('inline'):
        placeholder = texts(target)[-1]
        if not placeholder.firstChild or placeholder.firstChild.data.strip('…'):
            raise ValueError('Inline CRF placeholder changed')
        placeholder.firstChild.data = value
    else:
        replace_text(document,target,value)


def write_reviewed_scores(document, blocks, scores):
    """Fill the score blocks of the verified Lupiva template."""
    for field_id, index in [('EAC22', 85), ('SDA25', 93)]:
        if field_id not in scores:
            continue
        target = texts(blocks[index])[-1]
        if 'Total = ' not in content(blocks[index]) or not scores[field_id].isdigit():
            raise ValueError('Invalid CRF total slot or value')
        target.firstChild.data = target.firstChild.data.split('=')[0] + '= ' + scores[field_id]

    columns = [[], []]
    for row in (node for node in elements(blocks[86]) if node.localName == 'tr'):
        cells = [node for node in elements(row) if node.localName == 'tc']
        for column, index in enumerate((2, 5)):
            if index < len(cells):
                columns[column].extend(cells[index].getElementsByTagNameNS(W, 'checkBox'))
    if tuple(map(len, columns)) != (17, 4):
        raise ValueError('EULAR checkbox layout changed')
    for i, box in enumerate(columns[0] + columns[1], 1):
        answer = scores.get(f'EAC{i:02}')
        if answer:
            val = '1' if answer == 'yes' else '0'
            defaults = box.getElementsByTagNameNS(W, 'default')
            if defaults:
                defaults[0].setAttributeNS(W, 'w:val', val)
            checked = document.createElementNS(W, 'w:checked')
            checked.setAttributeNS(W, 'w:val', val)
            box.appendChild(checked)

    rows = [node for node in elements(blocks[94]) if node.localName == 'tr']
    if len(rows) != 25:
        raise ValueError('SLEDAI table layout changed')
    for i, row in enumerate(rows[1:], 1):
        answer = scores.get(f'SDA{i:02}')
        if answer:
            cell = [node for node in elements(row) if node.localName == 'tc'][1]
            label = texts(cell)[-1]
            label.appendChild(document.createTextNode(' ☑' if answer == 'yes' else ' (Không)'))
            label.setAttribute('xml:space', 'preserve')


def reviewed_word(template,mapping,dictionary,values,score_values=None,checkbox_values=None):
    """Export the exact final CRF selections, including fields without a safe cell."""
    fields=validate_mapping(mapping,dictionary)
    original=template.read_bytes()
    if hashlib.sha256(original).hexdigest()!=mapping['template_sha256']:
        raise ValueError('Word template hash mismatch')
    grouped=defaultdict(list)
    exact_template = mapping['template_sha256'] == CRF_TEMPLATE_SHA256
    scores = score_values if exact_template else None
    groups = checkbox_groups() if exact_template else {}
    pft_fields = {f'PFT{i:02}': row for i, row in enumerate(PFT_TEMPLATE_ROWS,1)} if exact_template else {}
    boxes = {field: checkbox_values[field] for field,codes in groups.values()
             if checkbox_values and (checkbox_values.get(field) in codes
                                     or field == 'LUNG02' and checkbox_values.get(field) in ('no','unknown')
                                     or fields[field]['word']['binding']
                                     and fields[field]['word']['binding'].get('inline')
                                     and checkbox_values.get(field) in ('no','unknown'))}
    for slot,value in values.items():
        fid,component=slot.split('/',1)
        if (scores and fid in scores) or (fid in boxes and component == 'result'
                                         and (fid != 'LUNG02' or boxes[fid] == 'yes')
                                         and not (fields[fid]['word']['binding'] or {}).get('inline')):
            continue
        if fid in pft_fields and component in PFT_COMPONENT_LABELS:
            continue
        grouped[fid].append(value if component=='result' else f'{component}: {value}')
    output=io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(original)) as source:
        document=minidom.parseString(source.read('word/document.xml'))
        body=document.getElementsByTagNameNS(W,'body')[0]
        blocks=elements(body)
        if scores:
            write_reviewed_scores(document, blocks, scores)
        for (block, row, column), (field, codes) in groups.items():
            if field not in boxes:
                continue
            target = blocks[block-1]
            if row:
                rows = [node for node in elements(target) if node.localName == 'tr']
                target = [node for node in elements(rows[row-1]) if node.localName == 'tc'][column-1]
            controls = target.getElementsByTagNameNS(W, 'checkBox')
            if len(controls) != len(codes):
                raise ValueError('CRF checkbox layout changed')
            for control, code in zip(controls, codes):
                value = '1' if code == boxes[field] else '0'
                for default in control.getElementsByTagNameNS(W, 'default'):
                    default.setAttributeNS(W, 'w:val', value)
                for existing in list(control.getElementsByTagNameNS(W, 'checked')):
                    control.removeChild(existing)
                checked = document.createElementNS(W, 'w:checked')
                checked.setAttributeNS(W, 'w:val', value)
                control.appendChild(checked)
        def cell(anchor):
            b,r,c=(int(part[1:])-1 for part in anchor.split('.'))
            row=[n for n in elements(blocks[b]) if n.localName=='tr'][r]
            return [n for n in elements(row) if n.localName=='tc'][c]
        if pft_fields:
            for field, row in pft_fields.items():
                parts = [f'{label}: {values[field+"/"+component]}' for component,label in PFT_COMPONENT_LABELS.items()
                         if field+'/'+component in values]
                if parts:
                    replace_text(document,cell(f'B65.R{row}.C2'),' · '.join(parts))
                    if row + 1 in PFT_REPEATED_ROWS:
                        replace_text(document,cell(f'B65.R{row+1}.C2'),'')
        appendix=[]
        for fid,items in grouped.items():
            field=fields[fid];binding=field['word']['binding'];value='; '.join(items)
            if not binding:
                appendix.append(f"{field['label']} — {value}")
                continue
            target=cell(binding['anchor'])
            fill_binding(document,target,cell(binding['label_anchor']),binding,value)
        if not exact_template:
            for field in fields.values():
                binding=field['word']['binding']
                if binding and not binding.get('inline') and field['field_id'] not in grouped:
                    replace_text(document,cell(binding['anchor']),'')
        if appendix:
            section=next((b for b in blocks if b.localName=='sectPr'),None)
            for line in ['Các mục đã duyệt chưa có ô điền xác định trong mẫu',*appendix]:
                paragraph=document.createElementNS(W,'w:p');run=document.createElementNS(W,'w:r');text=document.createElementNS(W,'w:t')
                text.appendChild(document.createTextNode(line));run.appendChild(text);paragraph.appendChild(run)
                body.insertBefore(paragraph,section)
        with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as out:
            for info in source.infolist():
                out.writestr(info,document.toxml(encoding='UTF-8') if info.filename=='word/document.xml' else source.read(info))
    return output.getvalue()


def export_word(snapshot,template,mapping,dictionary,path,*,registry_code,encounter_id=None,patient_summary=False):
    fields=validate_mapping(mapping,dictionary)
    original=template.read_bytes()
    if hashlib.sha256(original).hexdigest()!=mapping['template_sha256']:
        raise ValueError('Word template hash mismatch')
    case=next((c for c in snapshot['cases'] if c['registry_code']==registry_code),None)
    if not case:raise ValueError('Unknown registry code')
    if patient_summary and encounter_id is not None:raise ValueError('Choose patient summary or one visit')
    visit=next((v for v in snapshot['encounters'] if v['encounter_id']==encounter_id and v['case_id']==case['case_id']),None)
    if not patient_summary and not visit:raise ValueError('Select one explicitly confirmed visit for this case')
    selected=[o for o in snapshot['observations'] if o['case_id']==case['case_id'] and
              (patient_summary or o['encounter_id']==encounter_id)]
    if not selected:raise ValueError('Selected visit has no accepted results')
    with zipfile.ZipFile(template) as source:
        xml=source.read('word/document.xml')
        document=minidom.parseString(xml)
        body=document.getElementsByTagNameNS(W,'body')[0]
        slots={}
        blocks=elements(body)
        for b,block in enumerate(blocks,1):
            if block.localName!='tbl':continue
            rows=[n for n in elements(block) if n.localName=='tr']
            for r,row in enumerate(rows,1):
                for c,cell in enumerate([n for n in elements(row) if n.localName=='tc'],1):
                    slots[f'B{b}.R{r}.C{c}']=cell
        grouped=defaultdict(list);unbound=[]
        for o in selected:
            binding=fields[o['field_id']]['word']['binding']
            if binding:grouped[o['field_id']].append(o)
            else:unbound.append(o['observation_id'])
        filled=[]
        for fid,observations in grouped.items():
            binding=fields[fid]['word']['binding']
            target=slots[binding['anchor']];label=slots[binding['label_anchor']]
            formatted=[(('' if len(observations)==1 and o['component']=='result' else o['component']+': ')+display(o['value']))
                       for o in observations]
            fill_binding(document,target,label,binding,'; '.join(formatted))
            filled.append(dict(field_id=fid,anchor=binding['anchor'],observations=[o['observation_id'] for o in observations]))
        title=next((b for b in blocks if b.localName=='p' and content(b).strip()=='CASE REPORT FORM'),None)
        if title is None:raise ValueError('Expected original title not found')
        replace_text(document,title,'CASE REPORT FORM'+('  DEMO' if snapshot['synthetic'] else ''))
        # Clone the reference paragraph pattern. Add identity after the title,
        # without substituting registry_code for the distinct Study ID slot.
        def paragraph(text,page_break=False):
            p=document.createElementNS(W,'w:p')
            prop=document.createElementNS(W,'w:pPr')
            spacing=document.createElementNS(W,'w:spacing');spacing.setAttribute('w:after','80');prop.appendChild(spacing)
            if page_break:
                prop.appendChild(document.createElementNS(W,'w:pageBreakBefore'))
            p.appendChild(prop)
            run=document.createElementNS(W,'w:r');p.appendChild(run)
            rp=document.createElementNS(W,'w:rPr');run.appendChild(rp)
            font=document.createElementNS(W,'w:rFonts');font.setAttribute('w:ascii','Times New Roman');font.setAttribute('w:hAnsi','Times New Roman');rp.appendChild(font)
            size=document.createElementNS(W,'w:sz');size.setAttribute('w:val','20');rp.appendChild(size)
            t=document.createElementNS(W,'w:t');t.appendChild(document.createTextNode(text));run.appendChild(t)
            return p
        note=('DỮ LIỆU GIẢ LẬP / SYNTHETIC DEMO. ' if snapshot['synthetic'] else '')+'Registry: '+registry_code+(
            '; tổng hợp hồ sơ bệnh nhân.' if patient_summary else '; visit: '+(visit['event_date'] or '[date absent]')+'.')
        following=next((n for n in elements(body) if blocks.index(n)>blocks.index(title)),None)
        if following is not None and following.localName=='p' and not content(following).strip():
            # The retained template has one blank 12pt paragraph B2. Reuse it
            # instead of moving every later table down by an extra paragraph.
            run=paragraph(note).getElementsByTagNameNS(W,'r')[0]
            run.getElementsByTagNameNS(W,'sz')[0].setAttribute('w:val','24')
            following.appendChild(run)
        else:
            body.insertBefore(paragraph(note),title.nextSibling)
        # All selected measurements retain a printable source link, including
        # those for which a safe original-template slot is still unresolved.
        section=next((b for b in elements(body) if b.localName=='sectPr'),None)
        def add(text,page_break=False):body.insertBefore(paragraph(text,page_break),section)
        add('Kết quả và nguồn của hồ sơ bệnh nhân' if patient_summary else 'Kết quả và nguồn cho lần ghi nhận đã chọn',True)
        add('Registry '+registry_code+'. '+('Tổng hợp mọi tài liệu đã liên kết. Giữ riêng từng kết quả và ngày nguồn; chưa suy lần khám.'
            if patient_summary else visit['label']+'. Ngày lần khám: '+(visit['event_date'] or 'chưa ghi nhận')+'.'))
        add('Study ID: '+(case['study_id'] or 'chưa ghi nhận')+'. Ngày lần khám không thay thế ngày xét nghiệm. Các ô khác giữ nguyên mẫu.')
        for o in sorted(selected,key=lambda o:(o['field_id'],o['component'],o['observation_id'])):
            f=fields[o['field_id']]
            add(o['field_id']+' '+f['label']+' ['+o['component']+']: '+display(o['value']))
            add('Nguồn '+o['document_id']+'; '+o['observation_id']+'.')
            if o['observation_id'] in unbound:add('Chưa có vị trí điền an toàn trong mẫu; giá trị được giữ tại phụ lục này.')
        changed={'word/document.xml':document.toxml(encoding='UTF-8')}
        # Footer PAGE fields retain their original definitions; request native
        # Word to refresh cached field results when the file opens.
        if 'word/settings.xml' in source.namelist():
            settings=minidom.parseString(source.read('word/settings.xml'))
            updates=settings.getElementsByTagNameNS(W,'updateFields')
            update=updates[0] if updates else settings.createElementNS(W,'w:updateFields')
            update.setAttribute('w:val','true')
            if not updates:settings.documentElement.appendChild(update)
            changed['word/settings.xml']=settings.toxml(encoding='UTF-8')
        report=dict(schema_version='registry-word-export-0.1',registry_code=registry_code,case_id=case['case_id'],
            encounter_id=encounter_id,scope='whole_patient' if patient_summary else 'selected_visit',
            synthetic=snapshot['synthetic'],snapshot_sha256=snapshot['snapshot_sha256'],
            template_sha256=mapping['template_sha256'],selected_observations=len(selected),filled_slots=filled,
            unbound_observations=unbound,source_links=[dict(observation_id=o['observation_id'],document_id=o['document_id'],
                package_id=o['package_id'],revision=o['revision'],review_ids=o['review_ids'],evidence_ids=o['evidence_ids']) for o in selected],
            field_refresh='Word updateFields requested; original PAGE definitions preserved',
            changed_parts=list(changed),preserve_only_parts=[n for n in source.namelist() if n not in changed])
        with zipfile.ZipFile(path,'x',compression=zipfile.ZIP_DEFLATED) as out:
            for info in source.infolist():out.writestr(info,changed.get(info.filename,source.read(info.filename)))
    report['output_sha256']=hashlib.sha256(path.read_bytes()).hexdigest()
    return report
