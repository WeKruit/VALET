#!/bin/bash
# =============================================================================
# cost-calculator.sh -- Estimate monthly AWS costs for sandbox fleet
# =============================================================================
# Usage: ./cost-calculator.sh <num_instances> [instance_type] [spot_percentage]
#
# Arguments:
#   num_instances    Number of EC2 instances (required)
#   instance_type    EC2 instance type: t3.medium, t3.large, t3.xlarge
#                    (default: t3.large)
#   spot_percentage  Percentage of instances using spot pricing: 0-100
#                    (default: 0)
#
# Examples:
#   ./cost-calculator.sh 5                     # 5x t3.large, all on-demand
#   ./cost-calculator.sh 10 t3.large 70        # 10x t3.large, 70% spot
#   ./cost-calculator.sh 20 t3.xlarge 70       # 20x t3.xlarge, 70% spot
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo -e "${BOLD}Usage:${NC} $0 <num_instances> [instance_type] [spot_percentage]"
    echo ""
    echo "  num_instances    Number of EC2 instances (1-50)"
    echo "  instance_type    t3.medium | t3.large | t3.xlarge (default: t3.large)"
    echo "  spot_percentage  0-100, percentage using spot (default: 0)"
    echo ""
    echo "Examples:"
    echo "  $0 5                  # 5x t3.large on-demand"
    echo "  $0 10 t3.large 70    # 10x t3.large, 70% spot"
    echo "  $0 20 t3.xlarge 70   # 20x t3.xlarge, 70% spot"
    exit 1
fi

NUM_INSTANCES="$1"
INSTANCE_TYPE="${2:-t3.large}"
SPOT_PCT="${3:-0}"

# ---------------------------------------------------------------------------
# Pricing constants (us-east-1, as of Feb 2026)
# ---------------------------------------------------------------------------
# Look up instance-specific values
case "$INSTANCE_TYPE" in
    t3.medium)
        OD_RATE=0.0416
        SPOT_RATE=0.0160
        VCPU=2
        RAM_GB=4
        ;;
    t3.large)
        OD_RATE=0.0832
        SPOT_RATE=0.0340
        VCPU=2
        RAM_GB=8
        ;;
    t3.xlarge)
        OD_RATE=0.1664
        SPOT_RATE=0.0650
        VCPU=4
        RAM_GB=16
        ;;
    *)
        echo "Error: Unknown instance type '$INSTANCE_TYPE'. Use: t3.medium, t3.large, t3.xlarge"
        exit 1
        ;;
esac

# Storage & network
EBS_PER_GB=0.08          # gp3 $/GB/month
EBS_VOLUME_GB=40          # default volume size
EIP_PER_HOUR=0.005        # Elastic IP $/hour
DATA_TRANSFER_PER_GB=0.09 # outbound $/GB
SNAPSHOT_PER_GB=0.05       # EBS snapshot $/GB/month
MONTHLY_HOURS=730          # hours per month

# Estimated monthly data transfer per instance (GB)
EST_DATA_TRANSFER_GB=10

# ---------------------------------------------------------------------------
# Validate inputs
# ---------------------------------------------------------------------------
if [[ "$SPOT_PCT" -lt 0 || "$SPOT_PCT" -gt 100 ]]; then
    echo "Error: spot_percentage must be 0-100"
    exit 1
fi

# ---------------------------------------------------------------------------
# Calculate
# ---------------------------------------------------------------------------
SPOT_INSTANCES=$(echo "$NUM_INSTANCES * $SPOT_PCT / 100" | bc)
OD_INSTANCES=$((NUM_INSTANCES - SPOT_INSTANCES))

# Compute costs (using bc for floating point)
OD_MONTHLY=$(echo "$OD_INSTANCES * $OD_RATE * $MONTHLY_HOURS" | bc -l)
SPOT_MONTHLY=$(echo "$SPOT_INSTANCES * $SPOT_RATE * $MONTHLY_HOURS" | bc -l)
COMPUTE_TOTAL=$(echo "$OD_MONTHLY + $SPOT_MONTHLY" | bc -l)

EBS_TOTAL=$(echo "$NUM_INSTANCES * $EBS_VOLUME_GB * $EBS_PER_GB" | bc -l)
EIP_TOTAL=$(echo "$NUM_INSTANCES * $EIP_PER_HOUR * $MONTHLY_HOURS" | bc -l)
DATA_TOTAL=$(echo "$NUM_INSTANCES * $EST_DATA_TRANSFER_GB * $DATA_TRANSFER_PER_GB" | bc -l)
SNAPSHOT_TOTAL=$(echo "$NUM_INSTANCES * $EBS_VOLUME_GB * $SNAPSHOT_PER_GB * 0.5" | bc -l)

