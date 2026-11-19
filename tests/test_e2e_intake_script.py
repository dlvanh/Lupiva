"""The standalone runner must never reach approval or review routes."""
import importlib.util
from pathlib import Path
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'e2e_intake.py'
SPEC = importlib.util.spec_from_file_location('e2e_intake_script', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class E2EIntakeScriptTests(unittest.TestCase):
    def test_forbidden_endpoint_guard(self):
        for endpoint in MODULE.FORBIDDEN_ENDPOINTS:
            for method in ('GET', 'POST'):
                for url in (endpoint, 'http://127.0.0.1:8765' + endpoint + '?case_id=x',
                            endpoint + '/', endpoint.replace('/api/', '/%61pi/')):
                    with self.subTest(url=url, method=method):
                        with self.assertRaises(ValueError):
                            MODULE.guard_endpoint(url, method)

    def test_preview_routes_allowed_and_unknown_routes_refused(self):
        MODULE.guard_endpoint('/api/crf/scores')
        MODULE.guard_endpoint('/api/exports/preview')
        MODULE.guard_endpoint('/api/crf?case_id=x', 'GET')
        with self.assertRaises(ValueError):
            MODULE.guard_endpoint('/api/unknown')


if __name__ == '__main__':
    unittest.main()
