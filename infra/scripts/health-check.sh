#!/bin/bash
# =============================================================================
# health-check.sh — Verify EC2 worker instance health
# =============================================================================
# Usage: ./health-check.sh <ec2-ip> [ssh-key-path]
#
# Performs a comprehensive health check on a Valet browser worker EC2
# instance, verifying all services (Xvfb, VNC, noVNC, AdsPower, Valet
# worker) and system resources (disk, memory, Node.js).
#
# Exit codes:
#   0  All checks passed
#   1  One or more checks failed
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

# Validate SSH key
if [[ ! -f "$SSH_KEY" ]]; then
    echo -e "${RED}[ERR]${NC}   SSH key not found: $SSH_KEY"
    exit 1
fi

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"
SSH_CMD="ssh $SSH_OPTS $SSH_USER@$EC2_IP"

# ---------------------------------------------------------------------------
# Tracking
# ---------------------------------------------------------------------------
TOTAL=0
PASSED=0
FAILED=0
WARNINGS=0

RESULTS=()

pass() {
    local name="$1"
    local detail="${2:-}"
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
    RESULTS+=("${GREEN}PASS${NC}  $name${detail:+  — $detail}")
}

fail() {
    local name="$1"
    local detail="${2:-}"
    TOTAL=$((TOTAL + 1))
    FAILED=$((FAILED + 1))
    RESULTS+=("${RED}FAIL${NC}  $name${detail:+  — $detail}")
}

skip() {
    local name="$1"
    local detail="${2:-}"
    TOTAL=$((TOTAL + 1))
    WARNINGS=$((WARNINGS + 1))
    RESULTS+=("${YELLOW}WARN${NC}  $name${detail:+  — $detail}")
}

# ---------------------------------------------------------------------------
# Check 1: SSH connectivity
# ---------------------------------------------------------------------------
echo -e "${BLUE}[INFO]${NC}  Running health checks on ${BOLD}$EC2_IP${NC}..."
echo ""

if $SSH_CMD "echo ok" &>/dev/null; then
    pass "SSH connectivity"
else
    fail "SSH connectivity" "Cannot connect. Check IP, key ($SSH_KEY), and security group."
    # Cannot continue without SSH
    echo ""
    echo -e "${BOLD}=========================================${NC}"
    echo -e "${RED}  Health Check Aborted${NC}"
    echo -e "${BOLD}=========================================${NC}"
    echo ""
    echo -e "  ${RED}FAIL${NC}  SSH connectivity — cannot reach $EC2_IP"
    echo ""
    echo "  Troubleshooting:"
    echo "    - Verify the IP address is correct"
    echo "    - Check the SSH key path: $SSH_KEY"
    echo "    - Ensure port 22 is open in the security group"
    echo "    - Verify the instance is running (AWS Console)"
    exit 1
fi

# ---------------------------------------------------------------------------
# Check 2: Xvfb
# ---------------------------------------------------------------------------
XVFB_STATUS=$($SSH_CMD "sudo systemctl is-active xvfb 2>/dev/null" 2>/dev/null || echo "inactive")
if [[ "$XVFB_STATUS" == "active" ]]; then
    pass "Xvfb (virtual display)"
else
    fail "Xvfb (virtual display)" "Status: $XVFB_STATUS. Run: sudo systemctl start xvfb"
fi

# ---------------------------------------------------------------------------
# Check 3: x11vnc
# ---------------------------------------------------------------------------
X11VNC_STATUS=$($SSH_CMD "sudo systemctl is-active x11vnc 2>/dev/null || (pgrep x11vnc >/dev/null 2>&1 && echo active || echo inactive)" 2>/dev/null || echo "unknown")
if [[ "$X11VNC_STATUS" == "active" ]]; then
    pass "x11vnc (VNC server)"
else
    fail "x11vnc (VNC server)" "Status: $X11VNC_STATUS"
fi

# ---------------------------------------------------------------------------
# Check 4: noVNC (HTTP on port 6080)
# ---------------------------------------------------------------------------
NOVNC_HTTP=$(curl -sf --connect-timeout 5 --max-time 10 -o /dev/null -w "%{http_code}" "http://$EC2_IP:6080" 2>/dev/null || echo "000")
if [[ "$NOVNC_HTTP" == "200" || "$NOVNC_HTTP" == "301" || "$NOVNC_HTTP" == "302" ]]; then
    pass "noVNC web viewer (port 6080)" "HTTP $NOVNC_HTTP"
else
    fail "noVNC web viewer (port 6080)" "HTTP $NOVNC_HTTP — check that port 6080 is open and noVNC is running"
fi

# ---------------------------------------------------------------------------
# Check 5: AdsPower API (via SSH tunnel to localhost:50325)
# ---------------------------------------------------------------------------
ADSPOWER_STATUS=$($SSH_CMD "curl -sf --connect-timeout 5 'http://localhost:50325/status' 2>/dev/null" 2>/dev/null || echo "UNREACHABLE")
if [[ "$ADSPOWER_STATUS" != "UNREACHABLE" ]]; then
    pass "AdsPower API (port 50325)" "Responding"
else
    # Check if the service is at least running
    ADSPOWER_SVC=$($SSH_CMD "sudo systemctl is-active adspower 2>/dev/null" 2>/dev/null || echo "inactive")
    if [[ "$ADSPOWER_SVC" == "active" ]]; then
        skip "AdsPower API (port 50325)" "Service running but API not responding (may need activation)"
    else
        fail "AdsPower API (port 50325)" "Service: $ADSPOWER_SVC. Run install-adspower.sh first."
    fi
