"""Exercise source prefill, grounded proposals and final review with synthetic data."""
import time
from pathlib import Path
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
from xml.etree import ElementTree
from zipfile import ZipFile

from registry_review.crf import CRFReview, calculated_bmi, form_fields, form_finding_proposals, model_facts
from registry_review.crf_scores import EULAR_IDS, SLEDAI_IDS, evaluate_scores
from registry_review.crf_knowledge import FINDINGS_VERSION, VERSION as KNOWLEDGE_VERSION, knowledge_library, load_knowledge, read_knowledge
from registry_export.mapping import NS, THREE_WAY_ROWS, build_mapping, checkbox_groups, review_layout
from registry_export.word import reviewed_word
from registry_review.workspace import StalePatient
from test_patient_workspace import PatientWorkspaceTests
from test_source_review import DICTIONARY


class CRFReviewTests(PatientWorkspaceTests):
    def test_ternary_choices_preserve_explicit_source_answers_and_missing_state(self):
        for raw, expected in [('Có','yes'), ('No','no'), ('Chưa rõ','unknown'), (None,None)]:
            source = dict(kind='observation', field_id='CV01', component='result', selection_id='echo',
                          current_revision=True, review_status='pending', value=dict(qualitative_value=raw,
                          result_type='qualitative' if raw is not None else 'missing'))
            workspace = dict(candidates=[source], case={})
            field = next(f for f in form_fields(DICTIONARY, workspace) if f['slot'] == 'CV01/result')
            self.assertEqual([option['value'] for option in field['options']], [expected] if expected else [])
            self.assertEqual([option['value'] for option in field['manual_options']], ['yes','no','unknown'])
            if expected:
                self.assertEqual(field['options'][0]['sources'], ['echo'])

    def test_form_findings_use_documented_observations_and_leave_insufficient_fields_blank(self):
        def source(field, value, **details):
            return dict(kind='observation', field_id=field, component='result', selection_id=field, document_id='report',
                        current_revision=True, review_status='pending', confidence={},
                        value=dict(qualitative_value=value, result_type='qualitative', **details))

        echo = source('CV06', 'yes', extraction_method='local_ocr', flags=['explicit_report_finding'])
        candidates = [echo, source('SKN08', 'yes'), source('GI06', 'yes'),
                      source('LUNG02', 'no'), source('REN11', 'Class IV'), source('HEM05', '3.2')]
        rules = read_knowledge(self.store.db, FINDINGS_VERSION)['rules']
        proposals = form_finding_proposals(dict(candidates=candidates), rules)
        self.assertEqual(set(proposals), {'CV01/result','SKN01/result','GI04/result','REN10/result'})
        self.assertEqual(proposals['CV01/result']['sources'], ['CV06'])
        self.assertEqual(proposals['CV01/result']['knowledge_version'], FINDINGS_VERSION)
        app = SimpleNamespace(bundles={}, exports=SimpleNamespace(configuration=lambda: (DICTIONARY, None, {})))
        crf = CRFReview(app)
        case_id = self.case['case_id']
        with patch('registry_review.crf.patient_workspace', return_value=dict(
                candidates=[{**echo, 'package_id':'test', 'revision':1, 'evidence_ids':[]}],
                case=self.case, review_snapshot_sha256='fixture')):
            view = crf.view(self.store, case_id)
            field = next(item for item in view['fields'] if item['slot'] == 'CV01/result')
            receipt = crf.approve(self.store, case_id=case_id, source_snapshot=view['source_snapshot'],
                draft_sha256=view['draft_sha256'], selections={'CV01/result':field['proposal']['id']}, **self.person)
        self.assertEqual(receipt['values']['CV01/result']['origin'], 'knowledge_rule')
        self.assertEqual(receipt['values']['CV01/result']['sources'], ['CV06'])
        self.assertIn('CV06', receipt['sources'])
        candidates.append({**echo, 'selection_id':'other', 'value':{**echo['value'], 'qualitative_value':'no'}})
        self.assertNotIn('CV01/result', form_finding_proposals(dict(candidates=candidates), rules))

    def test_ild_checkbox_and_reviewed_negative_export(self):
        template = next(Path(__file__).resolve().parents[1].glob('260825*.docx'))
        mapping = build_mapping(DICTIONARY, template)
        lungs = next(block for block in review_layout(template,mapping) if block['index']==65)
        self.assertEqual(lungs['rows'][22][0]['checkbox_values'], ['yes'])
        self.assertEqual(lungs['rows'][22][0]['field_id'], 'LUNG02')
        for value, checked in [('yes','1'), ('no','0'), ('unknown','0')]:
            with self.subTest(value=value):
                body=reviewed_word(template,mapping,DICTIONARY,{'LUNG02/result':value},
                                   checkbox_values={'LUNG02':value})
                with ZipFile(BytesIO(body)) as archive:
                    root=ElementTree.fromstring(archive.read('word/document.xml')).find('w:body',NS)
                cell=root[64].findall('w:tr',NS)[22].findall('w:tc',NS)[0]
                self.assertEqual(cell.find('.//w:checkBox/w:checked',NS).get('{'+NS['w']+'}val'),checked)
                appendix=[t.text for p in root.findall('w:p',NS) for t in p.findall('.//w:t',NS)]
                self.assertEqual('Interstitial lung disease (ILD) — '+value in appendix, value != 'yes')

    def test_pericardial_effusion_uses_inline_template_placeholder(self):
        template = next(Path(__file__).resolve().parents[1].glob('260825*.docx'))
        mapping = build_mapping(DICTIONARY, template)
        table = next(block for block in review_layout(template,mapping) if block['index']==62)
        self.assertEqual(table['rows'][5][0]['field_id'],'CV06')
        self.assertEqual(table['rows'][5][0]['inline_label'],'Pericardial effusion:')
        self.assertEqual(table['rows'][5][0]['checkbox_values'],['yes'])
        for value,checked in [('yes','1'),('no','0'),('unknown','0')]:
            with self.subTest(value=value):
                body=reviewed_word(template,mapping,DICTIONARY,{'CV06/result':value},
                                   checkbox_values={'CV06':value})
                with ZipFile(BytesIO(body)) as archive:
                    root = ElementTree.fromstring(archive.read('word/document.xml')).find('w:body', NS)
                row = root[61].findall('w:tr',NS)[5]
                cell = row.findall('w:tc',NS)[0]
                self.assertEqual(''.join(t.text or '' for t in cell.findall('.//w:t',NS)),
                                 ' Pericardial effusion: '+value)
                self.assertEqual(cell.find('.//w:checkBox/w:checked',NS).get('{'+NS['w']+'}val'),checked)

    def test_pft_uses_original_template_row_with_explicit_source_components(self):
        template = next(Path(__file__).resolve().parents[1].glob('260825*.docx'))
        mapping = build_mapping(DICTIONARY, template)
        table = next(block for block in review_layout(template,mapping) if block['index']==65)
        self.assertEqual(table['rows'][4][1]['field_id'],'PFT03')
        self.assertEqual(table['rows'][5][1]['text'],'')
        values = {'PFT03/pre_measured':'2.4 L','PFT03/pre_percent_predicted':'80 %',
                  'PFT03/post_measured':'2.6 L','PFT05/pre_measured':'73 %'}
        with ZipFile(BytesIO(reviewed_word(template,mapping,DICTIONARY,values))) as archive:
            root = ElementTree.fromstring(archive.read('word/document.xml')).find('w:body', NS)
        rows = root[64].findall('w:tr',NS)
        def value(row):
            return ''.join(t.text or '' for t in rows[row-1].findall('w:tc',NS)[1].findall('.//w:t',NS))
        self.assertEqual(value(5),'Pre: 2.4 L · Pre · % dự đoán: 80 % · Post: 2.6 L')
        self.assertEqual(value(6),'')
        self.assertEqual(value(8),'Pre: 73 %')
        with ZipFile(template) as archive:
            original = ElementTree.fromstring(archive.read('word/document.xml')).find('w:body',NS)
        original_rows = original[64].findall('w:tr',NS)
        self.assertEqual(ElementTree.tostring(rows[0]), ElementTree.tostring(original_rows[0]))

    def test_reviewed_word_preserves_unfilled_template_cells(self):
        template = next(Path(__file__).resolve().parents[1].glob('260825*.docx'))
        mapping = build_mapping(DICTIONARY,template)
        with ZipFile(template) as source, ZipFile(BytesIO(reviewed_word(template,mapping,DICTIONARY,{}))) as output:
            for name in source.namelist():
                if name == 'word/document.xml':
                    self.assertEqual(ElementTree.tostring(ElementTree.fromstring(source.read(name))),
                                     ElementTree.tostring(ElementTree.fromstring(output.read(name))))
                else:
                    self.assertEqual(source.read(name),output.read(name))

    def test_database_knowledge_keeps_distinct_blood_count_thresholds_and_requires_review(self):
        rules = load_knowledge(self.store.db)
        self.assertEqual(rules['EAC02']['below'], '4')
        self.assertEqual(rules['SDA24']['below'], '3')
        source = dict(kind='observation', field_id='HEM05', component='result', selection_id='wbc',
                      document_id='cbc', confidence={}, review_status='pending',
                      value=dict(numeric_value='3.5', unit_raw='10⁹/L', comparator='=',
                                 source_date='2026-11-04'))
        report = evaluate_scores({'date':'2026-11-13'}, [source], {}, rules=rules)
        # 3.5 is leukopenia for EULAR/ACR (<4) and a measured "no" for SLEDAI-2K (<3).
        self.assertEqual(set(report['suggestions']), {'EAC02', 'SDA24'})
        self.assertEqual(report['suggestions']['SDA24']['value'], 'no')
        self.assertTrue(report['suggestions']['SDA24']['requires_confirmation'])
        proposal = report['suggestions']['EAC02']
        self.assertEqual(proposal['knowledge_version'], KNOWLEDGE_VERSION)
        self.assertTrue(proposal['requires_confirmation'])
        self.assertEqual(report['values'], {})
        source['value']['numeric_value'] = '2.9'
        report = evaluate_scores({'date':'2026-11-13', 'criteria':{'SDA24':'yes'}}, [source], {}, rules=rules)
        self.assertEqual(set(report['suggestions']), {'EAC02','SDA24'})
        self.assertEqual(report['values']['SDA24/result']['sources'], ['wbc'])
        self.assertIn('source_url', report['values']['SDA24/result'])
        self.assertNotIn('SDA24', evaluate_scores({'date':'2026-11-15'}, [source], {}, rules=rules)['suggestions'])
        source['value']['unit_raw'] = 'G/L'
        self.assertIn('SDA24', evaluate_scores({'date':'2026-11-13'}, [source], {}, rules=rules)['suggestions'])
        source['value']['unit_raw'] = 'g/L'
        self.assertEqual(evaluate_scores({'date':'2026-11-13'}, [source], {}, rules=rules)['suggestions'], {})
        source['value']['unit_raw'] = '%'
        self.assertEqual(evaluate_scores({'date':'2026-11-13'}, [source], {}, rules=rules)['suggestions'], {})

    def test_knowledge_library_and_strict_evidence_for_new_criteria(self):
        library = knowledge_library(self.store.db)
        self.assertEqual(library['version'], KNOWLEDGE_VERSION)
        self.assertEqual(read_knowledge(self.store.db, library['version'])['sha256'], library['sha256'])
        self.assertIn('REN01', library['rules']['EAC15']['fields'])

        def source(field, **value):
            return dict(kind='observation', field_id=field, component='result', selection_id=field,
                        document_id='report', confidence={}, review_status='pending',
                        value={'source_date':'2026-11-06', **value})

        sources = [source('REN01', numeric_value='0.51', unit_raw='mg/mg'),
                   source('REN02', numeric_value='6', unit_raw='RBC/HPF'),
                   source('REN03', numeric_value='5', unit_raw='WBC/HPF'),
                   source('ANA08', qualitative_value='Dương tính', result_raw='17 Dương tính'),
                   source('IMM05', numeric_value='42', unit_raw='GPL'),
                   source('CV06', qualitative_value='yes', extraction_method='local_ocr',
                          flags=['explicit_report_finding'])]
        assessment = {'date':'2026-11-14'}
        report = evaluate_scores(assessment, sources, {}, rules=library['rules'])
        self.assertEqual(set(report['suggestions']), {'EAC12','EAC15','EAC18','EAC21','SDA12','SDA13','SDA14'})
        self.assertEqual(report['suggestions']['SDA14']['value'], 'no')     # 5 WBC/HPF is not above 5
        self.assertEqual({k for k, v in report['suggestions'].items() if v['value'] == 'no'}, {'SDA14'})
        self.assertTrue(all(item['requires_confirmation'] for item in report['suggestions'].values()))
        self.assertFalse(report['values'])
        sources[3]['value']['result_raw'] = '17 Không dương tính'
        self.assertNotIn('EAC21', evaluate_scores(assessment, sources, {})['suggestions'])
        for row, value in zip(sources, [dict(unit_raw='g/L'), dict(unit_raw='cells/µL'), {},
                                        dict(qualitative_value='(+)', class_raw='(+)'), dict(unit_raw='U/mL'),
                                        dict(extraction_method='gemini_api')]):
            row['value'].update(value)
        # No positive evidence remains; only the unchanged normal pyuria count gives a SLEDAI "no".
        self.assertEqual({k: v['value'] for k, v in evaluate_scores(assessment, sources, {})['suggestions'].items()},
                         {'SDA14': 'no'})

    def test_sledai_normal_laboratory_results_suggest_no_only_inside_window(self):
        def comp(fid, number, day='2026-11-10'):
            return dict(kind='observation', field_id=fid, component='result', selection_id=fid, document_id='d',
                        confidence={}, review_status='pending',
                        value=dict(numeric_value=number, unit_raw='g/L', comparator='=', source_date=day,
                                   reference_range_raw='0.9 - 1.8' if fid == 'IMM11' else '0.1 - 0.4'))
        c3, c4 = comp('IMM11', '1.2'), comp('IMM12', '0.25')
        no = lambda sources, day='2026-11-13': {k for k, v in evaluate_scores({'date': day}, sources, {})['suggestions'].items()
                                                if v['value'] == 'no'}
        self.assertIn('SDA20', no([c3, c4]))
        self.assertNotIn('SDA20', no([c3]))                          # C4 not measured: no claim
        self.assertNotIn('SDA20', no([c3, c4], day='2026-11-25'))    # outside the 10-day window
        self.assertNotIn('SDA20', no([c3, comp('IMM12', '0.05')]))   # low C4 is not normal
        self.assertEqual(evaluate_scores({}, [c3, c4], {})['suggestions'], {})  # no date, no SLEDAI claim

    def test_manual_crf_unknown_saves_without_inventing_source_evidence(self):
        app = SimpleNamespace(bundles={}, exports=SimpleNamespace(configuration=lambda: (DICTIONARY, None, {})))
        crf = CRFReview(app)
        case_id = self.case['case_id']
        view = crf.view(self.store, case_id)
        field = next(f for f in view['fields'] if f['slot'] == 'HIS15/result')
        self.assertEqual({o['value'] for o in field['manual_options']}, {'yes','no','unknown'})
        option = next(o for o in field['manual_options'] if o['value'] == 'unknown')
        request = dict(case_id=case_id, source_snapshot=view['source_snapshot'], draft_sha256=view['draft_sha256'],
                       selections={field['slot']: option['id']}, **self.person)
        result = crf.approve(self.store, **request)
        self.assertEqual(result['values'][field['slot']]['origin'], 'manual_crf')
        self.assertEqual(result['values'][field['slot']]['value'], 'unknown')
        self.assertEqual(result['sources'], {})
        self.assertEqual(crf.view(self.store, case_id)['review'], result)

    def test_template_checkbox_selection_has_same_anchor_in_layout_and_word(self):
        template = next(Path(__file__).resolve().parents[1].glob('260825*.docx'))
        mapping = build_mapping(DICTIONARY, template)
        layout = review_layout(template, mapping)
        cells = [cell for block in layout for cell in ([block] if 'text' in block else
                 [cell for row in block.get('rows', []) for cell in row]) if 'checkbox_slot' in cell]
        self.assertEqual(sum(len(c['checkbox_values']) for c in cells),
                         sum(len(codes) for _, codes in checkbox_groups().values()))
        for field in THREE_WAY_ROWS.values():
            self.assertEqual([code for cell in cells if cell['checkbox_slot'] == field+'/result'
                              for code in cell['checkbox_values']],
                             ['yes', 'no', 'unknown'])
        self.assertEqual(next(c for c in cells if c['checkbox_slot']=='HIS15/result')['checkbox_values'],
                         ['yes','no','unknown'])
        with ZipFile(BytesIO(reviewed_word(template, mapping, DICTIONARY,
                     {'CV01/result':'Unknown','HIS15/result':'Yes','REN10/result':'No','TRT02/result':'Vaccine'},
                     checkbox_values={'CV01':'unknown','HIS15':'yes','REN10':'no','TRT02':'vaccine'}))) as archive:
            body = ElementTree.fromstring(archive.read('word/document.xml')).find('w:body', NS)
        row = body[61].findall('w:tr', NS)[1]
        vals = [box.get('{'+NS['w']+'}val') for box in row.findall('.//w:checked', NS)]
        self.assertEqual(vals, ['0', '0', '1'])
        for block, expected in [(32,['1','0','0']), (56,['1','0']), (42,['0','1','0'])]:
            self.assertEqual([box.get('{'+NS['w']+'}val') for box in body[block-1].findall('.//w:checked', NS)], expected)
        self.assertNotIn('Các mục đã duyệt chưa có ô điền xác định trong mẫu',
                         ''.join(node.text or '' for node in body.findall('.//w:t', NS)))

    def test_scores_use_domain_maxima_and_only_complete_assessments(self):
        criteria = dict.fromkeys((*EULAR_IDS, *SLEDAI_IDS), 'no')
        criteria.update(EAC02='yes', EAC03='yes', EAC19='yes', EAC20='yes', EAC21='yes',
                        SDA01='yes', SDA20='yes')
        report = evaluate_scores(dict(ana='yes', date='2026-11-13', criteria=criteria), [], {})
        self.assertEqual(report['values']['EAC22/result']['value'], '14')
        self.assertEqual(report['values']['SDA25/result']['value'], '10')
        self.assertEqual(report['summaries']['eular']['classification'], 'meets')
        report = evaluate_scores(dict(ana='no', criteria={'EAC20': 'yes'}), [], {})
        self.assertNotIn('EAC22/result', report['values'])
        self.assertEqual(report['summaries']['eular']['classification'], 'ana_not_met')
        report = evaluate_scores(dict(date='2026-11-13', criteria={'SDA20': 'yes'}), [], {})
        self.assertNotIn('SDA25/result', report['values'])
        self.assertEqual(report['summaries']['sledai']['missing'], 23)
        with self.assertRaises(ValueError):
            evaluate_scores(dict(criteria={'SDA20': 'yes'}), [], {})
        with self.assertRaises(ValueError):
            evaluate_scores(dict(ana='yes', criteria={'EAC19': 'no', 'EAC20': 'yes'}), [], {})

    def test_score_suggestions_respect_reference_date_and_same_report(self):
        def source(field, number, ref, **extra):
            return dict(kind='observation', field_id=field, component='result', selection_id=ref,
                        document_id='panel', confidence={}, review_status='pending',
                        value=dict(numeric_value=number, unit_raw='g/L', comparator='=',
                                   reference_range_raw='0.8 - 1.4', source_date='2026-11-03'), **extra)
        c3, c4 = source('IMM11', '0.60', 'c3'), source('IMM12', '0.70', 'c4')
        report = evaluate_scores({'date': '2026-11-13'}, [c3, c4], {})
        self.assertEqual(set(report['suggestions']), {'EAC19', 'EAC20', 'SDA20'})
        self.assertEqual(report['suggestions']['EAC20']['sources'], ['c3', 'c4'])
        self.assertEqual(report['values'], {})
        report = evaluate_scores({'date': '2026-11-14'}, [c3, {**c4, 'document_id': 'other'}], {})
        self.assertEqual(set(report['suggestions']), {'EAC19'})
        report = evaluate_scores({'date': '2026-11-13'}, [c3, source('IMM11', '1.0', 'c3b')], {})
        self.assertEqual(report['suggestions'], {})
        p = source('REN08', '0.60', 'protein')
        p['value']['unit_raw'] = 'g/24 h'
        self.assertEqual(set(evaluate_scores({'date': '2026-11-13'}, [p], {})['suggestions']),
                         {'EAC15', 'SDA13'})
        conflicting = {**p, 'selection_id': 'protein2', 'value': {**p['value'], 'numeric_value': '0.30'}}
        self.assertEqual(evaluate_scores({'date': '2026-11-13'}, [p, conflicting], {})['suggestions'], {})
        p['value']['unit_raw'] = 'g/L'
        self.assertEqual(evaluate_scores({'date': '2026-11-13'}, [p], {})['suggestions'], {})

    def test_score_assessment_preview_and_persisted_review(self):
        app = SimpleNamespace(bundles={}, exports=SimpleNamespace(configuration=lambda: (DICTIONARY, None, {})))
        crf = CRFReview(app)
        case_id = self.case['case_id']
        view = crf.view(self.store, case_id)
        self.assertEqual(len(view['score_form']['eular']), 21)
        criteria = dict.fromkeys(SLEDAI_IDS, 'no')
        criteria['SDA20'] = 'yes'
        assessment = dict(date='2026-11-13', criteria=criteria)
        with self.assertRaises(StalePatient):
            crf.scores(self.store, case_id=case_id, source_snapshot='stale', assessment=assessment)
        preview = crf.scores(self.store, case_id=case_id, source_snapshot=view['source_snapshot'], assessment=assessment)
        receipt = crf.approve(self.store, case_id=case_id, source_snapshot=view['source_snapshot'],
                              draft_sha256=view['draft_sha256'], selections={}, score_assessment=assessment, **self.person)
        self.assertEqual(receipt['values'], preview['values'])
        self.assertEqual(receipt['values']['SDA25/result']['value'], '2')
        self.assertEqual(crf.view(self.store, case_id)['review'], receipt)

    def test_word_marks_original_score_tables(self):
        template = next(Path(__file__).resolve().parents[1].glob('260825*.docx'))
        mapping = build_mapping(DICTIONARY, template)
        scores = dict(EAC01='yes', EAC19='no', EAC20='yes', EAC22='10', SDA20='yes', SDA25='2')
        values = {fid+'/result': value for fid, value in scores.items()}
        with ZipFile(BytesIO(reviewed_word(template, mapping, DICTIONARY, values, scores))) as archive:
            body = ElementTree.fromstring(archive.read('word/document.xml')).find('w:body', NS)
        text = lambda element: ''.join(n.text or '' for n in element.findall('.//w:t', NS))
        self.assertIn('Total = 10', text(body[85]))
        self.assertIn('Total = 2', text(body[93]))
        checked = body[86].findall('.//w:checked', NS)
        self.assertEqual([node.get('{'+NS['w']+'}val') for node in checked], ['1', '0', '1'])
        self.assertIn('Low Complement ☑', text(body[94]))

    def test_bmi_requires_agreeing_measurements_on_one_source(self):
        def measured(field, number, unit, document='same'):
            return dict(kind='observation', field_id=field, review_status='pending', current_revision=True,
                        document_id=document, selection_id=field, confidence={},
                        value=dict(numeric_value=number, unit_raw=unit, comparator='='))

        height = measured('ADM05', '172', 'cm')
        weight = measured('ADM06', '68', 'kg')
        self.assertEqual(calculated_bmi({'candidates': [height, weight]})['value'], '22.99 kg/m²')
        self.assertIsNone(calculated_bmi({'candidates': [height, {**weight, 'document_id': 'other'}]}))
        self.assertIsNone(calculated_bmi({'candidates': [height, weight, measured('ADM06', '65', 'kg')]}))

    def test_draft_requires_evidence_and_final_review_is_persistent(self):
        case_id = self.case['case_id']
        app = SimpleNamespace(database=self.path, bundles={}, intakes=SimpleNamespace(workspace=self.tmp.name),
                              exports=SimpleNamespace(configuration=lambda: (DICTIONARY, None, {})))
        crf = CRFReview(app)
        initial = crf.view(self.store, case_id)
        self.assertEqual(len(initial['fields']), 377)
        self.assertIsNone(initial['review'])
        direct = next(f for f in initial['fields'] if f['options'])
        facts, _ = model_facts(DICTIONARY, self.view())
        self.assertTrue(facts)
        target, unsupported = [f for f in initial['fields'] if f['eligible']][:2]
        proposals = [dict(slot=target['slot'], value='yes', reason='Synthetic rationale', evidence=[facts[0]['id']]),
                     dict(slot=unsupported['slot'], value='yes', reason='Unknown evidence', evidence=['NOT-A-FACT'])]
        with patch('registry_review.crf.configuration', return_value={}), patch(
                'registry_review.crf.request_suggestions', return_value=(proposals, 'synthetic', {})):
            self.assertEqual(crf.generate(self.store, case_id)['status'], 'running')
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                draft = crf.view(self.store, case_id)
                if draft['job']['status'] != 'running':
                    break
                time.sleep(.02)
        self.assertEqual(draft['job'], {'status': 'completed', 'count': 1})
        proposed, = [f for f in draft['fields'] if f.get('proposal') and f['proposal'].get('origin') != 'no_evidence']
        # Questions the documents cannot answer are drafted "Chưa rõ" with no evidence, never Có/Không.
        unknown = [f for f in draft['fields'] if f.get('proposal', {}).get('origin') == 'no_evidence']
        self.assertTrue(unknown)
        self.assertTrue(all(f['proposal']['value'] == 'unknown' and not f['proposal']['sources'] for f in unknown))
        self.assertFalse(any(f['slot'].split('/')[0][:3] in ('EAC', 'SDA') for f in unknown))
        self.assertEqual(proposed['slot'], target['slot'])
        selections = {direct['slot']: direct['options'][0]['id'], target['slot']: proposed['proposal']['id']}
        request = dict(case_id=case_id, source_snapshot=draft['source_snapshot'], draft_sha256=draft['draft_sha256'],
                       selections=selections, **self.person)
        with self.assertRaises(StalePatient):
            crf.approve(self.store, **{**request, 'draft_sha256': initial['draft_sha256']})
        with self.assertRaises(ValueError):
            crf.approve(self.store, **{**request, 'selections': {unsupported['slot']: 'invalid'}})
        receipt = crf.approve(self.store, **request)
        self.assertEqual(receipt, crf.approve(self.store, **request))
        self.assertEqual(receipt['values'][target['slot']]['origin'], 'llm_suggestion')
        self.assertEqual(CRFReview(app).view(self.store, case_id)['review'], receipt)
        self.assertEqual(self.store.effective_pool(case_id)['observations'], [])
