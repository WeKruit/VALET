# AWS Cost Estimation and Optimization Guide

This document provides cost analysis for the Valet EC2 sandbox fleet, covering compute, storage, networking, licensing, and optimization strategies.

> **Pricing source**: AWS us-east-1 (N. Virginia), February 2026.
> Spot prices are estimates based on recent market data and fluctuate with demand.

---

## 1. EC2 Compute Costs

### On-Demand vs Spot Pricing

| Instance Type | vCPU | RAM | On-Demand $/hr | On-Demand $/mo | Spot $/hr (est.) | Spot $/mo (est.) | Spot Savings | Use Case |
|---------------|------|-----|----------------|----------------|------------------|------------------|--------------|----------|
| t3.medium | 2 | 4 GB | $0.0416 | $30.37 | $0.0160 | $11.68 | ~62% | Dev/test |
| t3.large | 2 | 8 GB | $0.0832 | $60.74 | $0.0340 | $24.82 | ~59% | Production (recommended) |
| t3.xlarge | 4 | 16 GB | $0.1664 | $121.47 | $0.0650 | $47.45 | ~61% | High-concurrency |

**Notes:**
- Monthly cost assumes 730 hours/month (24/7 operation).
- t3 instances use burstable CPU credits. Sustained high CPU usage may exceed baseline and consume credits.
- t3.large is the recommended production instance: 8 GB RAM comfortably runs AdsPower + Chromium + Node.js worker.
- t3.medium works for development/testing but may run tight with AdsPower Electron + browser profiles.

### Graviton (ARM) Alternative

| Instance Type | vCPU | RAM | On-Demand $/hr | On-Demand $/mo | Savings vs x86 |
|---------------|------|-----|----------------|----------------|----------------|
| t4g.medium | 2 | 4 GB | $0.0336 | $24.53 | 19% |
| t4g.large | 2 | 8 GB | $0.0672 | $49.06 | 19% |
| t4g.xlarge | 4 | 16 GB | $0.1344 | $98.11 | 19% |

**Caveat:** AdsPower does not currently support ARM/Graviton. Graviton is only viable with Chromium-only sandboxes.

---

## 2. Storage and Network Costs

### EBS Storage (gp3)

| Item | Size | Rate | Monthly Cost |
|------|------|------|--------------|
| Root volume (per instance) | 40 GB | $0.08/GB/mo | $3.20 |
| Root volume (per instance) | 80 GB | $0.08/GB/mo | $6.40 |
| Included IOPS | 3,000 | Free | $0.00 |
| Included throughput | 125 MB/s | Free | $0.00 |

40 GB is sufficient for dev/test. Production instances with many AdsPower browser profiles may need 80 GB.

### Elastic IP

| Scenario | Rate | Monthly Cost |
|----------|------|--------------|
| EIP attached to running instance | $0.005/hr | $3.65/mo |
| EIP not attached (idle) | $0.005/hr | $3.65/mo |

Since February 2024, AWS charges for **all** public IPv4 addresses regardless of attachment. Each sandbox requires one EIP for stable addressing.

### Data Transfer

| Direction | Rate | Notes |
|-----------|------|-------|
| Data in | Free | No charge for inbound |
| Data out (first 100 GB/mo) | Free | Aggregated across all services |
| Data out (next 10 TB/mo) | $0.09/GB | Typical sandbox usage |
| Inter-AZ transfer | $0.01/GB | Minimal for this architecture |

**Estimated monthly transfer per sandbox:** ~10 GB outbound (browser sessions, API calls, file uploads). This yields ~$0.90/instance/month after the free tier.

### EBS Snapshots

| Item | Rate | Notes |
|------|------|-------|
| Standard snapshot | $0.05/GB/mo | Incremental, ~50% of volume size |
| Archive tier | $0.0125/GB/mo | For long-term retention |

Estimated per-instance snapshot cost: $1.00/mo (40 GB volume, ~50% incremental).

---

## 3. AdsPower Licensing

### Pricing Plans (as of Feb 2026)

| Plan | Profiles | Monthly (monthly billing) | Monthly (annual billing) | Per Profile |
|------|----------|---------------------------|--------------------------|-------------|
| Free | 5 | $0 | $0 | $0 |
| Professional | 10 (+5 bonus) | $9 | $5.40 | $0.60 |
| Business | 100 (+5 bonus) | $36 | $21.60 | $0.34 |
| Custom | 500+ | Custom | Custom | ~$0.20 |

### Chromium vs AdsPower Cost Comparison

| Factor | Chromium | AdsPower |
|--------|----------|----------|
| License cost | Free | $9-$36+/mo |
| Browser profiles | N/A (stateless) | Persistent, fingerprint-isolated |
| Anti-detection | None | Built-in |
| Setup complexity | Low (apt install) | Medium (requires GUI activation) |
| ARM/Graviton support | Yes | No (x86 only) |
| RAM usage | ~200 MB/tab | ~400 MB/tab (Electron overhead) |

**Recommendation:** Use Chromium for tasks that don't require anti-detection (internal tools, public forms). Use AdsPower for tasks where browser fingerprinting matters (job application sites, social platforms).