INFRA_TOTAL=$(echo "$EBS_TOTAL + $EIP_TOTAL + $DATA_TOTAL + $SNAPSHOT_TOTAL" | bc -l)
GRAND_TOTAL=$(echo "$COMPUTE_TOTAL + $INFRA_TOTAL" | bc -l)

# All on-demand for comparison
ALL_OD_TOTAL=$(echo "$NUM_INSTANCES * $OD_RATE * $MONTHLY_HOURS" | bc -l)
SAVINGS=$(echo "$ALL_OD_TOTAL - $COMPUTE_TOTAL" | bc -l)

# Per-instance cost
PER_INSTANCE=$(echo "$GRAND_TOTAL / $NUM_INSTANCES" | bc -l)

# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------
printf "\n"
printf "${BOLD}==========================================${NC}\n"
printf "${BLUE}  Valet Sandbox Fleet Cost Estimate${NC}\n"
printf "${BOLD}==========================================${NC}\n"
printf "\n"
printf "  ${BOLD}Configuration${NC}\n"
printf "  %-24s %s\n" "Instances:" "$NUM_INSTANCES"
printf "  %-24s %s (%s vCPU / %s GB RAM)\n" "Instance type:" "$INSTANCE_TYPE" "$VCPU" "$RAM_GB"
printf "  %-24s %s%% (%s spot + %s on-demand)\n" "Spot percentage:" "$SPOT_PCT" "$SPOT_INSTANCES" "$OD_INSTANCES"
printf "  %-24s %s GB gp3\n" "EBS volume:" "$EBS_VOLUME_GB"
printf "  %-24s us-east-1\n" "Region:"
printf "\n"
printf "  ${BOLD}Compute Costs${NC}\n"
printf "  %-24s \$%.4f/hr x %s x %s hrs = ${GREEN}\$%.2f${NC}\n" \
    "On-demand:" "$OD_RATE" "$OD_INSTANCES" "$MONTHLY_HOURS" "$OD_MONTHLY"
printf "  %-24s \$%.4f/hr x %s x %s hrs = ${GREEN}\$%.2f${NC}\n" \
    "Spot:" "$SPOT_RATE" "$SPOT_INSTANCES" "$MONTHLY_HOURS" "$SPOT_MONTHLY"
printf "  %-24s ${BOLD}${GREEN}\$%.2f/mo${NC}\n" "Compute subtotal:" "$COMPUTE_TOTAL"
printf "\n"
printf "  ${BOLD}Infrastructure Costs${NC}\n"
printf "  %-24s %s x %sGB x \$%.2f = ${GREEN}\$%.2f/mo${NC}\n" \
    "EBS storage:" "$NUM_INSTANCES" "$EBS_VOLUME_GB" "$EBS_PER_GB" "$EBS_TOTAL"
printf "  %-24s %s x \$%.3f/hr x %s hrs = ${GREEN}\$%.2f/mo${NC}\n" \
    "Elastic IPs:" "$NUM_INSTANCES" "$EIP_PER_HOUR" "$MONTHLY_HOURS" "$EIP_TOTAL"
printf "  %-24s %s x %sGB x \$%.2f = ${GREEN}\$%.2f/mo${NC}\n" \
    "Data transfer:" "$NUM_INSTANCES" "$EST_DATA_TRANSFER_GB" "$DATA_TRANSFER_PER_GB" "$DATA_TOTAL"
printf "  %-24s ${GREEN}\$%.2f/mo${NC}  ${DIM}(~50%% incremental)${NC}\n" \
    "Snapshots (est.):" "$SNAPSHOT_TOTAL"
printf "  %-24s ${BOLD}${GREEN}\$%.2f/mo${NC}\n" "Infra subtotal:" "$INFRA_TOTAL"
printf "\n"
printf "  ${BOLD}==========================================${NC}\n"
printf "  %-24s ${BOLD}${GREEN}\$%.2f/mo${NC}\n" "TOTAL:" "$GRAND_TOTAL"
printf "  %-24s ${GREEN}\$%.2f/mo${NC}\n" "Per instance:" "$PER_INSTANCE"
if (( $(echo "$SAVINGS > 0" | bc -l) )); then
    printf "  %-24s ${YELLOW}\$%.2f/mo saved${NC} vs all on-demand\n" "Spot savings:" "$SAVINGS"
fi
printf "  ${BOLD}==========================================${NC}\n"
printf "\n"
printf "  ${DIM}Prices based on us-east-1, Feb 2026. Spot prices are estimates${NC}\n"
printf "  ${DIM}and may fluctuate. Data transfer assumes ~%sGB/instance/month.${NC}\n" "$EST_DATA_TRANSFER_GB"
printf "\n"
