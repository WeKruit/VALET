# Sandbox Fleet Best Practices — Research & Recommendations

> Research compiled 2026-02-14 for the Valet browser automation platform.
> Stack: AdsPower + Hatchet + Stagehand on EC2 (Ubuntu 22.04).

---

## Table of Contents

1. [Secrets Management](#1-secrets-management)
2. [SSH Key Rotation & Access](#2-ssh-key-rotation--access)
3. [Health Monitoring & Auto-Recovery](#3-health-monitoring--auto-recovery)
4. [Task Distribution & Load Balancing](#4-task-distribution--load-balancing)
5. [Security Hardening](#5-security-hardening)
6. [Cost Optimization](#6-cost-optimization)
7. [Real-World Reference Implementations](#7-real-world-reference-implementations)
8. [Recommendations for Valet](#8-recommendations-for-valet)

---

## 1. Secrets Management

### Comparison Matrix

| Feature | AWS Secrets Manager | SSM Parameter Store | HashiCorp Vault |
|---------|-------------------|-------------------|-----------------|
| **Cost** | $0.40/secret/month + $0.05/10K API calls | Free (standard), $0.05/advanced/month | Free (OSS), $1.58/hr (HCP) |
| **Automatic Rotation** | Built-in (Lambda-based) | Manual or custom Lambda | Dynamic secrets (JIT) |
| **Max Secret Size** | 64 KB | 8 KB (standard), 8 KB (advanced) | Unlimited |
| **Cross-Account** | Yes (resource policies) | Yes (shared Parameter Store) | Yes (namespaces) |
| **Multi-Cloud** | AWS only | AWS only | Cloud-agnostic |
| **Encryption** | Always encrypted (KMS) | Optional (KMS for SecureString) | Transit engine + storage backend |
| **Versioning** | Automatic | Yes | Yes |
| **Audit** | CloudTrail | CloudTrail | Audit device |
| **Dynamic Secrets** | No | No | Yes (DB creds, SSH certs, cloud IAM) |
| **Setup Complexity** | Low | Very low | High (self-hosted), Medium (HCP) |

### What We Need to Store

| Secret | Type | Rotation Frequency | Access Pattern |
|--------|------|-------------------|----------------|
| Hatchet API token | API key | On regeneration (rare) | Worker boot |
| DATABASE_URL | Connection string | On password rotation | Worker runtime |
| ANTHROPIC_API_KEY | API key | Manual | Worker runtime |
| ADSPOWER_API_TOKEN | API token | Per session/plan | Worker boot |
| WORKER_API_KEY | Service token | Quarterly | Worker boot + heartbeat |
| S3 access keys | Credential pair | 90 days (AWS best practice) | Worker runtime |

### Recommendation: SSM Parameter Store + Secrets Manager Hybrid

**Why not Vault?** We are AWS-only, have <20 secrets, and don't need dynamic secrets. Vault adds operational overhead (running, sealing/unsealing, HA) for minimal benefit at our scale.

**Approach:**
- **SSM Parameter Store (SecureString)**: For non-rotating config — `DATABASE_URL`, `HATCHET_TOKEN`, `ANTHROPIC_API_KEY`, env-specific config. Free tier, simple API, native to EC2.
- **Secrets Manager**: For credentials requiring automatic rotation — S3 access keys, worker API keys. Built-in Lambda rotation support.

```bash
# Store secrets in SSM Parameter Store (encrypted with KMS)
aws ssm put-parameter \
  --name "/valet/staging/HATCHET_TOKEN" \
  --type SecureString \
  --value "your-token-here" \
  --tags "Key=Project,Value=valet" "Key=Environment,Value=staging"

# Worker boot script fetches all secrets at once
aws ssm get-parameters-by-path \
  --path "/valet/${ENVIRONMENT}/" \
  --with-decryption \
  --query 'Parameters[*].[Name,Value]' \
  --output text | while IFS=$'\t' read -r name value; do
    key=$(basename "$name")
    echo "${key}=${value}" >> /opt/valet/.env
done
```

**Migration from current setup:**
1. Move `.env` secrets to SSM Parameter Store (one-time)
2. Update `boot.sh` to fetch from SSM instead of a monolithic parameter
3. Remove PEM files from developer machines (replace with SSM Session Manager)

---

## 2. SSH Key Rotation & Access

### Current State: PEM File Anti-Pattern

The current setup uses a single `~/.ssh/valet-worker.pem` file shared among developers. This has significant problems:
- No audit trail of who accessed which instance
- Key rotation requires manual distribution to all developers
- Lost/leaked PEM compromises the entire fleet
- No MFA enforcement

### Best Practice: Eliminate SSH Entirely

**AWS SSM Session Manager** is the industry standard replacement for SSH in 2025. It uses IAM for authentication and authorization, eliminating the need for SSH keys entirely.

| Aspect | SSH + PEM | SSM Session Manager | EC2 Instance Connect |
|--------|-----------|--------------------|--------------------|
| Key management | Manual PEM distribution | None (IAM-based) | Ephemeral keys (60s TTL) |
| Port requirements | Port 22 open | Port 443 outbound only | Port 22 open |
| Audit trail | SSH logs on instance | CloudTrail + S3 session logs | CloudTrail |
| MFA | SSH key only | IAM MFA policies | IAM MFA policies |
| Fleet-wide commands | Loop + SSH | SSM Run Command (parallel) | Not supported |
| Bastion host needed | Yes (prod) | No | No |

### Recommendation: SSM Session Manager

**Phase 1 (Immediate):**
1. Install SSM Agent on all instances (pre-installed on Ubuntu AMIs since 20.04)
2. Attach `AmazonSSMManagedInstanceCore` IAM policy to instance role
3. Allow HTTPS (443) outbound in security group
4. Close port 22 in security group

**Phase 2 (Fleet commands):**
```bash
# Connect to any instance by ID (replaces SSH)
aws ssm start-session --target i-0428f12557f075129

# Run command on ALL workers (replaces SSH loop)
aws ssm send-command \
  --targets "Key=tag:Project,Values=valet" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo systemctl restart valet-worker"]}'

# Enable session logging to S3
aws ssm update-document \
  --name "SSM-SessionManagerRunShell" \
  --content '{
    "schemaVersion":"1.0",
    "description":"Session Manager Preferences",
    "sessionType":"Standard_Stream",
    "inputs":{
      "s3BucketName":"valet-ssm-logs",
      "s3EncryptionEnabled":true,
      "cloudWatchLogGroupName":"valet-ssm-sessions"
    }
  }'
```

**If SSH is still needed (transitional):**
- Use EC2 Instance Connect for ephemeral 60-second keys
- Store PEM in AWS Secrets Manager with Lambda-based rotation (90-day cycle)
- AWS provides a reference implementation: [aws-samples/aws-secrets-manager-ssh-key-rotation](https://github.com/aws-samples/aws-secrets-manager-ssh-key-rotation)

---

## 3. Health Monitoring & Auto-Recovery

### Three Layers of Health Checking

#### Layer 1: AWS Infrastructure Health (Automatic)

EC2 performs automated status checks every minute:
- **System status check**: Detects host hardware/software/network issues
- **Instance status check**: Detects OS-level problems (kernel panic, network config)
- **Attached EBS status check**: Detects volume impairment (Nitro instances)

**Auto-recovery** is enabled by default on Nitro-based instances (all t3.*). When a system check fails, AWS automatically stops and restarts the instance on healthy hardware, preserving the instance ID, IP, and EBS volumes.

#### Layer 2: Application Health (Custom CloudWatch Metrics)

Default EC2 metrics (CPU, network) don't cover memory, disk, or application status. Install the CloudWatch Agent for OS-level metrics, and publish custom metrics for application health.

```bash
# Install CloudWatch Agent (add to Golden AMI)
sudo apt-get install -y amazon-cloudwatch-agent

# CloudWatch Agent config (/opt/aws/amazon-cloudwatch-agent/etc/config.json)
{
  "metrics": {
    "namespace": "Valet/Workers",
    "metrics_collected": {
      "mem": {
        "measurement": ["mem_used_percent"],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": ["disk_used_percent"],
        "resources": ["/"],
        "metrics_collection_interval": 300
      }
    }
  }
}
```

**Custom application metrics** (published from the worker process):

| Metric | Description | Alarm Threshold |
|--------|-------------|-----------------|
| `ActiveBrowserProfiles` | Number of open AdsPower profiles | > capacity |
| `AdsPowerApiStatus` | 1 = healthy, 0 = unresponsive | = 0 for 3 minutes |
| `HatchetConnectionStatus` | 1 = connected, 0 = disconnected | = 0 for 2 minutes |
| `TaskCompletionRate` | Tasks completed per 5 minutes | < 1 for 15 minutes (if tasks queued) |
| `MemoryUsagePercent` | Node.js process RSS | > 80% |
| `XvfbStatus` | 1 = running, 0 = crashed | = 0 for 1 minute |

```typescript
// Worker health reporter (runs every 60s)
import { CloudWatch } from '@aws-sdk/client-cloudwatch';

const cw = new CloudWatch({ region: 'us-east-1' });

async function reportHealth() {
  const instanceId = await fetch(
    'http://169.254.169.254/latest/meta-data/instance-id'
  ).then(r => r.text());

  const adsPowerHealthy = await checkAdsPowerApi();
  const hatchetConnected = await checkHatchetConnection();
  const memUsage = process.memoryUsage();

  await cw.putMetricData({
    Namespace: 'Valet/Workers',
    MetricData: [
      {
        MetricName: 'AdsPowerApiStatus',
        Value: adsPowerHealthy ? 1 : 0,
        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      },
      {
        MetricName: 'HatchetConnectionStatus',
        Value: hatchetConnected ? 1 : 0,
        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      },
      {
        MetricName: 'MemoryUsageMB',
        Value: memUsage.rss / 1024 / 1024,
        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      },
    ],
  });
}

setInterval(reportHealth, 60_000);
```

#### Layer 3: Fleet-Level Health (API Heartbeats)

Workers heartbeat to the Valet API every 30 seconds. The API marks workers as `offline` if no heartbeat is received for 90 seconds. This integrates with the `sandboxes` table (fleet registry).

```typescript
// Worker heartbeat loop
async function heartbeat() {
  const instanceId = await getInstanceId();
  const publicIp = await getPublicIp();

  await fetch(`${API_URL}/api/v1/sandboxes/heartbeat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WORKER_API_KEY}` },
    body: JSON.stringify({
      instanceId,
      publicIp,
      status: 'ready',
      activeTasks: currentTaskCount,
      adsPowerStatus: await checkAdsPowerApi() ? 'running' : 'error',
    }),
  });
}

setInterval(heartbeat, 30_000);
```

### Auto-Recovery Actions

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Host hardware failure | EC2 system status check | Auto-recovery (AWS, automatic) |
| OS crash / kernel panic | EC2 instance status check | Auto-recovery (AWS, automatic) |
| AdsPower process crash | Custom metric = 0 | CloudWatch alarm -> SNS -> Lambda: SSM restart service |
| Hatchet connection lost | Custom metric = 0 | Worker self-heals (SDK reconnect) |
| Worker process crash | systemd watchdog | systemd restart (Restart=always) |
| High memory / OOM | CloudWatch mem_used_percent > 90% | CloudWatch alarm -> terminate instance (ASG replaces) |
| Zombie instance (no heartbeat) | API detects no heartbeat for 90s | API marks offline; ASG min count ensures replacement |

### CloudWatch Alarm Configuration

```bash
# Alert on AdsPower failure
aws cloudwatch put-metric-alarm \
  --alarm-name "valet-adspower-down" \
  --namespace "Valet/Workers" \
  --metric-name "AdsPowerApiStatus" \
  --statistic Minimum \
  --period 60 \
  --evaluation-periods 3 \
  --threshold 1 \
  --comparison-operator LessThanThreshold \
  --alarm-actions "arn:aws:sns:us-east-1:ACCOUNT:valet-alerts"
```

---

## 4. Task Distribution & Load Balancing

### How Hatchet Distributes Tasks

Hatchet uses a **pull-based** model: workers poll for tasks from the Hatchet server. By default, tasks are distributed FIFO across all available workers with matching workflow registrations.

For our use case (browser automation on specific EC2 instances), Hatchet provides two relevant features:

### Worker Affinity Labels

Worker affinity assigns tasks to workers based on label state. This is useful for routing tasks to workers with specific capabilities.

**Our use case**: Route tasks to workers with available browser capacity, in specific regions, or with specific AdsPower profiles.

```typescript
// Worker registration with labels
const worker = hatchet.worker('browser-worker', {
  slots: 5, // max concurrent tasks
  labels: {
    region: 'us-east-1',
    capacity: 5,       // available browser slots
    adspower: 'ready', // AdsPower API status
    instanceType: 't3.large',
  },
});

// Dynamically update labels as state changes
worker.upsertLabels({
  capacity: currentCapacity - activeTasks,
  adspower: adsPowerHealthy ? 'ready' : 'error',
});
```

```typescript
// Task definition with desired worker labels
const applyToJob = workflow.task({
  name: 'apply-to-job',
  desiredWorkerLabels: {
    adspower: {
      value: 'ready',
      required: true,  // Won't schedule if no worker has adspower=ready
    },
    capacity: {
      value: 1,
      comparator: WorkerLabelComparator.GREATER_THAN_OR_EQUAL,
      required: true,
    },
  },
  fn: async (input, ctx) => {
    // Browser automation logic
  },
});
```

### Sticky Assignment

Sticky assignment keeps all tasks in a workflow on the same worker. This is critical for browser automation workflows where a browser profile is opened on one instance and must remain there for the workflow duration.

```typescript
// Parent workflow with sticky assignment
const jobApplication = hatchet.task({
  name: 'job-application',
  sticky: StickyStrategy.HARD, // MUST stay on same worker
  fn: async (input, ctx) => {
    // Step 1: Open browser profile
    const browser = await openAdsPowerProfile(input.profileId);

    // Step 2: Spawn child tasks (sticky = true keeps them on this worker)
    const result = await fillApplicationForm.run(
      { browser, jobUrl: input.jobUrl },
      { sticky: true }
    );

    return result;
  },
});
```

**Important**: Use `HARD` strategy for browser automation (the browser is local to the instance). `SOFT` strategy risks scheduling a child task on a different worker where the browser profile isn't open.

### Capacity-Based Routing Pattern

```
                    Hatchet Server
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         Worker A    Worker B    Worker C
         slots: 5    slots: 5    slots: 5
         active: 3   active: 1   active: 5
         capacity: 2 capacity: 4 capacity: 0
              │          │
              │     Next task goes here
              │     (highest capacity)
              ▼
         Worker A gets task
         if Worker B is busy
```

Workers dynamically update their `capacity` label as tasks start and complete. Tasks specify `capacity >= 1` as a required label, so fully-loaded workers are skipped.

### Scaling Decision Matrix

| Queue Depth | Active Workers | Action |
|-------------|---------------|--------|
| 0 | Any | No action (scale-in candidate if idle > 15 min) |
| 1-5 | < max | No action (existing workers handle it) |
| 5-20 | < max | Scale out by 1-2 instances |
| 20+ | < max | Scale out to max |
| Any | = max | Alert; queue is backing up |

---

## 5. Security Hardening

### EC2 Instance Hardening Checklist

#### Network

- [ ] Close port 22 (SSH) — use SSM Session Manager instead
- [ ] Restrict noVNC (port 6080) to VPN/internal IPs only, or proxy through API
- [ ] Restrict AdsPower API (port 50325) to localhost only
- [ ] Allow only HTTPS (443) outbound for SSM, Hatchet gRPC, API calls
- [ ] Use VPC with private subnets for worker instances (NAT Gateway for outbound)
- [ ] Apply VPC Flow Logs for network audit

#### Operating System

- [ ] Enable automatic security updates (`unattended-upgrades`)
- [ ] Disable unused services (cups, bluetooth, avahi, etc.)
- [ ] Set `PermitRootLogin no` in sshd_config (even if port 22 is closed)
- [ ] Set `PasswordAuthentication no` in sshd_config
- [ ] Configure `fail2ban` for any remaining open ports
- [ ] Enable auditd for file access logging
- [ ] Run worker process as non-root user (`valet` user)

#### AWS

- [ ] Enable EBS encryption (all volumes)
- [ ] Attach minimal IAM instance profile (SSM + CloudWatch + S3 read-only)
- [ ] Enable Amazon Inspector for vulnerability scanning
- [ ] Enable GuardDuty for threat detection
- [ ] Use IMDSv2 only (disable IMDSv1 — prevents SSRF token theft)
- [ ] Tag all resources for cost allocation and access control

#### Application

- [ ] Never hardcode secrets — fetch from SSM at boot
- [ ] Rotate WORKER_API_KEY quarterly
- [ ] Use short-lived tokens where possible
- [ ] Validate all API inputs (Zod schemas)
- [ ] Rate-limit heartbeat and registration endpoints
- [ ] Log all admin actions (sandbox create/delete/restart)

#### AdsPower-Specific

- [ ] Run AdsPower as dedicated user (not root, not same as worker)
- [ ] Restrict AdsPower API to localhost only (`127.0.0.1:50325`)
- [ ] Use unique browser fingerprints per profile (AdsPower default)
- [ ] Regularly clear browser caches and profile data
- [ ] Monitor AdsPower process for unexpected outbound connections

#### IMDSv2 Configuration

```hcl
# In launch template — require IMDSv2 (hop limit 2 for containers)
metadata_options {
  http_endpoint               = "enabled"
  http_tokens                 = "required"  # Forces IMDSv2
  http_put_response_hop_limit = 2
}
```

---

## 6. Cost Optimization

### Instance Sizing for Browser Automation

| Instance | vCPU | RAM | Concurrent Browsers | On-Demand/hr | Spot/hr (~) | Monthly OD |
|----------|------|-----|---------------------|-------------|-------------|------------|
| t3.medium | 2 | 4 GB | 2-3 | $0.042 | $0.013 | ~$30 |
| t3.large | 2 | 8 GB | 4-5 | $0.083 | $0.025 | ~$60 |
| t3.xlarge | 4 | 16 GB | 8-10 | $0.166 | $0.050 | ~$120 |
| m5.large | 2 | 8 GB | 4-5 | $0.096 | $0.030 | ~$70 |
| c5.xlarge | 4 | 8 GB | 6-8 | $0.170 | $0.050 | ~$124 |

**Browser memory profile**: Each Chrome/Chromium instance uses ~300-500 MB RAM. AdsPower adds ~200 MB overhead. Xvfb + noVNC uses ~100 MB. OS baseline is ~500 MB.

**Formula**: `max_browsers = (total_RAM - 800 MB) / 500 MB`
- t3.medium (4 GB): (4096 - 800) / 500 = ~6, but CPU-limited to 2-3
- t3.large (8 GB): (8192 - 800) / 500 = ~14, but CPU-limited to 4-5

### Spot Instance Strategy

Spot instances save 60-90% but can be interrupted with 2-minute notice.

**Suitability for browser automation:**
- **Good fit**: Tasks that are idempotent and can be retried (most web scraping, data extraction)
- **Poor fit**: Multi-step application workflows that take >30 minutes (interruption loses progress)

**Mixed fleet approach (recommended):**

```hcl
resource "aws_autoscaling_group" "valet_workers" {
  mixed_instances_policy {
    instances_distribution {
      on_demand_base_capacity                  = 1    # Always 1 on-demand
      on_demand_percentage_above_base_capacity = 30   # 30% on-demand above base
      spot_allocation_strategy                 = "price-capacity-optimized"
    }

    launch_template {
      launch_template_specification {
        launch_template_id = aws_launch_template.valet_worker.id
        version            = "$Latest"
      }

      override {
        instance_type = "t3.large"
      }
      override {
        instance_type = "m5.large"   # Fallback if t3.large spot unavailable
      }
      override {
        instance_type = "t3.xlarge"  # Fallback
      }
    }
  }
}
```

**Spot interruption handling:**
1. Worker registers a 2-minute interruption handler via EC2 metadata
2. On interruption notice: mark sandbox as `draining`, stop accepting new tasks
3. Hatchet retries in-progress tasks on other workers (requires idempotent task design)
4. ASG automatically launches replacement instance

```typescript
// Spot interruption handler (check every 5s)
async function checkSpotInterruption() {
  try {
    const response = await fetch(
      'http://169.254.169.254/latest/meta-data/spot/instance-action',
      { signal: AbortSignal.timeout(1000) }
    );
    if (response.ok) {
      const data = await response.json();
      console.log('Spot interruption notice:', data);
      // Mark as draining, stop accepting tasks
      await markSandboxDraining();
      // Gracefully close browsers
      await closeAllBrowserProfiles();
    }
  } catch {
    // 404 = no interruption, normal
  }
}

setInterval(checkSpotInterruption, 5000);
```

### Auto-Scaling Strategies

**Metric-based scaling (recommended for our workload):**

| Metric | Scale Out | Scale In |
|--------|-----------|----------|
| Hatchet queue depth | > 5 pending tasks for 3 min | 0 pending tasks for 15 min |
| Average CPU utilization | > 70% for 5 min | < 20% for 15 min |
| Active tasks / capacity ratio | > 80% for 5 min | < 20% for 15 min |

**Schedule-based scaling** (if workload is predictable):
```hcl
resource "aws_autoscaling_schedule" "business_hours" {
  scheduled_action_name  = "business-hours"
  autoscaling_group_name = aws_autoscaling_group.valet_workers.name
  min_size               = 2
  max_size               = 10
  desired_capacity       = 3
  recurrence             = "0 8 * * MON-FRI"  # 8 AM weekdays
}

resource "aws_autoscaling_schedule" "off_hours" {
  scheduled_action_name  = "off-hours"
  autoscaling_group_name = aws_autoscaling_group.valet_workers.name
  min_size               = 0
  max_size               = 10
  desired_capacity       = 1
  recurrence             = "0 20 * * *"  # 8 PM daily
}
```

### Cost Comparison (5-Instance Fleet)

| Strategy | Monthly Cost | Availability |
|----------|-------------|--------------|
| All On-Demand (t3.large) | ~$300 | 99.99% |
| 1 OD + 4 Spot (t3.large) | ~$120 | 99.5% (with ASG replacement) |
| All Spot (t3.large) | ~$90 | 98% (interruption risk) |
| Mixed (1 OD base + 30% OD above) | ~$150 | 99.8% |

**Recommendation**: Mixed fleet (1 on-demand base + spot for burst). Estimated savings: 50-60% vs all on-demand.

---

## 7. Real-World Reference Implementations

### Browserless

[Browserless](https://www.browserless.io/) provides managed headless browser infrastructure. Key architectural choices:

- **Session-based scaling**: Each browser session is sandboxed and autoscaled independently
- **WebSocket control**: Remote browser control via WebSocket (similar to our noVNC approach)
- **Concurrency limits**: Per-plan limits on concurrent sessions (1-50+)
- **Region routing**: Sessions routed to nearest region for latency
- **Stealth built-in**: Headless detection evasion baked into infrastructure
- **Health monitoring**: Real-time session monitoring dashboard

**Lessons for Valet**: Browserless validates the "per-instance browser pool" model. Their architecture is similar to ours but managed. Key takeaway: invest in session monitoring and graceful cleanup.

### Apify

[Apify](https://www.apify.com/) is a cloud-based web scraping platform with 9M+ users. Architecture:

- **Actors model**: Serverless programs (scraping/automation) that run on Apify cloud
- **Auto-scaling**: Thousands of concurrent browsers with automatic distribution
- **Proxy management**: Built-in residential/datacenter proxy rotation
- **Dataset storage**: Integrated storage for scraped data
- **Private cloud**: Enterprise deployments with dedicated infrastructure
- **SDK-first**: Crawlee SDK for building actors (similar to our Stagehand usage)

**Lessons for Valet**: Apify's "Actor" model maps well to Hatchet workflows. Their emphasis on built-in proxy rotation and dedicated enterprise infrastructure validates our approach. Key takeaway: proxy rotation will be essential at scale.

### Browserbase + Stagehand

[Browserbase](https://www.browserbase.com/) provides serverless browser infrastructure specifically designed for AI agents and Stagehand:

- **Stagehand v3**: Dropped Playwright dependency, now uses CDP directly
- **Caching**: Discovered elements and actions are cached for reuse (20-40% speed improvement)
- **Managed infrastructure**: No EC2 management, sessions spin up on demand
- **Cloudflare integration**: Browser Rendering with Stagehand support (GA 2025)

**Lessons for Valet**: We use Stagehand with AdsPower (which provides its own CDP). Browserbase's approach of caching discovered elements could be replicated in our workflow layer. Key takeaway: consider Stagehand v3 for CDP-level control without Playwright dependency.

### Common Patterns Across All Providers

1. **Session isolation**: Every browser session runs in an isolated environment
2. **Graceful shutdown**: 30-60 second drain period before termination
3. **Health checks**: Multi-layer (infrastructure + application + session)
4. **Idempotent tasks**: All automation tasks designed for retry safety
5. **Proxy rotation**: Essential for avoiding detection at scale
6. **Monitoring dashboards**: Real-time visibility into active sessions and queue depth
7. **Cost-per-session billing**: Aligns cost with actual usage (vs. fixed instance cost)

---

## 8. Recommendations for Valet

### Priority 1: Foundation (Do First)

| Item | Action | Effort |
|------|--------|--------|
| **Secrets to SSM** | Move all `.env` secrets to SSM Parameter Store | 2 hours |
| **SSM Session Manager** | Replace SSH access, close port 22 | 1 hour |
| **CloudWatch Agent** | Install in Golden AMI for memory/disk metrics | 1 hour |
| **IMDSv2** | Require in launch template (security) | 15 min |

### Priority 2: Monitoring (Do Next)

| Item | Action | Effort |
|------|--------|--------|
| **Worker health metrics** | Publish custom CloudWatch metrics from worker | 4 hours |
| **CloudWatch alarms** | AdsPower down, Hatchet disconnected, high memory | 2 hours |
| **Heartbeat system** | Worker -> API heartbeat (30s interval) | 3 hours |
| **Admin dashboard** | Show fleet status, active tasks, health in web UI | 8 hours |

### Priority 3: Scaling (Do When Needed)

| Item | Action | Effort |
|------|--------|--------|
| **Golden AMI** | Bake current instance into reusable AMI | 2 hours |
| **Launch Template + ASG** | Replace single instance with auto-scaling group | 4 hours |
| **Hatchet worker labels** | Implement capacity-based routing with affinity | 4 hours |
| **Sticky assignment** | Use HARD strategy for browser workflow sessions | 2 hours |
| **Mixed fleet** | 1 on-demand base + spot instances for burst | 2 hours |
| **Spot interruption handler** | Graceful drain on 2-minute notice | 3 hours |

### Priority 4: Hardening (Do Before Production)

| Item | Action | Effort |
|------|--------|--------|
| **VPC private subnets** | Move workers to private subnet + NAT | 4 hours |
| **noVNC proxy** | Route through API with auth instead of direct IP | 6 hours |
| **Amazon Inspector** | Enable vulnerability scanning | 1 hour |
| **Audit logging** | SSM session logs to S3 + CloudTrail | 2 hours |
| **AdsPower isolation** | Run as separate user, localhost-only API | 1 hour |

### Architecture Target State

```
                    ┌─────────────────────────────────────────────────────┐
                    │                   VPC (Private Subnet)              │
                    │                                                     │
                    │  ┌──── Auto Scaling Group ────────────────────────┐ │
                    │  │                                                │ │
                    │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐         │ │
                    │  │  │Worker 1 │ │Worker 2 │ │Worker N │         │ │
                    │  │  │(On-Dem) │ │ (Spot)  │ │ (Spot)  │         │ │
                    │  │  │AdsPower │ │AdsPower │ │AdsPower │         │ │
                    │  │  │Stagehand│ │Stagehand│ │Stagehand│         │ │
                    │  │  │noVNC    │ │noVNC    │ │noVNC    │         │ │
                    │  │  └────┬────┘ └────┬────┘ └────┬────┘         │ │
                    │  └───────┼──────────┼──────────┼────────────────┘ │
                    │          │          │          │                   │
                    │          ▼          ▼          ▼                   │
                    │   ┌─── NAT Gateway ──────────────────┐            │
                    │   │  (outbound internet access)       │            │
                    │   └──────────────┬───────────────────┘            │
                    └─────────────────┼───────────────────────────────-─┘
                                      │
                    ┌─────────────────▼───────────────────────────────-─┐
                    │            Hatchet (Fly.io)                        │
                    │  - Worker affinity labels (capacity, adspower)     │
                    │  - Sticky assignment (HARD) for browser sessions   │
                    │  - FIFO with capacity-aware routing                │
                    └─────────────────┬───────────────────────────────-─┘
                                      │
                    ┌─────────────────▼───────────────────────────────-─┐
                    │            Valet API (Fly.io)                      │
                    │  - sandboxes table (fleet registry + heartbeats)   │
                    │  - Admin API (create, restart, drain, decommission)│
                    │  - noVNC proxy (auth + routing)                    │
                    └─────────────────┬───────────────────────────────-─┘
                                      │
                    ┌─────────────────▼───────────────────────────────-─┐
                    │            Valet Web (Fly.io)                      │
                    │  - Admin dashboard (fleet overview)                │
                    │  - LiveView (proxied noVNC per task)               │
                    │  - Sandbox management UI                           │
                    └───────────────────────────────────────────────────┘

Secrets: SSM Parameter Store ──▶ Worker boot script
Monitoring: CloudWatch Agent + Custom Metrics ──▶ Alarms ──▶ SNS
Access: SSM Session Manager (no SSH, no port 22)
Scanning: Amazon Inspector + GuardDuty
```

---

## Sources

### Secrets Management
- [AWS Secrets Manager vs HashiCorp Vault (PeerSpot)](https://www.peerspot.com/products/comparisons/aws-secrets-manager_vs_hashicorp-vault)
- [AWS Secrets Manager vs Vault vs Parameter Store (HackerNoon)](https://hackernoon.com/aws-secrets-manager-vs-hashicorp-vault-vs-aws-parameter-store-bcbf60b0c0d1)
- [Secrets Management in Cloud (LinkedIn)](https://www.linkedin.com/pulse/secrets-management-cloud-hashicorp-vault-aws-manager-kingshuk-biswas-xfakc)
- [AWS Secrets Manager Alternatives 2026 (StrongDM)](https://www.strongdm.com/blog/alternatives-to-aws-secrets-manager)

### SSH & Access Management
- [SSH Key Rotation via AWS SSM Fleet Manager (TutorialsDojo)](https://tutorialsdojo.com/automatic-ssh-key-pair-rotation-via-aws-systems-manager-fleet-manager/)
- [AWS Secrets Manager SSH Key Rotation (AWS Blog)](https://aws.amazon.com/blogs/security/how-to-use-aws-secrets-manager-securely-store-rotate-ssh-key-pairs/)
- [SSH Key Best Practices 2025 (Brandon Checketts)](https://www.brandonchecketts.com/archives/ssh-ed25519-key-best-practices-for-2025)
- [SSM Session Manager (AWS Docs)](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html)
- [Goodbye SSH, Use SSM (cloudonaut)](https://cloudonaut.io/goodbye-ssh-use-aws-session-manager-instead/)
- [Bastion Hosts Obsolete 2025 (Medium)](https://medium.com/@ismailkovvuru/aws-bastion-hosts-obsolete-2025-secure-access-guide-with-ssm-session-manager-tailscale-07fd37592500)

### Health Monitoring
- [EC2 Auto-Recovery (AWS Docs)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-recover.html)
- [CloudWatch Alarms for EC2 Recovery (AWS for Engineers)](https://awsfundamentals.com/blog/amazon-cloudwatch-agent)
- [EC2 Monitoring with CloudWatch (Datadog)](https://www.datadoghq.com/blog/ec2-monitoring/)
- [CloudWatch Custom Metrics (TechTarget)](https://www.techtarget.com/searchcloudcomputing/tip/Custom-Amazon-CloudWatch-metrics-When-default-isnt-enough)

### Load Balancing & Task Distribution
- [Hatchet Worker Affinity (Hatchet Docs)](https://docs.hatchet.run/home/worker-affinity)
- [Hatchet Sticky Assignment (Hatchet Docs)](https://docs.hatchet.run/home/sticky-assignment)
- [Hatchet Workers (Hatchet Docs)](https://docs.hatchet.run/home/workers)
- [EC2 Auto Scaling Mixed Instances (AWS Docs)](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-mixed-instances-groups.html)

### Security
- [EC2 Best Practices (AWS Docs)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-best-practices.html)
- [EC2 Instance Hardening Guide (The Hidden Port)](https://thehiddenport.dev/posts/aws-ec2-hardening/)
- [Building Hardened AMI (The Hidden Port)](https://thehiddenport.dev/posts/aws-ami-hardening/)

### Cost Optimization
- [EC2 Spot Instances Guide 2026 (Sedai)](https://sedai.io/blog/optimizing-spot-instances-in-aws)
- [EC2 Cost Optimization 2026 (Hyperglance)](https://www.hyperglance.com/blog/aws-ec2-cost-optimization/)
- [Cost Optimization for EC2 Autoscaling (FinOps)](https://www.finops.org/wg/cost-optimization-for-aws-ec2-autoscaling/)
- [Mixed Spot/On-Demand Auto Scaling (intuitive.cloud)](https://intuitive.cloud/blog/highly-available-cost-optimized-auto-scaling-with-spot-and-on-demand-instances)

### Browser Automation at Scale
- [Browserless Architecture (browserless.io)](https://www.browserless.io/blog/what-is-a-headless-browser-key-features-benefits-and-uses-explained)
- [Browserless Benchmark 2025 (browserless.io)](https://www.browserless.io/blog/how-fast-is-your-hosted-browser-a-practical-benchmark-for-automation-workloads)
- [Cloud Browser Automation Guide 2025 (Browserbase)](https://www.browserbase.com/blog/cloud-browser-automation-guide-2025)
- [Stagehand v3 (Browserbase)](https://www.browserbase.com/blog/stagehand-v3)
- [Top 10 Remote Browsers for AI Agents (o-mega)](https://o-mega.ai/articles/top-10-remote-browsers-for-ai-agents-full-2025-review)
- [Apify Review 2025 (Black Bear Media)](https://blackbearmedia.io/apify-review/)
- [AdsPower Antidetect Browser (adspower.com)](https://www.adspower.com/antidetect-browser)
