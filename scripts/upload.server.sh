#!/usr/bin/env bash
# Build the ETMW Radio AI API, upload it to /opt/radio-ai/server and restart pm2.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_ROOT/scripts/deploy-config.sh"

SERVER_DIR="$PROJECT_ROOT/SERVER"
LOCAL_PRODUCTION_ENV="$SERVER_DIR/.env.production"
LOCAL_DEVELOPMENT_ENV="$SERVER_DIR/.env"

require_deploy_command npm
require_deploy_command rsync
require_deploy_command ssh
require_deploy_command sshpass
verify_remote_login

echo "==> Installing ETMW Radio AI server dependencies"
npm --prefix "$SERVER_DIR" ci

echo "==> Building ETMW Radio AI server"
npm --prefix "$SERVER_DIR" run build

if [[ ! -f "$SERVER_DIR/dist/server.js" ]]; then
  echo "Server build output not found at $SERVER_DIR/dist/server.js"
  exit 1
fi

echo "==> Preparing remote server directory"
remote_sshpass "mkdir -p '$REMOTE_SERVER_DIR' '$REMOTE_ENV_DIR'"

echo "==> Uploading server (production .env is never overwritten)"
remote_rsync_sshpass --delete \
  --exclude 'node_modules/' \
  --exclude 'logs/' \
  --exclude '.env' \
  --exclude '.env.example' \
  --exclude '.env.production' \
  "$SERVER_DIR"/ "$REMOTE_HOST:$REMOTE_SERVER_DIR/"

if ! remote_sshpass "test -f '$REMOTE_SERVER_ENV_FILE'"; then
  if [[ -f "$LOCAL_PRODUCTION_ENV" ]]; then
    STAGED_ENV="$LOCAL_PRODUCTION_ENV"
  elif [[ -f "$LOCAL_DEVELOPMENT_ENV" ]]; then
    STAGED_ENV="$LOCAL_DEVELOPMENT_ENV"
  else
    echo "Remote env file is missing and no local SERVER/.env.production or SERVER/.env exists."
    exit 1
  fi

  echo "==> First deployment: uploading $STAGED_ENV to $REMOTE_SERVER_ENV_FILE"
  remote_rsync_sshpass --chmod=Fu=rw,Fgo= \
    "$STAGED_ENV" "$REMOTE_HOST:$REMOTE_SERVER_ENV_FILE"
fi

# The rest of the production env is preserved, but the admin list is kept in
# sync with the project env file so adding an admin is just an edit + deploy.
ADMIN_EMAILS_VALUE=""
LOCAL_ADMIN_ENV="$LOCAL_PRODUCTION_ENV"
if [[ -f "$LOCAL_ADMIN_ENV" ]]; then
  ADMIN_EMAILS_VALUE="$(grep -E '^ADMIN_EMAILS=' "$LOCAL_ADMIN_ENV" | tail -1 | cut -d= -f2- || true)"
fi

echo "==> Installing dependencies and restarting pm2 '$PM2_SERVER_NAME'"
remote_sshpass \
  "REMOTE_SERVER_DIR='$REMOTE_SERVER_DIR' REMOTE_SERVER_ENV_FILE='$REMOTE_SERVER_ENV_FILE' PM2_SERVER_NAME='$PM2_SERVER_NAME' SERVER_PORT='$SERVER_PORT' REMOTE_NODE_VERSION='$REMOTE_NODE_VERSION' ADMIN_EMAILS_VALUE='$ADMIN_EMAILS_VALUE' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

source ~/.nvm/nvm.sh >/dev/null 2>&1 || true
nvm use "$REMOTE_NODE_VERSION" --silent >/dev/null 2>&1 || nvm use default --silent >/dev/null 2>&1 || true

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR:-0}" -lt 20 ]]; then
  echo "Node 20+ is required on the droplet; found $(node -v 2>/dev/null || echo none)." >&2
  exit 1
fi

cd "$REMOTE_SERVER_DIR"

if [[ ! -f "$REMOTE_SERVER_ENV_FILE" ]]; then
  echo "Production env file not found at $REMOTE_SERVER_ENV_FILE"
  exit 1
fi

if [[ -n "${ADMIN_EMAILS_VALUE:-}" ]]; then
  ENV_TMP="$(mktemp)"
  awk -v value="$ADMIN_EMAILS_VALUE" '
    /^ADMIN_EMAILS=/ { print "ADMIN_EMAILS=" value; found=1; next }
    { print }
    END { if (!found) print "ADMIN_EMAILS=" value }
  ' "$REMOTE_SERVER_ENV_FILE" > "$ENV_TMP"
  cat "$ENV_TMP" > "$REMOTE_SERVER_ENV_FILE"
  rm -f "$ENV_TMP"
fi

cp "$REMOTE_SERVER_ENV_FILE" "$REMOTE_SERVER_DIR/.env"
chmod 600 "$REMOTE_SERVER_ENV_FILE" "$REMOTE_SERVER_DIR/.env"

if ! npm ci --omit=dev; then
  npm install --omit=dev
fi

export NODE_ENV=production

if pm2 describe "$PM2_SERVER_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_SERVER_NAME" --update-env
else
  pm2 start dist/server.js --name "$PM2_SERVER_NAME" --cwd "$REMOTE_SERVER_DIR" --update-env
fi

pm2 save >/dev/null

PORT="$SERVER_PORT"
from_env="$(grep -E '^PORT=' "$REMOTE_SERVER_DIR/.env" | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)"
[[ -n "$from_env" ]] && PORT="$from_env"

HEALTHY=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [[ "$HEALTHY" -ne 1 ]]; then
  echo "Server did not answer its health check on 127.0.0.1:$PORT." >&2
  pm2 logs "$PM2_SERVER_NAME" --lines 30 --nostream >&2 || true
  exit 1
fi

echo "Server healthy on 127.0.0.1:$PORT (pm2: $PM2_SERVER_NAME, node $(node -v))."
REMOTE_SCRIPT

echo "==> ETMW Radio AI server upload complete."
