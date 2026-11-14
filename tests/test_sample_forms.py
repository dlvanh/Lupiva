import unittest

from form_pool.sample_collection import extract_sample_collections
from form_pool.evaluate import compare

HEADER='Sample type\tTime of collection\tAmount collected\tCell conc. (cell/mL)\tCell loaded on chip\tNote\n'


def extract(body,**options):
    payload=dict(table_id='T',raw=HEADER+body,format='auto',**options)
    return extract_sample_collections([dict(document_id='S',input_sha256='a'*64,tables=[payload])],date_order='DMY')


class SampleFormTests(unittest.TestCase):
    def test_explicit_other_label_variants_keep_checkbox_and_raw_text(self):
        for label in ('Others: skin', 'Other: skin', 'Others, specify: skin', 'Other , specify : skin'):
            with self.subTest(label=label):
                result=extract('☐ '+label+'\t\t\t\t\t')
                self.assertFalse(result['issues'])
                item=result['candidates'][0]
                self.assertEqual(item['sample_type'],'other')
                self.assertEqual(item['sample_type_raw'],label)
                self.assertEqual(item['checkbox_state'],'unchecked')
                self.assertIsNone(item['clinical_field_id'])
                self.assertIsNone(item['collection_datetime']['date'])
                self.assertEqual(result['evidence'][0]['row_raw'][0],'☐ '+label)

    def test_other_label_does_not_match_arbitrary_prefixes_or_guess_checkbox(self):
        for label in ('Otherwise: skin', 'Others unknown', 'Other blood result'):
            result=extract(label+'\t\t\t\t\t')
            self.assertFalse(result['candidates'])
            self.assertEqual(result['issues'][0]['reason'],'unmapped_sample_type')
        item=extract('Others: skin\t\t\t\t\t')['candidates'][0]
        self.assertEqual(item['checkbox_state'],'unreadable')

    def test_rows_keep_independent_dates_times_and_explicit_markers(self):
        result=extract('☑ Blood\t10:30 05/08/2026\t10...mL\tPBMC:\t\t\n'
                       '☑ Stool\t05/08/2026\t01 sample\t\t\t\n'
                       '☐ Others, specify: e.g., Kidney\t\t\t\t\t')
        blood,stool,other=result['candidates']
        self.assertEqual(blood['collection_datetime']['time'],'10:30')
        self.assertIsNone(stool['collection_datetime']['time'])
        self.assertEqual(stool['collection_datetime']['date'],'2026-08-05')
        self.assertEqual(blood['amount']['numeric_value'],'10')
        self.assertEqual(stool['amount']['numeric_value'],'1')
        self.assertEqual(other['checkbox_state'],'unchecked')
        self.assertIsNone(other['clinical_field_id'])
        self.assertTrue(all(c['review_status']=='pending' and c['eligible_for_verified_pool'] is False for c in result['candidates']))

    def test_unreadable_date_or_ambiguous_dots_never_repaired(self):
        result=extract('☑ Stool\t0510812026\t0.1. sample\t\t\t')
        item=result['candidates'][0]
        self.assertIsNone(item['collection_datetime']['date'])
        self.assertEqual(item['collection_datetime']['date_raw'],'0510812026')
        self.assertIsNone(item['amount']['numeric_value'])
        self.assertEqual(item['amount']['unit_raw'],'sample')
        self.assertIn('invalid_metadata_date',item['flags'])
        self.assertIn('unparsed_collection_amount',item['flags'])

    def test_missing_marker_not_treated_as_unchecked_and_duplicate_real_rows_preserved(self):
        result=extract('Blood\t10:30 05/08/2026\t10 mL\t\t\t\n'
                       'Blood\t10:30 05/08/2026\t10 mL\t\t\t')
        self.assertEqual(len(result['candidates']),2)
        self.assertTrue(all(c['checkbox_state']=='unreadable' for c in result['candidates']))
        self.assertNotEqual(result['candidates'][0]['sample_candidate_id'],result['candidates'][1]['sample_candidate_id'])

    def test_explicit_otsl_rowspan_not_an_additional_sample(self):
        raw=('<fcel>Sample type<fcel>Time of collection<fcel>Amount collected'
             '<fcel>Cell conc. (cell/mL)<fcel>Cell loaded on chip<fcel>Note<nl>'
             '<fcel>☑ Blood<fcel>10:30 05/08/2026<fcel>10 mL<fcel>PBMC:<ecel><ecel><nl>'
             '<ucel><ucel><ucel><fcel>Leukocytes:<ucel><ecel><nl>')
        result=extract_sample_collections([dict(document_id='S',input_sha256='a'*64,
            tables=[dict(table_id='T',raw=raw)])],date_order='DMY')
        self.assertEqual(len(result['candidates']),1)
        self.assertEqual(result['evidence'][0]['row_index_0based'],1)

    def test_incomplete_form_and_missing_source_hash_rejected(self):
        self.assertEqual(extract('☑ Blood\t\t\t\t\t',truncated=True)['candidates'],[])
        with self.assertRaises(ValueError):
            extract_sample_collections([dict(document_id='S',tables=[])])

    def test_form_evaluation_counts_missing_and_unexpected_values_without_blank_credit(self):
        pool=extract('☑ Stool\t10:30 0510812026\t0.1. sample\t\t\t')
        ref=dict(reference_status='draft_unreviewed',sources=[dict(document_id='S')],rows=[
            dict(row_key='stool',checkbox_state='checked',collection_date='2026-08-05',
                 collection_time=None,amount_numeric='1',amount_unit_raw='sample')])
        report=compare(pool,ref)
        self.assertEqual(report['expected_attributes'],4)
        self.assertEqual(report['matched_attributes'],2)
        self.assertEqual(len(report['missing_attributes']),2)
        self.assertEqual(len(report['unexpected_values_in_blank_fields']),1)
        ref['sources'][0]['sha256']='b'*64
        with self.assertRaisesRegex(ValueError,'source image hashes differ'):
            compare(pool,ref)


if __name__=='__main__':
    unittest.main()
