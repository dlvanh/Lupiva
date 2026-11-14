"""Versioned mapping of the Word catalog to a repeating REDCap result form."""
from pathlib import Path
import hashlib
import re
import zipfile
import xml.etree.ElementTree as ET

from ocr_pool.rules import key
from registry_pool.dictionary import digest

NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W='{'+NS['w']+'}'
CRF_TEMPLATE_SHA256 = 'a5ef44c70ef74d2a9bd180ea1377ce8ce6f754b7b817042805ce93ffaef7e76d'
INLINE_WORD_FIELDS = {'CV06': ('B62.R6.C1', ' Pericardial effusion: …………………')}
THREE_WAY_ROWS = {
    (47, 2): 'SKN01', (50, 3): 'MUS02', (53, 2): 'JNT01', (53, 8): 'JNT05',
    (53, 11): 'JNT06', (53, 14): 'JNT07', (56, 8): 'REN07', (59, 13): 'HEM12',
    (62, 2): 'CV01', (65, 21): 'LUNG01', (68, 2): 'NEU01', (71, 5): 'GI04',
}
THREE_WAY_CHOICES = ('yes', 'no', 'unknown')
PARAGRAPH_CHOICES = {
    12: ('HIS02', ('no',)), 13: ('HIS02', ('yes',)),
    16: ('HIS03', ('no',)), 17: ('HIS03', ('yes',)),
    19: ('HIS04', ('no',)), 20: ('HIS04', ('yes',)),
    25: ('HIS11', ('yes', 'no')), 32: ('HIS15', THREE_WAY_CHOICES),
    39: ('TRT01', ('no',)), 40: ('TRT01', ('yes',)),
}
CELL_CHOICES = {
    (42, 2, 1): ('TRT02', ('medication',)),
    (42, 3, 1): ('TRT02', ('vaccine',)),
    (42, 4, 1): ('TRT02', ('other',)),
    (50, 8, 1): ('MUS06', ('no', 'yes')),
    (53, 16, 1): ('JNT08', ('no', 'yes')),
    (56, 12, 1): ('REN10', ('no', 'yes')),
    (56, 13, 1): ('REN13', ('no', 'yes')),
    (62, 6, 1): ('CV06', ('yes',)),
    (65, 23, 1): ('LUNG02', ('yes',)),
}
PFT_TEMPLATE_ROWS = (1, 3, 5, 7, 8, 9, 11, 13, 14, 16, 18)
PFT_REPEATED_ROWS = (2, 4, 6, 10, 12, 15, 17, 19)
PFT_COMPONENT_LABELS = {
    'pre_measured': 'Pre', 'pre_percent_predicted': 'Pre · % dự đoán',
    'post_measured': 'Post', 'post_percent_predicted': 'Post · % dự đoán',
}


def checkbox_groups():
    """Return the reviewed field and option order at each template location."""
    return {
        **{(block, 0, 0): spec for block, spec in PARAGRAPH_CHOICES.items()},
        **CELL_CHOICES,
        **{(block, row, cell): (field, (value,))
           for (block, row), field in THREE_WAY_ROWS.items()
           for cell, value in enumerate(THREE_WAY_CHOICES, 1)},
    }

def review_layout(template, mapping):
    """Read original block order and safe interactive cell bindings."""
    with zipfile.ZipFile(template) as archive:
        body=ET.fromstring(archive.read('word/document.xml')).find('w:body',NS)
    bound={f['word']['binding']['anchor']:f['field_id'] for f in mapping['fields'] if f['word']['binding']}
    inline = {f['word']['binding']['anchor'] for f in mapping['fields']
              if f['word']['binding'] and f['word']['binding'].get('inline')}
    def printable(node):
        return ''.join((part.text or '') if part.tag==W+'t' else '☐ ' if part.tag==W+'checkBox' else '\t'
                       for part in node.iter() if part.tag in {W+'t',W+'checkBox',W+'tab'})
    blocks=[]
    groups = checkbox_groups() if mapping['template_sha256'] == CRF_TEMPLATE_SHA256 else {}
    pft_rows = dict(zip(PFT_TEMPLATE_ROWS, (f'PFT{i:02}' for i in range(1, 12)))) if groups else {}

    def choices(node, location):
        spec = groups.get(location)
        if spec is None:
            return {}
        field, codes = spec
        if len(list(node.iter(W+'checkBox'))) != len(codes):
            raise ValueError('CRF checkbox layout changed')
        return dict(checkbox_slot=field+'/result', checkbox_values=list(codes))
    for index,block in enumerate(body,1):
        if block.tag==W+'p':
            text=printable(block)
            if text.strip():blocks.append(dict(index=index,text=text,**choices(block,(index,0,0))))
        elif block.tag==W+'tbl':
            rows=[];merged={}
            for r,row in enumerate(block.findall('w:tr',NS),1):
                cells=[];next_merged={};column=0
                for c,cell in enumerate(row.findall('w:tc',NS),1):
                    anchor=f'B{index}.R{r}.C{c}'
                    paragraphs=[printable(p) for p in cell.findall('w:p',NS)]
                    span=cell.find('w:tcPr/w:gridSpan',NS)
                    width=int(span.get(W+'val','1')) if span is not None else 1
                    merge=cell.find('w:tcPr/w:vMerge',NS)
                    if merge is not None and merge.get(W+'val')!='restart' and column in merged:
                        item=merged[column];item['row_span']+=1;next_merged[column]=item
                    else:
                        item=dict(text='\n'.join(paragraphs),span=width,row_span=1,field_id=bound.get(anchor))
                        if anchor in inline:
                            item['inline_label'] = item['text'].lstrip('☐ ').rstrip('…').strip()
                        item.update(choices(cell,(index,r,c)))
                        if item.get('checkbox_slot') == 'LUNG02/result':
                            item['field_id'] = 'LUNG02'
                            item['inline_label'] = item['text'].lstrip('☐ ').strip()
                        if index == 65 and c == 2 and pft_rows:
                            if r in pft_rows:
                                item['field_id'] = pft_rows[r]
                            elif r in PFT_REPEATED_ROWS:
                                item['text'] = ''
                        cells.append(item)
                        if merge is not None:next_merged[column]=item
                    column+=width
                rows.append(cells);merged=next_merged
            blocks.append(dict(index=index,rows=rows))
    return blocks

