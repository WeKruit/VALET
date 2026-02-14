#!/bin/bash
# =============================================================================
# deploy-worker.sh — Deploy the Valet worker to an EC2 instance
# =============================================================================
# Usage: ./deploy-worker.sh --host <ec2-ip> --key <ssh-key-path> [--skip-build] [--rollback-on-failure]
#
# Deploys the Valet Hatchet worker to an EC2 instance provisioned via
# Terraform with cloud-init. Builds the worker locally, creates a tarball
# with all required workspace packages, uploads it, installs dependencies,
# and configures the systemd service.
#
# Options:
#   --skip-build          Skip local build step (use existing dist/ artifacts)
#   --rollback-on-failure Automatically rollback to previous version if health
#                         check fails (default: prompt interactively)
#
# Prerequisites:
#   - EC2 instance provisioned via Terraform (cloud-init complete)
#   - Node.js and pnpm installed on the EC2 instance
#   - SSH access to the instance as 'ubuntu' user
#   - Local monorepo with pnpm and all dependencies installed
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; }
die()     { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
EC2_IP=""
SSH_KEY=""
SKIP_BUILD=false
ROLLBACK_ON_FAILURE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)
            EC2_IP="$2"
            shift 2
            ;;
        --key)
            SSH_KEY="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --rollback-on-failure)
            ROLLBACK_ON_FAILURE=true
            shift
            ;;
        -*)
            die "Unknown option: $1"
            ;;
        *)
            # Backward-compatible positional args: <ec2-ip> [ssh-key-path]
            if [[ -z "$EC2_IP" ]]; then
                EC2_IP="$1"
            elif [[ -z "$SSH_KEY" ]]; then
                SSH_KEY="$1"
            else
                die "Unexpected argument: $1"
            fi
            shift
            ;;
    esac
done

if [[ -z "$EC2_IP" ]]; then
    echo -e "${BOLD}Usage:${NC} $0 --host <ip> --key <path-to-key> [--skip-build] [--rollback-on-failure]"
    echo ""
    echo "  --host <ip>            Public IP or hostname of the EC2 instance"
    echo "  --key <path>           Path to SSH private key (default: ~/.ssh/valet-worker.pem)"
    echo "  --skip-build           Skip local build (use existing dist/ artifacts)"
    echo "  --rollback-on-failure  Auto-rollback on health check failure (no prompt)"
    echo ""
    echo "Positional args also supported: $0 <ec2-ip> [ssh-key-path]"
    echo ""
    echo "Examples:"
    echo "  $0 --host 54.123.45.67 --key ~/.ssh/valet-worker.pem"
    echo "  $0 --host 54.123.45.67 --key /tmp/deploy-key.pem --skip-build"
    echo "  $0 54.123.45.67"
    exit 1
fi

SSH_KEY="${SSH_KEY:-$HOME/.ssh/valet-worker.pem}"
SSH_USER="ubuntu"
REMOTE_APP_DIR="/opt/valet/app"
REMOTE_ENV_DIR="/opt/valet"
REMOTE_BACKUP_DIR="/opt/valet/app-backup"

# Resolve monorepo root (two levels up from infra/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Validate SSH key
if [[ ! -f "$SSH_KEY" ]]; then
    die "SSH key not found: $SSH_KEY"
fi

# Validate SSH key permissions
KEY_PERMS=$(stat -f "%Lp" "$SSH_KEY" 2>/dev/null || stat -c "%a" "$SSH_KEY" 2>/dev/null)
if [[ "$KEY_PERMS" != "400" && "$KEY_PERMS" != "600" ]]; then
    warn "SSH key permissions are $KEY_PERMS (expected 400 or 600). Fixing..."
    chmod 600 "$SSH_KEY"
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH_CMD="ssh $SSH_OPTS $SSH_USER@$EC2_IP"
SCP_CMD="scp $SSH_OPTS"

# ---------------------------------------------------------------------------
# Step 1: Test SSH connectivity
# ---------------------------------------------------------------------------
info "Testing SSH connectivity to $EC2_IP..."
if ! $SSH_CMD "echo 'SSH OK'" &>/dev/null; then
    die "Cannot connect to $EC2_IP via SSH. Check the IP, key, and security group."