---

## 4. Fleet Cost Scenarios

All scenarios assume 40 GB gp3 EBS, 10 GB/mo data transfer, EIP per instance, and monthly snapshot.

### Scenario A: 5 Sandboxes (100% On-Demand)

| Component | t3.medium | t3.large | t3.xlarge |
|-----------|-----------|----------|-----------|
| Compute (5x on-demand) | $151.84 | $303.68 | $607.37 |
| EBS storage (5x 40GB) | $16.00 | $16.00 | $16.00 |
| Elastic IPs (5x) | $18.25 | $18.25 | $18.25 |
| Data transfer (5x 10GB) | $4.50 | $4.50 | $4.50 |
| Snapshots (est.) | $5.00 | $5.00 | $5.00 |
| AdsPower (Business plan) | $36.00 | $36.00 | $36.00 |
| **Total** | **$231.59** | **$383.43** | **$687.12** |
| **Per instance** | **$46.32** | **$76.69** | **$137.42** |

### Scenario B: 10 Sandboxes (70% Spot, 30% On-Demand)

| Component | t3.medium | t3.large | t3.xlarge |
|-----------|-----------|----------|-----------|
| Compute (3x OD + 7x spot) | $172.91 | $353.30 | $674.54 |
| EBS storage (10x 40GB) | $32.00 | $32.00 | $32.00 |
| Elastic IPs (10x) | $36.50 | $36.50 | $36.50 |
| Data transfer (10x 10GB) | $9.00 | $9.00 | $9.00 |
| Snapshots (est.) | $10.00 | $10.00 | $10.00 |
| AdsPower (Custom, ~$30) | $30.00 | $30.00 | $30.00 |
| **Total** | **$290.41** | **$470.80** | **$792.04** |
| **Per instance** | **$29.04** | **$47.08** | **$79.20** |

### Scenario C: 20 Sandboxes (70% Spot, 30% On-Demand)

| Component | t3.medium | t3.large | t3.xlarge |
|-----------|-----------|----------|-----------|
| Compute (6x OD + 14x spot) | $345.82 | $706.59 | $1,349.08 |
| EBS storage (20x 40GB) | $64.00 | $64.00 | $64.00 |
| Elastic IPs (20x) | $73.00 | $73.00 | $73.00 |
| Data transfer (20x 10GB) | $18.00 | $18.00 | $18.00 |
| Snapshots (est.) | $20.00 | $20.00 | $20.00 |
| AdsPower (Custom, ~$50) | $50.00 | $50.00 | $50.00 |
| **Total** | **$570.82** | **$931.59** | **$1,574.08** |
| **Per instance** | **$28.54** | **$46.58** | **$78.70** |

### Summary Table

| Fleet Size | Mix | t3.large $/mo | Per Instance |
|------------|-----|---------------|--------------|
| 5 | 100% OD | $383 | $77 |
| 10 | 70/30 spot/OD | $471 | $47 |
| 20 | 70/30 spot/OD | $932 | $47 |

---

## 5. Optimization Strategies

### 5.1 Spot Instances (50-62% compute savings)

Spot instances offer 50-62% savings for t3 family in us-east-1.

**Implementation:**
- Use spot for sandboxes running non-critical or retry-able workloads
- Keep 30% on-demand as a reliability baseline
- Handle spot interruptions: configure the worker to gracefully drain tasks on SIGTERM
- Use multiple AZs to reduce interruption frequency

**Risk:** Spot instances can be reclaimed with 2-minute warning. The worker must checkpoint task state.

### 5.2 Auto-Scaling: Nights and Weekends (30-40% savings)

Most job application tasks happen during business hours. Scaling down during off-hours reduces costs significantly.

**Schedule:**
- Business hours: Mon-Fri 6am-10pm (16 hrs/day)
- Off-hours: scale to 30% capacity

**Savings calculation:**
- Active hours/week: 80 (16 x 5)
- Off hours/week: 88 (8 x 5 + 48 weekend)
- If off-hours run 30% fleet: ~35% overall savings

**Implementation:**
- AWS Auto Scaling Group with scheduled policies
- Or: Lambda function triggered by EventBridge cron to start/stop instances
- Worker should drain gracefully on shutdown

### 5.3 Reserved Instances (30-60% savings)

For stable baseline capacity:

| Commitment | Payment | Savings vs On-Demand |
|------------|---------|---------------------|
| 1-year, no upfront | Monthly | ~30% |
| 1-year, all upfront | One-time | ~37% |
| 3-year, no upfront | Monthly | ~45% |
| 3-year, all upfront | One-time | ~60% |

**Recommendation:** Start with on-demand + spot. After 3 months of stable usage, purchase 1-year reserved instances for the on-demand baseline (typically 2-3 instances).

### 5.4 Chromium vs AdsPower

| Metric | Chromium Fleet | AdsPower Fleet | Savings |
|--------|---------------|----------------|---------|
| License | $0 | $36-50/mo | 100% |
| Graviton eligible | Yes (19% compute savings) | No | 19% |
| RAM per session | ~200 MB | ~400 MB | 50% |
| Sessions per t3.large | ~10 | ~5 | 2x density |

