#!/usr/bin/env bash
# ===========================================================================
# WeKruit Valet - Fly.io Environment Setup
# ===========================================================================
# Creates Fly.io apps for a given environment and sets secrets.
#
# Usage:
#   ./scripts/setup-fly.sh <env>
#
# Examples:
#   ./scripts/setup-fly.sh dev
#   ./scripts/setup-fly.sh stg
#   ./scripts/setup-fly.sh prod
#
# Prerequisites:
#   - flyctl installed (https://fly.io/docs/hands-on/install-flyctl/)
#   - Logged in: fly auth login
#   - Org set: fly orgs list (note your org slug)
# ===========================================================================

set -euo pipefail

ENV="${1:?Usage: $0 <dev|stg|prod>}"
REGION="iad"

# Map environment to app suffix and name
case "$ENV" in
  dev)
    SUFFIX="-dev"
    ;;
  stg)
    SUFFIX="-stg"
    ;;
  prod)
    SUFFIX=""
    ;;
  *)
    echo "Error: env must be dev, stg, or prod"
    exit 1
    ;;
esac

API_APP="valet-api${SUFFIX}"
WORKER_APP="valet-worker${SUFFIX}"
WEB_APP="valet-web${SUFFIX}"
echo "╔══════════════════════════════════════════╗"
echo "║  Setting up Fly.io apps for: ${ENV}        "
echo "║  API:     ${API_APP}                       "
echo "║  Worker:  ${WORKER_APP}                    "
echo "║  Web:     ${WEB_APP}                       "
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Create apps ──
for APP in "$API_APP" "$WORKER_APP" "$WEB_APP"; do
  if fly apps list | grep -q "$APP"; then
    echo "✓ App $APP already exists"
  else
    echo "→ Creating app: $APP"
    fly apps create "$APP" --machines
  fi
done

echo ""
echo "Apps created. Now set secrets for each app."
echo ""
echo "─── Required secrets for API (${API_APP}) ───"
echo ""
echo "  fly secrets set -a ${API_APP} \\"
echo "    DATABASE_URL=\"your-supabase-connection-string\" \\"
echo "    REDIS_URL=\"your-upstash-redis-url\" \\"
echo "    GOOGLE_CLIENT_ID=\"your-google-client-id\" \\"
echo "    GOOGLE_CLIENT_SECRET=\"your-google-client-secret\" \\"
echo "    GOOGLE_CALLBACK_URL=\"https://${API_APP}.fly.dev/api/v1/auth/google/callback\" \\"
echo "    JWT_SECRET=\"\$(openssl rand -base64 48)\" \\"
echo "    JWT_REFRESH_SECRET=\"\$(openssl rand -base64 48)\" \\"
echo "    S3_ENDPOINT=\"https://[project-ref].storage.supabase.co/storage/v1/s3\" \\"
echo "    S3_ACCESS_KEY=\"your-supabase-s3-access-key\" \\"
echo "    S3_SECRET_KEY=\"your-supabase-s3-secret-key\" \\"
echo "    S3_REGION=\"us-east-1\" \\"
echo "    S3_BUCKET_RESUMES=\"resumes\" \\"
echo "    S3_BUCKET_SCREENSHOTS=\"screenshots\" \\"
echo "    S3_BUCKET_ARTIFACTS=\"artifacts\" \\"
echo "    ANTHROPIC_API_KEY=\"your-anthropic-key\" \\"
echo "    OPENAI_API_KEY=\"your-openai-key\" \\"
echo "    CORS_ORIGIN=\"https://${WEB_APP}.fly.dev\""
echo ""
echo "─── Required secrets for Worker (${WORKER_APP}) ───"
echo ""
echo "  fly secrets set -a ${WORKER_APP} \\"
echo "    DATABASE_URL=\"your-supabase-connection-string\" \\"
echo "    REDIS_URL=\"your-upstash-redis-url\" \\"
echo "    S3_ENDPOINT=\"https://[project-ref].storage.supabase.co/storage/v1/s3\" \\"
echo "    S3_ACCESS_KEY=\"your-supabase-s3-access-key\" \\"
echo "    S3_SECRET_KEY=\"your-supabase-s3-secret-key\" \\"
echo "    ANTHROPIC_API_KEY=\"your-anthropic-key\" \\"
echo "    OPENAI_API_KEY=\"your-openai-key\""
echo ""
echo "─── Web app (${WEB_APP}) needs no runtime secrets ───"
echo "  (VITE_* vars are injected at build time via --build-arg)"
echo ""
echo "─── GitHub Secrets (for CD pipeline) ───"
echo ""
echo "  Set these in GitHub → Settings → Environments → ${ENV}:"
echo "    FLY_API_TOKEN   = your Fly.io deploy token"
echo ""
echo "  Generate a deploy token:"
echo "    fly tokens create deploy -a ${API_APP}"
echo ""
echo "Done! After setting secrets, deploy with:"
echo "  fly deploy --config fly/api.toml --app ${API_APP} --remote-only"
echo "  fly deploy --config fly/worker.toml --app ${WORKER_APP} --remote-only"
echo "  fly deploy --config fly/web.toml --app ${WEB_APP} --remote-only \\"
echo "    --build-arg VITE_API_URL=https://${API_APP}.fly.dev \\"
echo "    --build-arg VITE_WS_URL=wss://${API_APP}.fly.dev"
