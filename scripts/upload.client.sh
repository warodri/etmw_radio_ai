#!/usr/bin/env bash
# Build the ETMW Radio AI Angular client and upload it to the droplet.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_ROOT/scripts/deploy-config.sh"

CLIENT_DIR="$PROJECT_ROOT/CLIENT"

require_deploy_command npm
require_deploy_command rsync
require_deploy_command ssh
require_deploy_command sshpass
verify_remote_login

echo "==> Installing ETMW Radio AI client dependencies"
npm --prefix "$CLIENT_DIR" ci

echo "==> Cleaning previous client build"
rm -rf "$CLIENT_DIR/dist/radio-ai"

echo "==> Building client with base href $CLIENT_BASE_HREF"
npm --prefix "$CLIENT_DIR" run build -- --base-href "$CLIENT_BASE_HREF"

DIST_DIR="$CLIENT_DIR/dist/radio-ai/browser"
if [[ ! -d "$DIST_DIR" ]]; then
  DIST_DIR="$CLIENT_DIR/dist/radio-ai"
fi

if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "Angular build index.html was not found under $DIST_DIR."
  exit 1
fi

if ! grep -q "<base href=\"$CLIENT_BASE_HREF\"" "$DIST_DIR/index.html"; then
  echo "Angular build base href does not match $CLIENT_BASE_HREF."
  exit 1
fi

echo "==> Uploading client to $REMOTE_HOST:$REMOTE_WEB_ROOT"
remote_sshpass "mkdir -p '$REMOTE_WEB_ROOT'"
remote_rsync_sshpass --delete \
  --exclude '.DS_Store' \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  "$DIST_DIR"/ "$REMOTE_HOST:$REMOTE_WEB_ROOT/"

echo "==> ETMW Radio AI client upload complete."
echo "    $PUBLIC_SITE_URL/"