Using Chromium where anti-detection is not required can save $36-50/mo in licensing plus enable Graviton instances for an additional 19% compute savings.

### 5.5 Graviton Instances (19% additional savings)

AWS Graviton (ARM) processors offer ~19% better price-performance for compute workloads.

**Requirements:**
- Chromium-only sandboxes (AdsPower requires x86)
- ARM-compatible Node.js (v20+ supports ARM natively)

**Implementation:** Change `instance_type` from `t3.*` to `t4g.*` in Terraform and use Chromium browser engine.

### 5.6 Right-Sizing Recommendations

| Workload | Recommended Instance | Rationale |
|----------|---------------------|-----------|
| Dev/test (1-2 sessions) | t3.medium | 4 GB sufficient for light use |
| Production (3-5 sessions) | t3.large | 8 GB handles AdsPower + browser profiles |
| High-load (6-10 sessions) | t3.xlarge | 16 GB for concurrent heavy sessions |
| Chromium-only production | t4g.large | ARM savings, lower RAM needs |

---

## 6. Cost Calculator

A CLI tool is provided for quick estimates:

```bash
# 5 instances, t3.large, all on-demand
./infra/scripts/cost-calculator.sh 5 t3.large 0

# 10 instances, t3.large, 70% spot
./infra/scripts/cost-calculator.sh 10 t3.large 70

# 20 instances, t3.xlarge, 70% spot
./infra/scripts/cost-calculator.sh 20 t3.xlarge 70
```

The calculator outputs a detailed breakdown of compute, storage, network, and total costs.

---

## 7. Cost Monitoring

### AWS Cost Explorer

1. Go to **AWS Console > Cost Explorer**
2. Filter by tag: `Project = valet`
3. Group by: `Instance Type` or `Environment`
4. Set monthly budget alerts

### CloudWatch Billing Alarms

Create alarms for cost thresholds:

```bash
# Create a billing alarm for $500/month
aws cloudwatch put-metric-alarm \
  --alarm-name "valet-monthly-spend-500" \
  --alarm-description "Valet sandbox fleet exceeds $500/month" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 21600 \
  --threshold 500 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --dimensions Name=Currency,Value=USD \
  --evaluation-periods 1 \
  --alarm-actions "<sns-topic-arn>"
```

### Instance Tagging for Cost Allocation

All sandbox instances are tagged with:

| Tag | Purpose |
|-----|---------|
| `Project=valet` | Cost allocation |
| `Environment=staging/production` | Per-environment tracking |
| `Name=valet-worker-N` | Instance identification |

Enable cost allocation tags in AWS Billing to see per-tag breakdowns.

### Recommended Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| Monthly spend | $500 | Email notification |
| Monthly spend | $1,000 | Email + Slack |
| Idle instances | Running > 2hr with no tasks | Auto-stop or notify |
| EIP unattached | > 1 hour | Release or notify |

---

## 8. Break-Even Analysis

### Cost Per Task Execution

Assuming t3.large at $60.74/mo on-demand with 5 concurrent sessions:

| Utilization | Tasks/day | Tasks/month | Cost/task |
|-------------|-----------|-------------|-----------|
| Low (2 hrs/day) | 12 | 360 | $0.17 |
| Medium (8 hrs/day) | 48 | 1,440 | $0.04 |
| High (16 hrs/day) | 96 | 2,880 | $0.02 |
| Full (24/7) | 144 | 4,320 | $0.01 |

**Assumptions:** Average task duration of 10 minutes, 5 concurrent sessions per instance.

### Fleet Justification

| Fleet Size | Monthly Cost (t3.large, 70% spot) | Tasks/month | Cost/task | Justification |
|------------|-----------------------------------|-------------|-----------|---------------|
| 1 | $77 | 4,320 | $0.02 | MVP, single-user |
| 5 | $383 | 21,600 | $0.02 | Small team, moderate volume |
| 10 | $471 | 43,200 | $0.01 | Growing team, high volume |
| 20 | $932 | 86,400 | $0.01 | Enterprise scale |

### Serverless Comparison

| Approach | Monthly Cost (1,000 tasks) | Pros | Cons |
|----------|---------------------------|------|------|
| EC2 fleet (5x t3.large) | ~$383 | Persistent state, fast startup, AdsPower | Fixed cost even when idle |
| AWS Lambda + headless Chrome | ~$50-100 | Pay per use, auto-scale | 15-min timeout, cold starts, no AdsPower |
| AWS Fargate + browser | ~$150-300 | Per-task billing, container isolation | Slower startup, complex networking |
| Browserless.io (managed) | ~$200-500 | Managed infrastructure | No AdsPower, vendor lock-in |

**Recommendation:** EC2 fleet is optimal when:
- Tasks exceed 1,000/month (economy of scale)
- AdsPower anti-detection is required
- Task duration exceeds 5 minutes (Lambda timeout risk)
- Persistent browser profiles are needed

For low-volume or burst workloads (< 500 tasks/month), serverless options may be more cost-effective.
