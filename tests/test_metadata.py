import copy
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from ocr_pool import convert_documents
from ocr_pool.metadata import extract_metadata
from scripts.export_pool_sqlite import export_pool
from scripts.merge_ocr_runs import merge_saved_runs
from scripts.compare_pool_metadata import compare_metadata

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))


def document(raw, **payload_options):
    return dict(document_id='SYNTHETIC', input_sha256='a' * 64,
                metadata_context={'date_order': 'DMY'}, tables=[],
                text_regions=[dict(table_id='HEADER', raw=raw, **payload_options)])


class MetadataTests(unittest.TestCase):
    def test_table_only_does_not_assert_absent_administrative_data(self):
        p = convert_documents([{'document_id': 'D', 'tables': [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L'}]}], CATALOG)
        self.assertEqual(p['fields']['ADM02']['extraction_status'], 'not_processed')

    def test_dates_remain_typed_and_raw_spans_are_exact(self):
        raw = 'Ngày sinh: 03/04/1960\nGiờ lấy mẫu: 09:10 05/08/2026\nGiờ nhận mẫu: 10:11 06/08/2026'
        facts, evidence, issues = extract_metadata(document(raw))
        self.assertFalse(issues)
        self.assertEqual({c['key']: c['value'] for c in facts}, {
            'birth_date': '1960-04-03', 'sample_date': '2026-08-05T09:10:00',
            'received_date': '2026-08-06T10:11:00'})
        for ev in evidence:
            start, end = ev['raw_span_0based']
            self.assertEqual(raw[start:end], ev['value_raw'])

    def test_ids_stay_strings_and_unknown_label_is_not_pid(self):
        p = convert_documents([document('BID: 000123\nSID: 050826-0012')], CATALOG)
        facts = p['metadata_candidates']
        self.assertEqual([(c['key'], c['value']) for c in facts], [('unresolved_identifier', '000123'), ('sid', '050826-0012')])
        self.assertIn('unrecognized_identifier_label', facts[0]['flags'])
        self.assertIsNone(p['case_id'])
        self.assertEqual(p['identity_status'], 'unconfirmed')
        self.assertFalse(p['fields']['ADM01']['observation_ids'])
        self.assertFalse(p['observations'])

    def test_birth_and_received_dates_do_not_become_sample_date(self):
        d = document('Ngày sinh: 03/04/1960\nGiờ nhận mẫu: 10:11 06/08/2026\nSID: 050826-0012')
        d['tables'] = [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L'}]
        p = convert_documents([d], CATALOG)
        self.assertIsNone(p['observations'][0]['source_date'])

    def test_date_evidence_propagates_only_within_document(self):
        d = document('Giờ lấy mẫu: 09:10 05/08/2026')
        d['tables'] = [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L'}]
        other = {'document_id': 'OTHER', 'tables': copy.deepcopy(d['tables'])}
        p = convert_documents([d, other], CATALOG)
        first, second = p['observations']
        self.assertEqual(first['source_date'], '2026-08-05T09:10:00')
        self.assertEqual(first['date_type'], 'sample_date')
        self.assertEqual(len(first['evidence_ids']), 2)
        self.assertIsNone(second['source_date'])
        self.assertFalse(second['date_evidence_ids'])

    def test_conflicting_dates_block_propagation(self):
        d = document('Ngày lấy mẫu: 05/08/2026\nNgày lấy mẫu: 06/08/2026')
        d['tables'] = [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L'}]
        p = convert_documents([d], CATALOG)
        self.assertIsNone(p['observations'][0]['source_date'])
        self.assertTrue(all('metadata_conflict' in c['flags'] for c in p['metadata_candidates']))
        d['tables'][0]['context'] = {'source_date': '2026-08-05', 'date_type': 'sample_date'}
        p = convert_documents([d], CATALOG)
        self.assertIsNone(p['observations'][0]['source_date'])
        self.assertIn('source_date_conflict', p['observations'][0]['flags'])

    def test_invalid_or_missing_date_convention_blocks_date(self):
        for raw, convention, flag in [('Ngày lấy mẫu: 32/08/2026', 'DMY', 'invalid_metadata_date'),
                                      ('Ngày lấy mẫu: 05/08/2026', None, 'missing_date_convention')]:
            d = document(raw)
            d['metadata_context']['date_order'] = convention
            facts, _, _ = extract_metadata(d)
            self.assertIsNone(facts[0]['value'])
            self.assertIn(flag, facts[0]['flags'])

    def test_truncated_and_failed_text_cannot_supply_metadata(self):
        for options in ({'truncated': True}, {'generation_status': 'oom'}):
            p = convert_documents([document('PID: 001\nNgày lấy mẫu: 05/08/2026', **options)], CATALOG)
            self.assertFalse(p['metadata_candidates'])
            self.assertEqual(p['issues'][0]['reason'], 'incomplete_metadata_generation')

    def test_adm_uses_printed_values_not_computed_age_or_bmi(self):
        d = document('Date of birth: 03/04/1960\nSex: F\nAge: 64\nHeight (cm): 143\nWeight (kg): 52')
        p = convert_documents([d], CATALOG)
        self.assertEqual({o['field_id'] for o in p['observations']}, {'ADM02', 'ADM03', 'ADM05', 'ADM06'})
        self.assertEqual(next(o['numeric_value'] for o in p['observations'] if o['field_id'] == 'ADM02'), '64')
        self.assertFalse(p['fields']['ADM07']['observation_ids'])
        self.assertTrue(all(o['review_status'] == 'pending' and not o['eligible_for_verified_pool'] for o in p['observations']))

    def test_multi_column_line_and_unknown_units(self):
        p = convert_documents([document('Ngày sinh: 03/04/1960   Giới tính: Nữ\nHeight: 143\nWeight (kg): 52 cm')], CATALOG)
        self.assertEqual(len(p['observations']), 1)
        self.assertEqual(p['observations'][0]['qualitative_value'], 'female')
        flags = {flag for c in p['metadata_candidates'] for flag in c['flags']}
        self.assertIn('missing_metadata_unit', flags)
        self.assertIn('metadata_unit_mismatch', flags)

    def test_unlabelled_timestamp_requires_declared_role(self):
        d = document('13/08/2026 9:28:32 AM')
        self.assertFalse(extract_metadata(d)[0])
        self.assertEqual(extract_metadata(d)[2][0]['reason'], 'no_recognized_metadata')
        d['metadata_context']['unlabelled_datetime_role'] = 'measurement_date'
        facts, _, _ = extract_metadata(d)
        self.assertEqual(facts[0]['value'], '2026-08-13T09:28:32')

    def test_focused_retry_exclusion_is_explicit_and_does_not_erase_raw(self):
        d = document('BID: 001\nGiới tính: Nữ', context={'metadata_exclude_keys': ['unresolved_identifier']})
        d['text_regions'].append({'table_id': 'RETRY', 'raw': 'PID: 001'})
        p = convert_documents([d], CATALOG)
        self.assertEqual({c['key'] for c in p['metadata_candidates']}, {'pid', 'sex'})
        self.assertEqual(p['source_documents'][0]['text_regions'][0]['raw'], 'BID: 001\nGiới tính: Nữ')

    def test_conflicting_context_date_is_not_silently_overwritten(self):
        d = document('Ngày lấy mẫu: 05/08/2026')
        d['tables'] = [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L',
                        'context': {'source_date': '2026-08-06', 'date_type': 'sample_date'}}]
        p = convert_documents([d], CATALOG)
        self.assertIsNone(p['observations'][0]['source_date'])
        self.assertIn('source_date_conflict', p['observations'][0]['flags'])

    def test_sqlite_preserves_metadata_and_date_evidence(self):
        d = document('PID: 000123\nGiờ lấy mẫu: 09:10 05/08/2026\nSex: F')
        d['tables'] = [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L'}]
        p = convert_documents([d], CATALOG)
        with tempfile.TemporaryDirectory() as temp:
            target = Path(temp) / 'pool.sqlite'
            export_pool(p, target)
            with closing(sqlite3.connect(target)) as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
                self.assertFalse(db.execute('PRAGMA foreign_key_check').fetchall())
                self.assertEqual(db.execute('SELECT count(*) FROM metadata_candidates').fetchone()[0], 3)
                self.assertEqual(json.loads(db.execute("SELECT value_json FROM metadata_candidates WHERE metadata_key='pid'").fetchone()[0]), '000123')
                self.assertEqual(db.execute('SELECT count(*) FROM metadata_evidence').fetchone()[0], 3)


class MergeMetadataTests(unittest.TestCase):
    def test_duplicate_region_ids_across_documents_rejected(self):
        spec = {'documents': [{'document_id': did, 'regions': [{'region_id': 'HEADER', 'task': 'text'}]}
                              for did in ['ONE', 'TWO']]}
        with self.assertRaisesRegex(ValueError, 'unique across documents'):
            merge_saved_runs(spec, [])

    def test_source_hash_mismatch_and_ambiguous_region_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            runs = [Path(temp) / 'one', Path(temp) / 'two']
            for index, run in enumerate(runs):
                run.mkdir()
                d = document('PID: 001')
                d['input_sha256'] = str(index) * 64
                d['text_regions'][0]['table_id'] = f'H{index}'
                (run / 'ocr-tables.json').write_text(json.dumps({'documents': [d]}), encoding='utf-8')
                (run / 'measurements.json').write_text(json.dumps([{'region_id': f'H{index}'}]), encoding='utf-8')
            spec = {'documents': [{'document_id': 'SYNTHETIC', 'regions': [
                {'region_id': 'H0', 'task': 'text'}, {'region_id': 'H1', 'task': 'text'}]}]}
            with self.assertRaisesRegex(ValueError, 'different source images'):
                merge_saved_runs(spec, runs)
            with self.assertRaisesRegex(ValueError, 'Ambiguous repeated region'):
                merge_saved_runs({'documents': [{'document_id': 'SYNTHETIC', 'regions': [{'region_id': 'H0', 'task': 'text'}]}]}, [runs[0], runs[0]])


class MetadataComparisonTests(unittest.TestCase):
    def test_duplicate_and_wrong_metadata_are_not_ignored(self):
        item = dict(document_id='D', key='pid', value='001', candidate_id='MD1', flags=[])
        ref = dict(status='draft_unreviewed', scope=[['D', 'pid']], candidates=[item])
        report = compare_metadata({'metadata_candidates': [item, item], 'evidence': [], 'observations': []}, ref)
        self.assertEqual((report['expected_count'], report['predicted_count'], report['matched_count']), (1, 2, 1))
        self.assertEqual(len(report['extra_or_wrong_tuples']), 1)
        report = compare_metadata({'metadata_candidates': [{**item, 'value': '002'}], 'evidence': [], 'observations': []}, ref)
        self.assertEqual(report['matched_count'], 0)
        self.assertEqual(len(report['missing_tuples']), 1)

    def test_correct_date_with_wrong_document_evidence_fails(self):
        ref = dict(status='draft_unreviewed', scope=[['D', 'sample_date']],
                   candidates=[dict(document_id='D', key='sample_date', value='2026-08-05')])
        package = dict(metadata_candidates=[], evidence=[dict(evidence_id='E', document_id='OTHER', evidence_kind='metadata')],
                       observations=[dict(observation_id='O', document_id='D', source_date='2026-08-05',
                                          date_type='sample_date', date_evidence_ids=['E'])])
        self.assertEqual(compare_metadata(package, ref)['date_propagation_errors'][0]['reason'], 'missing_or_wrong_date_evidence')


if __name__ == '__main__':
    unittest.main()
