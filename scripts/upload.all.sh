#!/usr/bin/env bash
# Full ETMW Radio AI deployment: server, client, Apache routes, public check.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_ROOT/scripts/deploy-config.sh"

require_deploy_command curl

echo "==============================================================="
echo " ETMW Radio AI — full deployment"
echo " Client: $PUBLIC_SITE_URL/"
echo " Server: $REMOTE_HOST:$REMOTE_SERVER_DIR (port $SERVER_PORT)"
echo "==============================================================="

bash "$PROJECT_ROOT/scripts/upload.server.sh"
bash "$PROJECT_ROOT/scripts/upload.client.sh"
bash "$PROJECT_ROOT/scripts/ensure-radio-ai-apache-proxy.sh"

echo "==> Checking the public endpoint"
HEALTHY=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$PUBLIC_HEALTH_URL" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [[ "$HEALTHY" -ne 1 ]]; then
  echo "Public health check failed: $PUBLIC_HEALTH_URL"
  exit 1
fi

if ! curl -fsS -H 'Cache-Control: no-cache' "$PUBLIC_SITE_URL/" | grep -q 'ETMW Radio AI'; then
  echo "The public client did not return the ETMW Radio AI page."
  exit 1
fi

echo "==> Deployment complete: $PUBLIC_HEALTH_URL"
