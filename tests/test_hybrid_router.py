import unittest

from ocr_pool.hybrid_router import local_decision, route


def obs(doc='SYN-BIO', **kw):
    base = dict(document_id=doc, extraction_status='found', flags=[], source_warning=None,
                result_type='numeric', numeric_value='0.65', unit_raw='g/L', result_raw='0,65')
    base.update(kw)
    return base


class HybridRouterTests(unittest.TestCase):
    def test_complete_unflagged_page_stays_local(self):
        self.assertEqual(local_decision([obs(), obs(), obs()], []), (True, []))

    def test_each_doubt_sends_the_page_to_the_api(self):
        cases = {
            'too_few_values': [obs()],
            'value_not_found': [obs(), obs(), obs(extraction_status='missing')],
            'value_flagged': [obs(), obs(), obs(flags=['neighbour_row'])],
            'number_not_parsed': [obs(), obs(), obs(numeric_value=None)],
            'missing_unit': [obs(), obs(), obs(unit_raw='')],
            'source_warning': [obs(), obs(), obs(source_warning='clipped')],
            'empty_result': [obs(), obs(), obs(result_type='qualitative', qualitative_value=None, result_raw='')],
        }
        for reason, observations in cases.items():
            with self.subTest(reason=reason):
                accept, reasons = local_decision(observations, [])
                self.assertFalse(accept)
                self.assertIn(reason, reasons)

    def test_document_issue_blocks_local_acceptance(self):
        self.assertEqual(local_decision([obs()] * 3, [{'reason': 'x'}]), (False, ['local_issue']))

    def test_route_splits_documents_and_counts_values(self):
        pool = dict(observations=[obs('A'), obs('A'), obs('A'), obs('B', unit_raw='')], issues=[])
        routes = route(pool, ['A', 'B', 'C'])
        self.assertEqual(routes['A'], dict(route='local', reasons=[], local_values=3))
        self.assertEqual(routes['B']['route'], 'api')
        self.assertEqual(routes['C'], dict(route='api', reasons=['too_few_values'], local_values=0))


if __name__ == '__main__':
    unittest.main()