fi
success "SSH connection established"

# ---------------------------------------------------------------------------
# Step 2: Build the worker locally (unless --skip-build)
# ---------------------------------------------------------------------------
if [[ "$SKIP_BUILD" == "true" ]]; then
    info "Skipping build (--skip-build)"
else
    info "Building worker and dependencies locally..."
    cd "$REPO_ROOT"

    pnpm --filter @valet/shared build
    pnpm --filter @valet/contracts build
    pnpm --filter @valet/db build
    pnpm --filter @valet/llm build
    pnpm --filter @valet/worker build

    success "Build complete"
fi

# ---------------------------------------------------------------------------
# Step 3: Create deployment tarball
# ---------------------------------------------------------------------------
TARBALL_NAME="valet-worker-$(date +%Y%m%d-%H%M%S).tar.gz"
TARBALL_PATH="/tmp/$TARBALL_NAME"

info "Creating deployment tarball..."

tar -czf "$TARBALL_PATH" \
    -C "$REPO_ROOT" \
    apps/worker/dist/ \
    apps/worker/package.json \
    packages/shared/dist/ \
    packages/shared/package.json \
    packages/db/dist/ \
    packages/db/package.json \
    packages/contracts/dist/ \
    packages/contracts/package.json \
    packages/llm/dist/ \
    packages/llm/package.json \
    package.json \
    pnpm-workspace.yaml \
    pnpm-lock.yaml

TARBALL_SIZE=$(du -h "$TARBALL_PATH" | cut -f1)
success "Tarball created: $TARBALL_PATH ($TARBALL_SIZE)"

# ---------------------------------------------------------------------------
# Step 4: Upload tarball to EC2
# ---------------------------------------------------------------------------
info "Uploading tarball to $EC2_IP..."
$SCP_CMD "$TARBALL_PATH" "$SSH_USER@$EC2_IP:/tmp/$TARBALL_NAME"
success "Upload complete"

# Clean up local tarball
rm -f "$TARBALL_PATH"

# ---------------------------------------------------------------------------
# Step 5: Deploy on the remote instance (with backup)
# ---------------------------------------------------------------------------
info "Deploying on remote instance..."

$SSH_CMD bash -s "$TARBALL_NAME" "$REMOTE_APP_DIR" "$REMOTE_ENV_DIR" "$REMOTE_BACKUP_DIR" << 'DEPLOY_SCRIPT'
set -euo pipefail

TARBALL_NAME="$1"
APP_DIR="$2"
ENV_DIR="$3"
BACKUP_DIR="$4"

echo "==> Preparing directories..."
sudo mkdir -p "$APP_DIR"
sudo chown -R valet:valet "$APP_DIR" 2>/dev/null || sudo chown -R ubuntu:ubuntu "$APP_DIR"

# --- Create backup of current deployment ---
if [[ -d "$APP_DIR/apps" ]]; then
    echo "==> Creating backup of current deployment..."
    sudo rm -rf "$BACKUP_DIR"
    sudo cp -a "$APP_DIR" "$BACKUP_DIR"
else
    echo "==> No existing deployment to back up (first deploy)"
fi

echo "==> Extracting tarball..."
sudo tar -xzf "/tmp/$TARBALL_NAME" -C "$APP_DIR" --strip-components=0
sudo rm -f "/tmp/$TARBALL_NAME"

# Set ownership
if id valet &>/dev/null; then
    sudo chown -R valet:valet "$APP_DIR"
else
    sudo chown -R ubuntu:ubuntu "$APP_DIR"
fi

echo "==> Installing production dependencies..."
cd "$APP_DIR"
# pnpm install for production — frozen lockfile ensures reproducibility
if command -v pnpm &>/dev/null; then
    sudo -u "$(stat -c '%U' "$APP_DIR")" bash -c "cd $APP_DIR && pnpm install --prod --frozen-lockfile" || {
        echo "WARN: --frozen-lockfile failed, retrying without it..."
        sudo -u "$(stat -c '%U' "$APP_DIR")" bash -c "cd $APP_DIR && pnpm install --prod"
    }
