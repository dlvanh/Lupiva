"""Login and request checks of the single pilot web entry point; synthetic accounts only."""
from base64 import b64encode
from hashlib import sha256
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('web_pilot', ROOT / 'scripts/web_pilot.py')
web = importlib.util.module_from_spec(spec)
spec.loader.exec_module(web)

ACCOUNTS = {'synthetic': sha256(b'pw').hexdigest()}
HOST = 'synthetic-pilot.trycloudflare.com'


def basic(user, password):
    return 'Basic ' + b64encode(f'{user}:{password}'.encode()).decode()


class AuthorizationTests(unittest.TestCase):
    def test_matching_account_is_accepted(self):
        self.assertTrue(web.authorized(basic('synthetic', 'pw'), ACCOUNTS))
        self.assertTrue(web.authorized(basic('synthetic', 'pw').replace('Basic', 'basic'), ACCOUNTS))

    def test_wrong_password_unknown_user_or_malformed_header_is_refused(self):
        for header in (basic('synthetic', 'nope'), basic('other', 'pw'), None, '', 'Basic',
                       'Basic !!!', 'Bearer ' + b64encode(b'synthetic:pw').decode(),
                       'Basic ' + b64encode(b'no-colon').decode(), 'Basic ' + b64encode(b'\xff:\xfe').decode()):
            with self.subTest(header=header):
                self.assertFalse(web.authorized(header, ACCOUNTS))


class RequestTests(unittest.TestCase):
    def test_same_origin_requests_pass(self):
        self.assertIsNone(web.request_problem(HOST, {'Host': HOST}, 'GET', '/api/x'))
        self.assertIsNone(web.request_problem(HOST, {'Host': HOST, 'Origin': 'https://' + HOST}, 'POST', '/api/x'))
        self.assertIsNone(web.request_problem(HOST, {'Host': HOST, 'Sec-Fetch-Site': 'cross-site'}, 'GET', '/'))

    def test_wrong_host_foreign_origin_and_cross_site_calls_are_refused(self):
        cases = [({'Host': '127.0.0.1:8877'}, 'GET', '/', 'Open the pilot HTTPS address'),
                 ({'Host': HOST, 'Origin': 'https://evil.example'}, 'GET', '/', 'Use the pilot HTTPS origin'),
                 ({'Host': HOST}, 'POST', '/api/x', 'Use the pilot HTTPS origin'),
                 ({'Host': HOST, 'Sec-Fetch-Site': 'cross-site'}, 'GET', '/api/x', 'Cross-site pilot request')]
        for headers, command, path, problem in cases:
            with self.subTest(problem=problem, path=path):
                self.assertEqual(web.request_problem(HOST, headers, command, path), problem)


class AccountFileTests(unittest.TestCase):
    def load(self, value):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'accounts.json'
            path.write_text(json.dumps(value), encoding='utf-8')
            return web.load_accounts(path)

    def test_valid_file_loads(self):
        self.assertEqual(self.load(ACCOUNTS), ACCOUNTS)

    def test_empty_or_plaintext_accounts_are_rejected(self):
        for value in ({}, [], {'synthetic': 'pw'}, {'synthetic': 'A' * 64}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.load(value)

    def test_main_requires_the_accounts_argument(self):
        with self.assertRaises(SystemExit):
            web.main([HOST, '8877'])


if __name__ == '__main__':
    unittest.main()
