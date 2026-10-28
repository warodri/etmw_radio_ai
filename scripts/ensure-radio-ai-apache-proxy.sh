#!/usr/bin/env bash
# Write ETMW Radio AI's own Apache conf: static client at /apps/radio-ai plus
# the /apps/radio-ai/api proxy. Shared vhosts and other apps' confs are untouched.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_ROOT/scripts/deploy-config.sh"

require_deploy_command ssh
require_deploy_command sshpass
verify_remote_login

echo "==> Ensuring ETMW Radio AI Apache routes"

sync_apache() {
  remote_sshpass \
    "REMOTE_SERVER_ENV_FILE='$REMOTE_SERVER_ENV_FILE' REMOTE_WEB_ROOT='$REMOTE_WEB_ROOT' APACHE_CONF_NAME='$APACHE_CONF_NAME' APACHE_CLIENT_PREFIX='$APACHE_CLIENT_PREFIX' SERVER_PORT='$SERVER_PORT' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

PORT="$SERVER_PORT"
if [[ -f "$REMOTE_SERVER_ENV_FILE" ]]; then
  from_env="$(grep -E '^PORT=' "$REMOTE_SERVER_ENV_FILE" | tail -1 | cut -d= -f2 | tr -d '[:space:]' || true)"
  [[ -n "$from_env" ]] && PORT="$from_env"
fi

CONF_FILE="/etc/apache2/conf-available/$APACHE_CONF_NAME.conf"
API_BASE="http://127.0.0.1:$PORT"

{
  echo "# ETMW Radio AI — static Angular client under $APACHE_CLIENT_PREFIX and its API proxy."
  echo "# Written by scripts/ensure-radio-ai-apache-proxy.sh. Shared vhosts are not edited."
  echo "ProxyPreserveHost On"
  echo
  echo "# REST API"
  echo "ProxyPass \"$APACHE_CLIENT_PREFIX/api\" \"$API_BASE/api\""
  echo "ProxyPassReverse \"$APACHE_CLIENT_PREFIX/api\" \"$API_BASE/api\""
  echo
  echo "# Research and script generation can take several minutes."
  echo "ProxyTimeout 1200"
  echo
  echo "<Directory \"$REMOTE_WEB_ROOT\">"
  echo "  Options -Indexes +FollowSymLinks"
  echo "  AllowOverride None"
  echo "  Require all granted"
  echo "  DirectoryIndex index.html"
  echo "  FallbackResource $APACHE_CLIENT_PREFIX/index.html"
  echo
  echo "  <FilesMatch \"index\\.html$\">"
  echo "    Header set Cache-Control \"no-cache, no-store, must-revalidate\""
  echo "  </FilesMatch>"
  echo
  echo "  <FilesMatch \"\\.(js|css|woff2|woff|ttf|svg|png|jpe?g|webp|ico)$\">"
  echo "    Header set Cache-Control \"public, max-age=31536000, immutable\""
  echo "  </FilesMatch>"
  echo "</Directory>"
} > "$CONF_FILE"

a2enmod proxy proxy_http headers >/dev/null
a2enconf "$APACHE_CONF_NAME" >/dev/null

if ! apache2ctl configtest; then
  echo "Apache refused $APACHE_CONF_NAME — disabling it again; the rest of the server is untouched." >&2
  a2disconf "$APACHE_CONF_NAME" >/dev/null 2>&1 || true
  exit 1
fi

systemctl reload apache2

# The API must stay loopback-only; Apache is the public door.
ufw delete allow "$PORT"/tcp >/dev/null 2>&1 || true

echo "Apache routes ready for $APACHE_CLIENT_PREFIX (api -> $API_BASE)."
REMOTE_SCRIPT
}

retry_command "sync ETMW Radio AI Apache routes" sync_apache
echo "==> ETMW Radio AI Apache routes are in sync."