else
    echo "ERROR: pnpm not found. Install it: npm install -g pnpm"
    exit 1
fi

echo "==> Setting up .env file..."
ENV_FILE="$ENV_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    cat > "/tmp/valet-env-template" << 'ENV_TEMPLATE'
# =============================================================================
# Valet Worker — Environment Variables
# =============================================================================
# Fill in the required values below. This file is read by the valet-worker
# systemd service via EnvironmentFile.
# =============================================================================

# ─── Hatchet (REQUIRED) ───
HATCHET_CLIENT_TOKEN=
HATCHET_CLIENT_TLS_STRATEGY=tls
HATCHET_CLIENT_TLS_SERVER_NAME=valet-hatchet-stg.fly.dev
HATCHET_CLIENT_HOST_PORT=valet-hatchet-stg.fly.dev:443

# ─── Database (REQUIRED) ───
DATABASE_URL=

# ─── Redis (REQUIRED) ───
REDIS_URL=

# ─── AdsPower ───
ADSPOWER_API_URL=http://localhost:50325
ADSPOWER_API_KEY=

# ─── LLM Providers ───
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# ─── Object Storage ───
S3_ENDPOINT=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=us-east-1
S3_BUCKET_RESUMES=resumes
S3_BUCKET_SCREENSHOTS=screenshots
S3_BUCKET_ARTIFACTS=artifacts

# ─── Monitoring ───
SENTRY_DSN=
LOG_LEVEL=info
NODE_ENV=production
ENV_TEMPLATE

    sudo mv "/tmp/valet-env-template" "$ENV_FILE"
    if id valet &>/dev/null; then
        sudo chown valet:valet "$ENV_FILE"
    fi
    sudo chmod 600 "$ENV_FILE"
    echo "NOTICE: Created $ENV_FILE — you MUST fill in the required secrets."
    echo "        Run: infra/scripts/set-secrets.sh <ec2-ip> to set them interactively."
fi

echo "==> Installing systemd service..."
sudo tee /etc/systemd/system/valet-worker.service > /dev/null << 'SERVICE'
[Unit]
Description=Valet Browser Worker
After=network.target xvfb.service
Requires=xvfb.service

[Service]
Type=simple
User=valet
WorkingDirectory=/opt/valet/app
EnvironmentFile=/opt/valet/.env
ExecStart=/usr/bin/node apps/worker/dist/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# If valet user doesn't exist, use ubuntu
if ! id valet &>/dev/null; then
    echo "WARN: 'valet' user not found, adjusting service to use 'ubuntu'"
    sudo sed -i 's/User=valet/User=ubuntu/' /etc/systemd/system/valet-worker.service
fi

echo "==> Reloading systemd and restarting valet-worker..."
sudo systemctl daemon-reload
sudo systemctl enable valet-worker
sudo systemctl restart valet-worker

echo "==> Waiting for service to stabilize (5s)..."
sleep 5

if sudo systemctl is-active --quiet valet-worker; then
    echo "SUCCESS: valet-worker is running"
else
    echo "ERROR: valet-worker failed to start. Check logs:"
    echo "  sudo journalctl -u valet-worker -n 50 --no-pager"
    exit 1
fi
DEPLOY_SCRIPT

success "Deployment complete"

# ---------------------------------------------------------------------------
# Step 6: Health check with retries
# ---------------------------------------------------------------------------
info "Running health check (3 attempts with backoff)..."

HEALTH_OK=false
MAX_RETRIES=3
RETRY_DELAY=5

for attempt in $(seq 1 $MAX_RETRIES); do
    info "Health check attempt $attempt/$MAX_RETRIES..."

    # Check systemd service status
    SERVICE_STATUS=$($SSH_CMD "sudo systemctl is-active valet-worker 2>/dev/null" 2>/dev/null || echo "inactive")

    if [[ "$SERVICE_STATUS" == "active" ]]; then
        # Check for crash loops
        RESTART_COUNT=$($SSH_CMD "sudo systemctl show valet-worker --property=NRestarts --value 2>/dev/null" 2>/dev/null || echo "0")

        if [[ "$RESTART_COUNT" -lt 3 ]]; then
            success "Health check PASSED (service active, restarts=$RESTART_COUNT)"
            HEALTH_OK=true
            break
        else
            warn "Service active but $RESTART_COUNT restarts detected (possible crash loop)"
        fi
    else
        warn "Service status: $SERVICE_STATUS"
    fi

    if [[ $attempt -lt $MAX_RETRIES ]]; then
        info "Retrying in ${RETRY_DELAY}s..."
        sleep $RETRY_DELAY
        RETRY_DELAY=$((RETRY_DELAY * 2))
    fi
