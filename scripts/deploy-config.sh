#!/usr/bin/env bash
# Shared configuration for the ETMW Radio AI deploy scripts.
#
#   Client  https://entertomyworld.com/apps/radio-ai/
#           -> /var/www/entertomyworld.com/apps/radio-ai
#   Server  /opt/radio-ai/server  -> pm2 `radio-ai-server`, port 4330
#   API     /apps/radio-ai/api    -> http://127.0.0.1:4330/api
set -euo pipefail

RADIO_ROOT="${RADIO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# --- Droplet ----------------------------------------------------------------
# Credentials live in .env.deploy (gitignored) or in the shell environment.
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$RADIO_ROOT/.env.deploy}"
if [[ -z "${REMOTE_PASSWORD:-}" && -f "$DEPLOY_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
fi
REMOTE_HOST="${REMOTE_HOST:-root@entertomyworld.com}"
REMOTE_PASSWORD="${REMOTE_PASSWORD:-}"

# --- Where things live on entertomyworld.com ---------------------------------
REMOTE_WEB_ROOT="${REMOTE_WEB_ROOT:-/var/www/entertomyworld.com/apps/radio-ai}"
REMOTE_SERVER_DIR="${REMOTE_SERVER_DIR:-/opt/radio-ai/server}"
REMOTE_ENV_DIR="${REMOTE_ENV_DIR:-/etc/radio-ai}"
REMOTE_SERVER_ENV_FILE="${REMOTE_SERVER_ENV_FILE:-$REMOTE_ENV_DIR/server.env}"
PM2_SERVER_NAME="${PM2_SERVER_NAME:-radio-ai-server}"

SERVER_PORT="${SERVER_PORT:-4330}"
CLIENT_BASE_HREF="${CLIENT_BASE_HREF:-/apps/radio-ai/}"
PUBLIC_SITE_URL="${PUBLIC_SITE_URL:-https://entertomyworld.com/apps/radio-ai}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-$PUBLIC_SITE_URL/api/health}"

APACHE_CONF_NAME="${APACHE_CONF_NAME:-radio-ai}"
APACHE_CLIENT_PREFIX="${APACHE_CLIENT_PREFIX:-/apps/radio-ai}"
APACHE_DOCUMENT_ROOT="${APACHE_DOCUMENT_ROOT:-/var/www/entertomyworld.com}"

REMOTE_NODE_VERSION="${REMOTE_NODE_VERSION:-20}"
SSH_OPTS="${SSH_OPTS:- -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1 -o ConnectTimeout=20}"

# --- helpers -----------------------------------------------------------------
require_deploy_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1"
    exit 1
  }
}

retry_command() {
  local description="$1"
  shift
  local attempt

  for attempt in 1 2 3; do
    if "$@"; then
      return 0
    fi

    if [[ "$attempt" -lt 3 ]]; then
      echo "Retrying: $description (attempt $((attempt + 1))/3)"
      sleep 6
    fi
  done

  echo "Failed: $description"
  return 1
}

remote_sshpass() {
  SSHPASS="$REMOTE_PASSWORD" sshpass -e ssh $SSH_OPTS "$REMOTE_HOST" "$@"
}

remote_rsync_sshpass() {
  SSHPASS="$REMOTE_PASSWORD" sshpass -e rsync -avz -e "ssh $SSH_OPTS" "$@"
}

assert_paths_are_ours() {
  local docroot="${APACHE_DOCUMENT_ROOT%/}"

  if [[ "$REMOTE_WEB_ROOT" == "$docroot" || "$REMOTE_WEB_ROOT" != "$docroot/apps/radio-ai" ]]; then
    echo "Refusing to deploy the client to '$REMOTE_WEB_ROOT'."
    echo "The client must live at $docroot/apps/radio-ai."
    exit 1
  fi

  if [[ "$REMOTE_SERVER_DIR" == "/opt" || "$REMOTE_SERVER_DIR" != "/opt/radio-ai/server" ]]; then
    echo "Refusing to deploy the server to '$REMOTE_SERVER_DIR'."
    echo "The server must live at /opt/radio-ai/server."
    exit 1
  fi

  if [[ "$PM2_SERVER_NAME" != "radio-ai-server" ]]; then
    echo "Refusing to manage pm2 process '$PM2_SERVER_NAME'."
    exit 1
  fi
}

verify_remote_login() {
  require_deploy_command sshpass
  assert_paths_are_ours

  echo "==> Verifying remote login to $REMOTE_HOST"
  if ! retry_command "verify remote login" \
    env SSHPASS="$REMOTE_PASSWORD" sshpass -e ssh $SSH_OPTS "$REMOTE_HOST" "exit 0"; then
    echo "Remote login failed for $REMOTE_HOST."
    exit 1
  fi
}

remote_node_block() {
  cat <<'REMOTE_NODE'
source ~/.nvm/nvm.sh >/dev/null 2>&1 || true
nvm use default --silent >/dev/null 2>&1 || true
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR:-0}" -lt 20 ]]; then
  echo "Node 20+ is required on the droplet; found $(node -v 2>/dev/null || echo none)." >&2
  exit 1
fi
REMOTE_NODE
}