def template_cells(template):
    with zipfile.ZipFile(template) as archive:
        body=ET.fromstring(archive.read('word/document.xml')).find('w:body',NS)
    cells=[]
    for block_index,block in enumerate(body,1):
        if block.tag!=W+'tbl':
            continue
        for row_index,row in enumerate(block.findall('w:tr',NS),1):
            row_cells=row.findall('w:tc',NS)
            for cell_index,cell in enumerate(row_cells,1):
                cells.append(dict(block=block_index,row=row_index,cell=cell_index,
                    anchor=f'B{block_index}.R{row_index}.C{cell_index}',
                    text=''.join(t.text or '' for t in cell.iter(W+'t')),
                    row_cell_count=len(row_cells)))
    return cells

def context_blocks(text):
    head=text.split('.',1)[0]
    numbers=[int(v) for v in re.findall(r'\d+',head)]
    return set(range(numbers[0],numbers[-1]+1)) if numbers else set()

def build_mapping(dictionary,template):
    template=Path(template)
    checksum=hashlib.sha256(template.read_bytes()).hexdigest()
    if checksum.upper()!=dictionary['template_sha256'].upper():
        raise ValueError('Word template differs from the dictionary authority')
    cells=template_cells(template)
    fields=[]
    for field in dictionary['fields']:
        allowed=context_blocks(field['source_context'])
        # Bind only an exact row label followed by an explicit result placeholder.
        # Compound checkbox rows, merged sections and repeated PFT slots remain
        # unresolved rather than guessed from their position.
        labels=[c for c in cells if c['block'] in allowed and c['cell']==1 and
                key(c['text'])==key(field['label']) and c['row_cell_count']==2]
        bindings=[]
        for label in labels:
            target=next(c for c in cells if (c['block'],c['row'],c['cell'])==
                        (label['block'],label['row'],2))
            if 'ketquatrichxuat' in key(target['text']):
                bindings.append(dict(anchor=target['anchor'],label_anchor=label['anchor'],
                    expected_label_text=label['text'],expected_target_text=target['text']))
        binding=bindings[0] if len(bindings)==1 else None
        if checksum == CRF_TEMPLATE_SHA256 and field['field_id'] in INLINE_WORD_FIELDS:
            anchor, text = INLINE_WORD_FIELDS[field['field_id']]
            if not any(c['anchor'] == anchor and c['text'] == text for c in cells):
                raise ValueError('Inline CRF slot differs from the verified template')
            binding = dict(anchor=anchor,label_anchor=anchor,expected_label_text=text,
                           expected_target_text=text,inline=True)
        fields.append(dict(field_id=field['field_id'],label=field['label'],section=field['section'],
            source_type=field['source_type'],source_context=field['source_context'],
            components=[c['component_id'] for c in field['components']],
            parser_components=[c['component_id'] for c in field['components'] if c['parser_implemented']],
            redcap=dict(form='pool_results',field_id_value=field['field_id'],
                component_variable='component',value_variables=['numeric_value','qualitative_value','text_value'],
                repeat_policy='one_source_observation_per_instance'),
            word=dict(status='exact_label_and_placeholder' if binding else 'unresolved',binding=binding,
                policy='preserve_each_measurement; unresolved values go to a labelled appendix'),
            semantic_status=field['semantic_review_status']))
    result=dict(mapping_version='registry-export-mapping-0.1-draft',status='draft_new_redcap_project',
        dictionary_version=dictionary['dictionary_version'],dictionary_sha256=digest(dictionary),
        template_sha256=checksum,field_count=len(fields),component_count=sum(len(f['components']) for f in fields),
        redcap_design='nonlongitudinal_project_with_repeating_forms_and_explicit_visit_links',
        repeat_forms=['registry_visits','pool_results','source_metadata','sample_collection'],fields=fields)
    result['mapping_sha256']=digest(result)
    return result

def validate_mapping(mapping,dictionary):
    body={k:v for k,v in mapping.items() if k!='mapping_sha256'}
    if digest(body)!=mapping.get('mapping_sha256'):
        raise ValueError('Mapping content/hash mismatch')
    if mapping['dictionary_sha256']!=digest(dictionary):
        raise ValueError('Mapping dictionary differs')
    fields={f['field_id']:f for f in mapping['fields']}
    if len(fields)!=len(mapping['fields']) or set(fields)!={f['field_id'] for f in dictionary['fields']}:
        raise ValueError('Mapping must cover every catalog field exactly once')
    for f in dictionary['fields']:
        if set(fields[f['field_id']]['components'])!={c['component_id'] for c in f['components']}:
            raise ValueError('Mapping component coverage differs')
    return fields