done

# ---------------------------------------------------------------------------
# Step 7: Rollback if health check failed
# ---------------------------------------------------------------------------
if [[ "$HEALTH_OK" != "true" ]]; then
    error "Health check FAILED after $MAX_RETRIES attempts"

    SHOULD_ROLLBACK=false
    if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
        SHOULD_ROLLBACK=true
    else
        echo ""
        read -r -p "  Rollback to previous version? [y/N] " CONFIRM
        if [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]]; then
            SHOULD_ROLLBACK=true
        fi
    fi

    if [[ "$SHOULD_ROLLBACK" == "true" ]]; then
        info "Rolling back to previous version..."

        $SSH_CMD bash -s "$REMOTE_APP_DIR" "$REMOTE_BACKUP_DIR" << 'ROLLBACK_SCRIPT'
        set -euo pipefail

        APP_DIR="$1"
        BACKUP_DIR="$2"

        if [[ -d "$BACKUP_DIR/apps" ]]; then
            echo "==> Restoring from backup..."
            sudo rm -rf "$APP_DIR"
            sudo mv "$BACKUP_DIR" "$APP_DIR"
            sudo systemctl restart valet-worker
            sleep 5
            if sudo systemctl is-active --quiet valet-worker; then
                echo "ROLLBACK SUCCESS: Previous version restored and running"
            else
                echo "ROLLBACK WARNING: Previous version restored but service failed to start"
                sudo journalctl -u valet-worker -n 20 --no-pager
            fi
        else
            echo "ROLLBACK SKIPPED: No backup available (was this the first deploy?)"
        fi
ROLLBACK_SCRIPT

        # Check if rollback succeeded
        ROLLBACK_STATUS=$($SSH_CMD "sudo systemctl is-active valet-worker 2>/dev/null" 2>/dev/null || echo "inactive")
        if [[ "$ROLLBACK_STATUS" == "active" ]]; then
            success "Rollback successful — previous version is running"
        else
            error "Rollback failed — manual intervention required"
        fi
    else
        warn "Rollback skipped. Check logs manually:"
        echo -e "  ssh -i $SSH_KEY $SSH_USER@$EC2_IP 'sudo journalctl -u valet-worker -n 50 --no-pager'"
    fi

    exit 1
fi

# ---------------------------------------------------------------------------
# Step 8: Print summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=========================================${NC}"
echo -e "${GREEN}  Deployment Summary${NC}"
echo -e "${BOLD}=========================================${NC}"
echo ""
echo -e "  Instance:        ${BOLD}$EC2_IP${NC}"
echo -e "  Worker status:   $($SSH_CMD 'sudo systemctl is-active valet-worker' 2>/dev/null || echo 'unknown')"
echo -e "  noVNC URL:       ${BLUE}http://$EC2_IP:6080${NC}"
echo -e "  SSH:             ssh -i $SSH_KEY $SSH_USER@$EC2_IP"
echo ""
echo -e "  ${YELLOW}Logs:${NC}   ssh -i $SSH_KEY $SSH_USER@$EC2_IP 'sudo journalctl -u valet-worker -f'"
echo ""

# Check if .env has been filled in
SECRETS_CHECK=$($SSH_CMD "grep -c '^HATCHET_CLIENT_TOKEN=$' /opt/valet/.env 2>/dev/null" 2>/dev/null || echo "0")
if [[ "$SECRETS_CHECK" != "0" ]]; then
    warn "Environment secrets are NOT configured yet!"
    echo -e "  Run: ${BOLD}./infra/scripts/set-secrets.sh $EC2_IP${NC}"
    echo ""
fi
