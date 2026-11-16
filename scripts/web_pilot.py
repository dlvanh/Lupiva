"""Serve the synthetic-data pilot behind one quick tunnel, with its own account login.

Replaces the two server-only wrappers (web_pilot.py behind Cloudflare email access and
web_safari.py with HTTP Basic accounts) that ran two servers on one database. Login is
HTTP Basic against an accounts file of {user: sha256(password) hex}, so any browser works.
Run from the pilot code root:
  python scripts/web_pilot.py HOST.trycloudflare.com PORT ../safari-accounts.json
"""
from base64 import b64decode
from binascii import Error
from hashlib import sha256
from hmac import compare_digest
import json
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import registry_review.server as review  # noqa: E402

HOST = re.compile(r'[a-z0-9-]+\.trycloudflare\.com')


def authorized(header, accounts):
    """True for a Basic Authorization header naming an account with the matching password."""
    try:
        scheme, encoded = (header or '').split(' ', 1)
        user, password = b64decode(encoded, validate=True).decode().split(':', 1)
    except (ValueError, Error, UnicodeDecodeError):
        return False
    return scheme.lower() == 'basic' and compare_digest(
        accounts.get(user, '0' * 64), sha256(password.encode()).hexdigest())


def request_problem(host, headers, command, path):
    """Why a request must be refused (wrong host, foreign origin, cross-site), or None."""
    if headers.get('Host') != host:
        return 'Open the pilot HTTPS address'
    origin = headers.get('Origin')
    if origin != 'https://' + host and (origin is not None or command == 'POST'):
        return 'Use the pilot HTTPS origin'
    if headers.get('Sec-Fetch-Site') == 'cross-site' and not (command == 'GET' and path == '/'):
        return 'Cross-site pilot request'
    return None


TUNNEL_HEADERS = ('Cf-Ray', 'Cf-Connecting-Ip', 'Cf-Visitor', 'X-Forwarded-For', 'X-Forwarded-Host')


def loopback_caller(client_ip, headers, port):
    """True for a same-machine caller (the Next.js server) addressing 127.0.0.1 directly.

    Such a caller skips the Basic login but still meets every check of the
    plain local backend (exact 127.0.0.1 Host, no foreign Origin, review token
    on writes). Requests through the tunnel carry the tunnel Host and
    Cloudflare headers, so they never qualify.
    """
    return (client_ip == '127.0.0.1' and headers.get('Host') == f'127.0.0.1:{port}'
            and not any(headers.get(name) for name in TUNNEL_HEADERS))


def load_accounts(path):
    accounts = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(accounts, dict) or not accounts or not all(
            isinstance(v, str) and re.fullmatch(r'[0-9a-f]{64}', v) for v in accounts.values()):
        raise ValueError('The pilot needs at least one account with a sha256 password hash')
    return accounts


def pilot_handler(base, host, accounts):
    class PilotHandler(base):
        def loopback(self):
            return loopback_caller(self.client_address[0], self.headers, self.server.server_port)

        def process(self):
            if not self.loopback() and not authorized(self.headers.get('Authorization'), accounts):
                self.close_connection = True
                self.send_response(401)
                self.send_header('WWW-Authenticate', 'Basic realm="Lupiva Pilot", charset="UTF-8"')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            super().process()

        do_GET = process
        do_POST = process

        def allowed_request(self):
            if self.loopback():
                return super().allowed_request()
            problem = request_problem(host, self.headers, self.command, self.path)
            if problem:
                raise PermissionError(problem)

    return PilotHandler


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 3:
        raise SystemExit(__doc__)
    host, port, accounts = argv[0], int(argv[1]), load_accounts(argv[2])
    if not HOST.fullmatch(host):
        raise ValueError('Expected a Quick Tunnel hostname')
    database = Path('pilot.sqlite')
    if not database.is_file():
        raise ValueError('Expected an isolated synthetic pilot database')
    original = review.make_handler
    review.make_handler = lambda application: pilot_handler(original(application), host, accounts)
    template, = Path('.').glob('*.docx')
    with review.create_server(database, port=port, export_template=template, synthetic=True)[0] as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