fi

# ---------------------------------------------------------------------------
# Check 6: Valet worker service
# ---------------------------------------------------------------------------
WORKER_STATUS=$($SSH_CMD "sudo systemctl is-active valet-worker 2>/dev/null" 2>/dev/null || echo "inactive")
if [[ "$WORKER_STATUS" == "active" ]]; then
    # Also check if it has been restarting (crash loop detection)
    RESTART_COUNT=$($SSH_CMD "sudo systemctl show valet-worker --property=NRestarts --value 2>/dev/null" 2>/dev/null || echo "0")
    if [[ "$RESTART_COUNT" -gt 5 ]]; then
        skip "Valet worker" "Active but $RESTART_COUNT restarts detected (possible crash loop)"
    else
        pass "Valet worker" "Running (restarts: $RESTART_COUNT)"
    fi
else
    fail "Valet worker" "Status: $WORKER_STATUS. Run deploy-worker.sh or check logs: journalctl -u valet-worker"
fi

# ---------------------------------------------------------------------------
# Check 7: Node.js version
# ---------------------------------------------------------------------------
NODE_VERSION=$($SSH_CMD "node --version 2>/dev/null" 2>/dev/null || echo "NOT FOUND")
if [[ "$NODE_VERSION" == "NOT FOUND" ]]; then
    fail "Node.js" "Not installed"
else
    # Extract major version number
    NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v\([0-9]*\).*/\1/')
    if [[ "$NODE_MAJOR" -ge 20 ]]; then
        pass "Node.js" "$NODE_VERSION"
    else
        skip "Node.js" "$NODE_VERSION (recommend v20+)"
    fi
fi

# ---------------------------------------------------------------------------
# Check 8: Disk space
# ---------------------------------------------------------------------------
DISK_INFO=$($SSH_CMD "df -h / | tail -1" 2>/dev/null || echo "")
if [[ -n "$DISK_INFO" ]]; then
    DISK_USED_PCT=$(echo "$DISK_INFO" | awk '{print $5}' | tr -d '%')
    DISK_AVAIL=$(echo "$DISK_INFO" | awk '{print $4}')

    if [[ "$DISK_USED_PCT" -lt 80 ]]; then
        pass "Disk space" "${DISK_USED_PCT}% used, ${DISK_AVAIL} available"
    elif [[ "$DISK_USED_PCT" -lt 90 ]]; then
        skip "Disk space" "${DISK_USED_PCT}% used, ${DISK_AVAIL} available (getting low)"
    else
        fail "Disk space" "${DISK_USED_PCT}% used, ${DISK_AVAIL} available (critical)"
    fi
else
    skip "Disk space" "Could not retrieve"
fi

# ---------------------------------------------------------------------------
# Check 9: Memory usage
# ---------------------------------------------------------------------------
MEM_INFO=$($SSH_CMD "free -m | grep Mem" 2>/dev/null || echo "")
if [[ -n "$MEM_INFO" ]]; then
    MEM_TOTAL=$(echo "$MEM_INFO" | awk '{print $2}')
    MEM_USED=$(echo "$MEM_INFO" | awk '{print $3}')
    MEM_AVAIL=$(echo "$MEM_INFO" | awk '{print $7}')
    MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))

    if [[ "$MEM_PCT" -lt 80 ]]; then
        pass "Memory" "${MEM_PCT}% used (${MEM_USED}MB / ${MEM_TOTAL}MB, ${MEM_AVAIL}MB available)"
    elif [[ "$MEM_PCT" -lt 90 ]]; then
        skip "Memory" "${MEM_PCT}% used (${MEM_USED}MB / ${MEM_TOTAL}MB) — getting high"
    else
        fail "Memory" "${MEM_PCT}% used (${MEM_USED}MB / ${MEM_TOTAL}MB) — critical"
    fi
else
    skip "Memory" "Could not retrieve"
fi

# ---------------------------------------------------------------------------
# Check 10: Uptime
# ---------------------------------------------------------------------------
UPTIME=$($SSH_CMD "uptime -p 2>/dev/null || uptime" 2>/dev/null || echo "unknown")
pass "System uptime" "$UPTIME"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}=========================================${NC}"
if [[ $FAILED -eq 0 && $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}  Health Check: ALL PASSED${NC}"
elif [[ $FAILED -eq 0 ]]; then
    echo -e "${YELLOW}  Health Check: PASSED with warnings${NC}"
else
    echo -e "${RED}  Health Check: FAILED${NC}"
fi
echo -e "${BOLD}=========================================${NC}"
echo ""
echo -e "  Instance:  ${BOLD}$EC2_IP${NC}"
echo ""

for result in "${RESULTS[@]}"; do
    echo -e "  $result"
done

echo ""
echo -e "  ─────────────────────────────────────"
echo -e "  Total: $TOTAL  |  ${GREEN}Passed: $PASSED${NC}  |  ${RED}Failed: $FAILED${NC}  |  ${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [[ $FAILED -eq 0 ]]; then
    echo -e "  noVNC:  ${BLUE}http://$EC2_IP:6080${NC}"
    echo ""
fi

# Exit with failure code if any checks failed
[[ $FAILED -eq 0 ]]
