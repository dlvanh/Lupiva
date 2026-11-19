#!/bin/bash
# From the workstation: replay saved intakes on staging with HEAD, and deploy HEAD to
# the pilot only when no regression is found. No API calls are made by the check.
#   HOST=lupiva bash scripts/deploy_with_regression.sh
set -euo pipefail
HOST=${HOST:-lupiva}
STAGING=${STAGING:-lupiva-staging}
PILOT=${PILOT:-lupiva-web-pilot/lupiva}
UNITS=${UNITS:-"lupiva-safari-web"}   # the only pilot web since 16/11 (scripts/web_pilot.py)
IMPORT_PY=${IMPORT_PY:-/home/phamkien/lupiva/.venv-privacy-trial/bin/python}
DIRS="ocr_pool registry_review registry_export registry_pool form_pool schemas scripts"
ARCHIVE=$(mktemp)
trap 'rm -f "$ARCHIVE"' EXIT
git archive HEAD $DIRS > "$ARCHIVE"

ssh "$HOST" "cd $STAGING && tar xf -" < "$ARCHIVE"
echo "== regression check on staging"
ssh "$HOST" "cd $STAGING && PYTHONPATH=. .venv-privacy-trial/bin/python -X utf8 scripts/regression_check.py regression/config.json --workspace . > regression/last.log 2>&1; status=\$?; grep -E '^(ok|REGRESSION)' regression/last.log; exit \$status" \
  || { echo "regression check failed (see ~/$STAGING/regression/last.log); pilot not changed" >&2; exit 2; }

echo "== deploy to pilot"
scp -q "$ARCHIVE" "$HOST:lupiva-deploy.tar"
scp -q scripts/pilot_deploy.sh "$HOST:pilot_deploy.sh"
ssh "$HOST" "IMPORT_PY=$IMPORT_PY bash pilot_deploy.sh ~/$PILOT ~/lupiva-deploy.tar $UNITS; rm -f ~/lupiva-deploy.tar"
