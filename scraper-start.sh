#!/bin/bash
set -euo pipefail

# Fill these in before pasting into Dokploy's Schedule Script box:
API_TOKEN="<YOUR_API_TOKEN>"
APP_ID="<YOUR_APP_ID>"
DOKPLOY_PORT="3000"   # verify: docker ps --format '{{.Names}}\t{{.Ports}}' | grep -i dokploy

RESPONSE=$(curl -s -o /tmp/scraper-start-response.json -w "%{http_code}" \
  -X POST "http://localhost:${DOKPLOY_PORT}/api/application.start" \
  -H "x-api-key: ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"applicationId\":\"${APP_ID}\"}")

echo "$(date '+%F %T') application.start -> HTTP ${RESPONSE}"
cat /tmp/scraper-start-response.json

if [ "$RESPONSE" -ge 400 ]; then
  exit 1
fi
