#!/bin/bash
# =============================================================================
# set-secrets.sh — Configure environment secrets on an EC2 worker instance
# =============================================================================
# Usage: ./set-secrets.sh <ec2-ip> [ssh-key-path]
#
# Interactively prompts for each required and optional secret, updates the
# .env file on the EC2 instance, and restarts the valet-worker service.
#
# The script reads the current .env to show existing values (masked) and
# allows skipping unchanged values by pressing Enter.
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
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; }
die()     { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo -e "${BOLD}Usage:${NC} $0 <ec2-ip> [ssh-key-path]"
    echo ""
    echo "  ec2-ip         Public IP or hostname of the EC2 instance"
    echo "  ssh-key-path   Path to SSH private key (default: ~/.ssh/valet-worker.pem)"
    echo ""
    echo "Examples:"
    echo "  $0 54.123.45.67"
    echo "  $0 54.123.45.67 ~/.ssh/my-key.pem"
    exit 1
fi

EC2_IP="$1"
SSH_KEY="${2:-$HOME/.ssh/valet-worker.pem}"
SSH_USER="ubuntu"
REMOTE_ENV_FILE="/opt/valet/.env"

# Validate SSH key
if [[ ! -f "$SSH_KEY" ]]; then
    die "SSH key not found: $SSH_KEY"
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"
SSH_CMD="ssh $SSH_OPTS $SSH_USER@$EC2_IP"

# ---------------------------------------------------------------------------
# Test SSH connectivity
# ---------------------------------------------------------------------------
info "Connecting to $EC2_IP..."
if ! $SSH_CMD "echo ok" &>/dev/null; then
    die "Cannot connect to $EC2_IP via SSH. Check the IP, key, and security group."
fi
success "Connected"

# ---------------------------------------------------------------------------
# Read current .env from instance
# ---------------------------------------------------------------------------
info "Reading current environment configuration..."

CURRENT_ENV=$($SSH_CMD "sudo cat $REMOTE_ENV_FILE 2>/dev/null" 2>/dev/null || echo "")

if [[ -z "$CURRENT_ENV" ]]; then
    warn "No .env file found at $REMOTE_ENV_FILE. A new one will be created."
    warn "Run deploy-worker.sh first to set up the template, or we'll create one now."
fi

# ---------------------------------------------------------------------------
# Helper: get current value of an env var
# ---------------------------------------------------------------------------
get_current() {
    local key="$1"
    echo "$CURRENT_ENV" | grep "^${key}=" | head -1 | cut -d'=' -f2- || echo ""
}

# ---------------------------------------------------------------------------
# Helper: mask a secret value for display
# ---------------------------------------------------------------------------
mask_value() {
    local val="$1"
    local len=${#val}
    if [[ $len -eq 0 ]]; then
        echo "(not set)"
    elif [[ $len -le 8 ]]; then
        echo "****"
    else
        echo "${val:0:4}...${val: -4}"
    fi
}

# ---------------------------------------------------------------------------
# Helper: prompt for a secret
# ---------------------------------------------------------------------------
prompt_secret() {
    local key="$1"
    local description="$2"
    local required="$3"
    local current
    current=$(get_current "$key")
    local masked
    masked=$(mask_value "$current")

    echo ""
    if [[ "$required" == "yes" ]]; then
        echo -e "  ${BOLD}$key${NC} ${RED}(required)${NC}"
    else
        echo -e "  ${BOLD}$key${NC} ${DIM}(optional)${NC}"
    fi
    echo -e "  ${DIM}$description${NC}"
    echo -e "  Current: ${YELLOW}$masked${NC}"

    local new_value=""
    if [[ "$required" == "yes" && -z "$current" ]]; then
        # Required and not set — must provide a value
        while [[ -z "$new_value" ]]; do
            read -r -p "  Enter value: " new_value
            if [[ -z "$new_value" ]]; then
                echo -e "  ${RED}This secret is required. Please enter a value.${NC}"
            fi
        done
    else
        read -r -p "  Enter value (Enter to keep current): " new_value
    fi

    if [[ -n "$new_value" ]]; then
        echo "$new_value"
    else
        echo "$current"
    fi
}

# ---------------------------------------------------------------------------
# Collect secrets
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=========================================${NC}"
echo -e "${BLUE}  Configure Worker Secrets${NC}"
echo -e "${BOLD}=========================================${NC}"
echo ""
echo -e "  Instance: ${BOLD}$EC2_IP${NC}"
echo -e "  Env file: $REMOTE_ENV_FILE"
echo ""
echo -e "  Press ${BOLD}Enter${NC} to keep the current value for any secret."
echo -e "  ${RED}Required${NC} secrets with no current value must be filled in."

# Associative array not available in bash 3 (macOS default), use parallel arrays
KEYS=()
VALUES=()

collect() {
    local key="$1"
    local desc="$2"
    local req="$3"
    local val
    val=$(prompt_secret "$key" "$desc" "$req")
    KEYS+=("$key")
    VALUES+=("$val")
}

# --- Required secrets ---
echo ""
echo -e "  ${BOLD}--- Required Secrets ---${NC}"

collect "DATABASE_URL" \
    "PostgreSQL connection string (Supabase transaction pooler, port 6543)" \
    "yes"

collect "REDIS_URL" \
    "Upstash Redis URL (rediss://...)" \
    "yes"

# --- Optional secrets ---
echo ""
echo -e "  ${BOLD}--- Optional Secrets ---${NC}"

collect "ADSPOWER_API_KEY" \
    "AdsPower API key (if AdsPower requires authentication)" \
    "no"

collect "ANTHROPIC_API_KEY" \
    "Anthropic API key for LLM features" \
    "no"

collect "OPENAI_API_KEY" \
    "OpenAI API key for LLM features" \
    "no"

collect "S3_ENDPOINT" \
    "Supabase Storage S3 endpoint (https://<ref>.storage.supabase.co/storage/v1/s3)" \
    "no"

collect "S3_ACCESS_KEY" \
    "S3 access key ID" \
    "no"

collect "S3_SECRET_KEY" \
    "S3 secret access key" \
    "no"

collect "SENTRY_DSN" \
    "Sentry DSN for error monitoring" \
    "no"

collect "LOG_LEVEL" \
    "Log level: debug, info, warn, error (default: info)" \
    "no"

# ---------------------------------------------------------------------------
# Build the .env content
# ---------------------------------------------------------------------------
echo ""
info "Building .env file..."

# Start with existing content (comments and non-secret lines)
ENV_CONTENT="# =============================================================================
# Valet Worker — Environment Variables
# =============================================================================
# Auto-generated by set-secrets.sh on $(date -u '+%Y-%m-%d %H:%M:%S UTC')
# =============================================================================

NODE_ENV=production
"

# Preserve existing non-prompted config values
ADSPOWER_URL=$(get_current "ADSPOWER_API_URL")
S3_REGION=$(get_current "S3_REGION")
S3_BUCKET_RESUMES=$(get_current "S3_BUCKET_RESUMES")
S3_BUCKET_SCREENSHOTS=$(get_current "S3_BUCKET_SCREENSHOTS")
S3_BUCKET_ARTIFACTS=$(get_current "S3_BUCKET_ARTIFACTS")

ENV_CONTENT+="
# ─── AdsPower ───
ADSPOWER_API_URL=${ADSPOWER_URL:-http://localhost:50325}

# ─── S3 Storage ───
S3_REGION=${S3_REGION:-us-east-1}
S3_BUCKET_RESUMES=${S3_BUCKET_RESUMES:-resumes}
S3_BUCKET_SCREENSHOTS=${S3_BUCKET_SCREENSHOTS:-screenshots}
S3_BUCKET_ARTIFACTS=${S3_BUCKET_ARTIFACTS:-artifacts}
"

# Add the prompted secrets
for i in "${!KEYS[@]}"; do
    key="${KEYS[$i]}"
    val="${VALUES[$i]}"
    ENV_CONTENT+="${key}=${val}
"
done

# ---------------------------------------------------------------------------
# Confirm before writing
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}The following secrets will be written:${NC}"
echo ""
for i in "${!KEYS[@]}"; do
    key="${KEYS[$i]}"
    val="${VALUES[$i]}"
    masked=$(mask_value "$val")
    if [[ -n "$val" ]]; then
        echo -e "  ${GREEN}SET${NC}   $key = $masked"
    else
        echo -e "  ${DIM}EMPTY${NC} $key"
    fi
done

echo ""
read -r -p "Write these secrets to $EC2_IP:$REMOTE_ENV_FILE? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    warn "Aborted. No changes made."
    exit 0
fi

# ---------------------------------------------------------------------------
# Write .env to instance
# ---------------------------------------------------------------------------
info "Writing .env to instance..."

# Write via SSH (avoids SCP and keeps it in a single connection)
echo "$ENV_CONTENT" | $SSH_CMD "sudo tee $REMOTE_ENV_FILE > /dev/null && sudo chmod 600 $REMOTE_ENV_FILE"

# Set ownership
$SSH_CMD "if id valet &>/dev/null; then sudo chown valet:valet $REMOTE_ENV_FILE; fi" 2>/dev/null || true

success ".env file written"

# ---------------------------------------------------------------------------
# Restart valet-worker
# ---------------------------------------------------------------------------
info "Restarting valet-worker service..."
$SSH_CMD "sudo systemctl restart valet-worker" 2>/dev/null || true

sleep 3

WORKER_STATUS=$($SSH_CMD "sudo systemctl is-active valet-worker 2>/dev/null" 2>/dev/null || echo "inactive")

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=========================================${NC}"
echo -e "${GREEN}  Secrets Updated${NC}"
echo -e "${BOLD}=========================================${NC}"
echo ""
echo -e "  Instance:        ${BOLD}$EC2_IP${NC}"
echo -e "  Env file:        $REMOTE_ENV_FILE"
echo -e "  Worker status:   $WORKER_STATUS"
echo ""

if [[ "$WORKER_STATUS" != "active" ]]; then
    warn "Worker is not running. Check logs:"
    echo -e "  ssh -i $SSH_KEY $SSH_USER@$EC2_IP 'sudo journalctl -u valet-worker -n 50 --no-pager'"
    echo ""
fi

echo -e "  ${BOLD}Verify:${NC}  ./infra/scripts/health-check.sh $EC2_IP"
echo ""
