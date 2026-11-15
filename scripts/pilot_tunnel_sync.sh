#!/bin/bash
# Keep each pilot web unit's allowed hostname equal to its quick tunnel's current URL.
#
# A trycloudflare quick tunnel gets a new hostname whenever it restarts (reboot, crash),
# while web_pilot.py / web_safari.py only accept the hostname given on their command line.
# For each "tunnel:web" pair this reads the newest URL from the active tunnel unit's journal,
# and when it differs from the web unit's hostname writes a drop-in with the new hostname and
# restarts the web unit, but never while an intake is running (restart kills the child).
# Current URLs are written to ~/lupiva-urls.txt. Run on the Ubuntu host (a user timer runs it).
#   PILOT=~/lupiva-web-pilot/lupiva bash pilot_tunnel_sync.sh
set -euo pipefail
PILOT=${PILOT:-$HOME/lupiva-web-pilot/lupiva}
PAIRS=${PAIRS:-"lupiva-pilot-tunnel-v3,lupiva-pilot-tunnel:lupiva-pilot-web-v3 lupiva-safari-tunnel,lupiva-safari-tunnel-boot:lupiva-safari-web"}
UNITS=$HOME/.config/systemd/user
URLS=$HOME/lupiva-urls.txt

busy() {
  python3 - "$PILOT/pilot.sqlite" <<'EOF'
import json, sqlite3, sys
try:
    rows = sqlite3.connect(f'file:{sys.argv[1]}?mode=ro', uri=True).execute('SELECT payload FROM patient_intakes').fetchall()
except sqlite3.OperationalError:
    rows = []
sys.exit(0 if any(json.loads(r[0]).get('status') in ('launching', 'processing', 'queued') for r in rows) else 1)
EOF
}

: > "$URLS.tmp"
reload=0; restart=()
for pair in $PAIRS; do
  tunnels=${pair%%:*}; web=${pair##*:}
  url=""
  for tunnel in ${tunnels//,/ }; do
    if systemctl --user is-active --quiet "$tunnel"; then
      url=$(journalctl --user -u "$tunnel" -o cat --no-pager | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1 || true)
      [ -n "$url" ] && break
    fi
  done
  [ -z "$url" ] && { echo "$web: no active tunnel URL" >&2; continue; }
  echo "$web $url" >> "$URLS.tmp"
  host=${url#https://}
  line=$(systemctl --user cat "$web" | grep '^ExecStart=.' | tail -1)
  current=$(grep -o '[a-z0-9-]*\.trycloudflare\.com' <<<"$line" | head -1 || true)
  [ -z "$current" ] && { echo "$web: ExecStart has no trycloudflare hostname; left unchanged" >&2; continue; }
  [ "$current" = "$host" ] && continue
  mkdir -p "$UNITS/$web.service.d"
  printf '[Service]\nExecStart=\n%s\n' "${line//$current/$host}" > "$UNITS/$web.service.d/tunnel-host.conf"
  echo "$web: hostname $current -> $host"
  reload=1; restart+=("$web")
done
mv "$URLS.tmp" "$URLS"
[ "$reload" = 1 ] && systemctl --user daemon-reload
if [ ${#restart[@]} -gt 0 ]; then
  if busy; then echo "intake running; web restart deferred to the next sync" >&2; exit 0; fi
  systemctl --user restart "${restart[@]}"
fi
