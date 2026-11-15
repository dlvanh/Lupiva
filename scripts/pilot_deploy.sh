#!/bin/bash
# Deploy a code archive to the pilot without interrupting a running intake.
#
# From the workstation:
#   git archive HEAD ocr_pool registry_review registry_export registry_pool form_pool schemas scripts \
#     > /tmp/lupiva.tar && scp /tmp/lupiva.tar scripts/pilot_deploy.sh HOST:
#   ssh HOST 'bash pilot_deploy.sh ~/lupiva-web-pilot/lupiva ~/lupiva.tar lupiva-pilot-web-v3 lupiva-safari-web'
#
# Steps: wait until no intake is queued/launching/processing (up to WAIT_SECONDS), back up
# the database (SQLite backup API) and code, extract the archive, import-check, then
# `systemctl --user restart` each unit. Never `stop`: transient systemd-run units vanish.
set -euo pipefail
PILOT=$1; ARCHIVE=$(realpath "$2"); shift 2
WAIT_SECONDS=${WAIT_SECONDS:-7200}
PY=${PY:-python3}
cd "$PILOT"

busy() {
  "$PY" - <<'EOF'
import json, sqlite3, sys
db = sqlite3.connect('file:pilot.sqlite?mode=ro', uri=True)
try:
    rows = db.execute('SELECT payload FROM patient_intakes').fetchall()
except sqlite3.OperationalError:
    rows = []
sys.exit(0 if any(json.loads(r[0]).get('status') in ('launching', 'processing', 'queued') for r in rows) else 1)
EOF
}

waited=0
while busy; do
  if [ "$waited" -ge "$WAIT_SECONDS" ]; then echo "intake still running after ${WAIT_SECONDS}s; not deploying" >&2; exit 3; fi
  [ $((waited % 300)) -eq 0 ] && echo "waiting for running intake to finish..."
  sleep 30; waited=$((waited+30))
done

BACKUP="$(dirname "$PWD")/backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
"$PY" -c "import sqlite3,sys;s=sqlite3.connect('pilot.sqlite');d=sqlite3.connect(sys.argv[1]);s.backup(d);d.close()" "$BACKUP/pilot.sqlite"
tar czf "$BACKUP/code.tgz" ocr_pool registry_review registry_export registry_pool form_pool schemas scripts
echo "backup: $BACKUP"

# Re-check right before replacing code: a submission may have arrived during backup.
if busy; then echo "an intake started during backup; rerun the deploy" >&2; exit 4; fi
tar xf "$ARCHIVE"
"${IMPORT_PY:-$PY}" -c "import ocr_pool.gemini_workflow, registry_review.intake, registry_review.server"
for unit in "$@"; do systemctl --user restart "$unit"; done
sleep 6
systemctl --user is-active "$@"
