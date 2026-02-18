#!/bin/bash
# =============================================================================
# install-adspower.sh — Install AdsPower on an EC2 instance
# =============================================================================
# Usage: Run on the EC2 instance via SSH or VNC terminal
#
#   ssh -i ~/.ssh/valet-worker.pem ubuntu@<ec2-ip> 'bash -s' < install-adspower.sh
#   OR
#   ./install-adspower.sh   (when already on the instance)
#
# Downloads and installs AdsPower anti-detect browser for Linux, then
# configures it as a systemd service. AdsPower runs headlessly and exposes
# its local API on port 50325 for the Valet worker to control.
#
# NOTE: AdsPower typically requires GUI activation on first launch. After
# running this script, connect via noVNC (http://<ec2-ip>:6080) to complete
# the activation flow.
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
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERR]${NC}   $*"; }
die()     { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Pre-checks
# ---------------------------------------------------------------------------
if [[ "$(uname -s)" != "Linux" ]]; then
    die "This script must be run on a Linux machine (EC2 instance)."
fi

if [[ $EUID -ne 0 ]]; then
    info "Re-running with sudo..."
    exec sudo bash "$0" "$@"
fi

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
ADSPOWER_VERSION="${ADSPOWER_VERSION:-5.14.1}"
ADSPOWER_DEB_URL="https://version.adspower.net/software/linux/AdsPower-Global-${ADSPOWER_VERSION}-x64.deb"
ADSPOWER_DEB_PATH="/tmp/adspower.deb"
ADSPOWER_INSTALL_DIR="/opt/adspower"
ADSPOWER_API_PORT="50325"

# ---------------------------------------------------------------------------
# Step 1: Download AdsPower
# ---------------------------------------------------------------------------
info "Downloading AdsPower v${ADSPOWER_VERSION}..."

DOWNLOAD_SUCCESS=false

# Attempt 1: Direct versioned URL
if curl -fSL --connect-timeout 30 --max-time 300 \
    -o "$ADSPOWER_DEB_PATH" "$ADSPOWER_DEB_URL" 2>/dev/null; then
    DOWNLOAD_SUCCESS=true
    success "Downloaded from versioned URL"
fi

# Attempt 2: API download endpoint
if [[ "$DOWNLOAD_SUCCESS" == "false" ]]; then
    warn "Versioned URL failed. Trying API endpoint..."
    if curl -fSL --connect-timeout 30 --max-time 300 \
        -o "$ADSPOWER_DEB_PATH" "https://api.adspower.net/api/v1/download/linux" 2>/dev/null; then
        DOWNLOAD_SUCCESS=true
        success "Downloaded from API endpoint"
    fi
fi

# Attempt 3: Alternative versioned URL format
if [[ "$DOWNLOAD_SUCCESS" == "false" ]]; then
    warn "API endpoint failed. Trying alternative URL..."
    ALT_URL="https://version.adspower.net/software/linux/AdsPower-Global-${ADSPOWER_VERSION}-amd64.deb"
    if curl -fSL --connect-timeout 30 --max-time 300 \
        -o "$ADSPOWER_DEB_PATH" "$ALT_URL" 2>/dev/null; then
        DOWNLOAD_SUCCESS=true
        success "Downloaded from alternative URL"
    fi
fi

if [[ "$DOWNLOAD_SUCCESS" == "false" ]]; then
    echo ""
    error "Automatic download failed."
    echo ""
    echo -e "${BOLD}Manual download instructions:${NC}"
    echo ""
    echo "  1. Visit https://www.adspower.com/download on your local machine"
    echo "  2. Download the Linux .deb package"
    echo "  3. Upload it to the EC2 instance:"
    echo "     scp -i ~/.ssh/valet-worker.pem AdsPower*.deb ubuntu@<ec2-ip>:/tmp/adspower.deb"
    echo "  4. Re-run this script"
    echo ""
    echo "  Or download directly on the instance via the noVNC browser."
    echo ""
    exit 1
fi

# Verify the download is a valid .deb
if ! dpkg-deb --info "$ADSPOWER_DEB_PATH" &>/dev/null; then
    die "Downloaded file is not a valid .deb package. Try manual download (see instructions above)."
fi

# ---------------------------------------------------------------------------
# Step 2: Install dependencies and AdsPower
# ---------------------------------------------------------------------------
info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    libappindicator3-1 \
    gconf-service \
    libgconf-2-4 \
    fonts-liberation \
    libcurl4 \
    2>/dev/null || true

info "Installing AdsPower .deb package..."
dpkg -i "$ADSPOWER_DEB_PATH" || {
    warn "dpkg reported missing dependencies, fixing..."
    apt-get install -f -y -qq
}

success "AdsPower package installed"

# Clean up .deb file
rm -f "$ADSPOWER_DEB_PATH"

# ---------------------------------------------------------------------------
# Step 3: Locate AdsPower binary
# ---------------------------------------------------------------------------
ADSPOWER_BIN=""

# Check common install locations
for candidate in \
    "/opt/adspower/AdsPower" \
    "/opt/AdsPower/AdsPower" \
    "/usr/share/adspower/AdsPower" \
    "/usr/bin/adspower" \
    "/usr/local/bin/adspower"; do
    if [[ -x "$candidate" ]]; then
        ADSPOWER_BIN="$candidate"
        ADSPOWER_INSTALL_DIR="$(dirname "$candidate")"
        break
    fi
done

# Search via dpkg if not found
if [[ -z "$ADSPOWER_BIN" ]]; then
    ADSPOWER_BIN=$(dpkg -L adspower 2>/dev/null | grep -E 'AdsPower$|adspower$' | head -1 || true)
    if [[ -n "$ADSPOWER_BIN" && -x "$ADSPOWER_BIN" ]]; then
        ADSPOWER_INSTALL_DIR="$(dirname "$ADSPOWER_BIN")"
    fi
fi

# Search via find as last resort
if [[ -z "$ADSPOWER_BIN" ]]; then
    ADSPOWER_BIN=$(find /opt /usr -name "AdsPower" -type f -executable 2>/dev/null | head -1 || true)
    if [[ -n "$ADSPOWER_BIN" ]]; then
        ADSPOWER_INSTALL_DIR="$(dirname "$ADSPOWER_BIN")"
    fi
fi

if [[ -z "$ADSPOWER_BIN" ]]; then
    warn "Could not auto-detect AdsPower binary location."
    echo "  Please find it manually and update the systemd service ExecStart."
    echo "  Common locations: /opt/adspower/, /opt/AdsPower/, /usr/share/adspower/"
    ADSPOWER_BIN="/opt/adspower/AdsPower"
    ADSPOWER_INSTALL_DIR="/opt/adspower"
fi

info "AdsPower binary: $ADSPOWER_BIN"

# ---------------------------------------------------------------------------
# Step 4: Create systemd service
# ---------------------------------------------------------------------------
info "Creating systemd service for AdsPower..."

cat > /etc/systemd/system/adspower.service << EOF
[Unit]
Description=AdsPower Anti-Detect Browser
After=xvfb.service fluxbox.service
Requires=xvfb.service

[Service]
Type=simple
User=valet
Environment=DISPLAY=:99
ExecStart=${ADSPOWER_BIN} --headless --api-port=${ADSPOWER_API_PORT}
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# If 'valet' user doesn't exist, fall back to ubuntu
if ! id valet &>/dev/null; then
    warn "'valet' user not found, using 'ubuntu' for the service."
    sed -i 's/User=valet/User=ubuntu/' /etc/systemd/system/adspower.service
fi

systemctl daemon-reload
systemctl enable adspower

success "Systemd service 'adspower' configured"

# ---------------------------------------------------------------------------
# Step 5: Attempt to start AdsPower
# ---------------------------------------------------------------------------
info "Starting AdsPower service..."
systemctl start adspower || true

sleep 3

if systemctl is-active --quiet adspower; then
    success "AdsPower is running"

    # Test API
    info "Testing AdsPower API on port $ADSPOWER_API_PORT..."
    if curl -sf "http://localhost:${ADSPOWER_API_PORT}/status" &>/dev/null; then
        success "AdsPower API is responding"
    else
        warn "AdsPower is running but API is not responding yet."
        echo "  It may need GUI activation first (see below)."
    fi
else
    warn "AdsPower service did not start. It likely needs GUI activation first."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=========================================${NC}"
echo -e "${GREEN}  AdsPower Installation Summary${NC}"
echo -e "${BOLD}=========================================${NC}"
echo ""
echo -e "  Binary:       ${BOLD}$ADSPOWER_BIN${NC}"
echo -e "  Install dir:  $ADSPOWER_INSTALL_DIR"
echo -e "  API port:     $ADSPOWER_API_PORT"
echo -e "  Service:      adspower.service"
echo -e "  Status:       $(systemctl is-active adspower 2>/dev/null || echo 'inactive')"
echo ""
echo -e "${YELLOW}IMPORTANT — First-Time Activation:${NC}"
echo ""
echo "  AdsPower requires GUI activation on first launch."
echo "  To complete activation:"
echo ""
echo "  1. Connect via noVNC in your browser:"
echo "     http://<ec2-ip>:6080"
echo ""
echo "  2. If AdsPower is not visible, stop the headless service and"
echo "     launch it with a GUI:"
echo "       sudo systemctl stop adspower"
echo "       DISPLAY=:99 ${ADSPOWER_BIN}"
echo ""
echo "  3. Log in / activate your AdsPower license in the GUI."
echo ""
echo "  4. Close the GUI and restart the headless service:"
echo "       sudo systemctl start adspower"
echo ""
echo -e "  ${BOLD}Logs:${NC}  sudo journalctl -u adspower -f"
echo ""
