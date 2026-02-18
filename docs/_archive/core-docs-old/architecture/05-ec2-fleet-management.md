# EC2 Fleet Management — Browser Worker Infrastructure

## Current State (Dev — 1 Instance)

```
You (local) → Hatchet (Fly.io) ← Worker (EC2) → AdsPower (local) → Browser
                                        ↑
                                  noVNC (port 6080)
```

- 1x t3.medium, manually provisioned via Terraform
- SSH key (`~/.ssh/valet-worker.pem`) for access
- AdsPower activated manually via noVNC GUI
- Worker deployed via `deploy-worker.sh` script

## Production Architecture (N Instances)

### Problem: Manual Setup Doesn't Scale

| Task                 | Manual (1 instance)  | At Scale (N instances)         |
| -------------------- | -------------------- | ------------------------------ |
| Provisioning         | `terraform apply`    | Auto Scaling Group             |
| SSH keys             | 1 PEM file           | AWS SSM (no SSH)               |
| AdsPower install     | Script + GUI login   | Golden AMI (pre-baked)         |
| Deploy code          | SCP + restart        | SSM Run Command or CodeDeploy  |
| Monitoring           | `ssh` + `journalctl` | CloudWatch + worker heartbeats |
| Routing users to VNC | Hardcoded IP         | DB lookup per task             |

### Solution: Golden AMI + ASG + SSM

```
                    ┌─────────────────────────────────────┐
                    │         AWS Auto Scaling Group       │
                    │  ┌─────────┐ ┌─────────┐ ┌────────┐ │
                    │  │ Worker 1│ │ Worker 2│ │Worker N│ │
                    │  │ AdsPower│ │ AdsPower│ │AdsPower│ │
                    │  │ noVNC   │ │ noVNC   │ │ noVNC  │ │
                    │  └────┬────┘ └────┬────┘ └───┬────┘ │
                    └───────┼──────────┼──────────┼───────┘
                            │          │          │
                    ┌───────▼──────────▼──────────▼───────┐
                    │     Hatchet (task distribution)      │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │     Valet API (Fly.io)               │
                    │  - workers table (fleet registry)    │
                    │  - routes task → worker IP for VNC   │
                    └───────────────┬──────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────┐
                    │     Valet Web (Fly.io)               │
                    │  - LiveView iframe per task          │
                    └─────────────────────────────────────┘
```

---

## Step-by-Step: How to Scale

### 1. Create a Golden AMI

Instead of running cloud-init + install scripts on every new instance, bake everything into an AMI once:

```bash
# Start from the current working instance
# 1. SSH in and verify everything works
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80

# 2. Clean up instance-specific data
sudo systemctl stop valet-worker adspower
sudo rm -f /opt/valet/.env           # Secrets injected at boot
sudo rm -rf /opt/valet/app           # Code deployed via CI/CD
sudo rm -rf /opt/valet/.config       # AdsPower profile data

# 3. Create AMI from AWS Console or CLI
aws ec2 create-image \
  --instance-id i-0428f12557f075129 \
  --name "valet-worker-v1-$(date +%Y%m%d)" \
  --description "Valet worker: Ubuntu 22.04 + Xvfb + noVNC + AdsPower 7.12.29 + Node 22 + pnpm 10" \
  --no-reboot
```

The AMI includes: Xvfb, x11vnc, noVNC, Fluxbox, AdsPower, Node.js 22, pnpm 10, Chrome deps, all systemd services.

### 2. AdsPower Activation Strategy

**Problem**: AdsPower requires GUI login on first launch per machine.

**Solutions** (pick one):

| Strategy                | How                                                                                | Pros               | Cons                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | ------------------ | ------------------------------------- |
| **Pre-activate in AMI** | Log in via VNC before creating AMI. Session stored in `~/.config/adspower_global/` | Zero-touch boot    | AMI rebuild needed if session expires |
| **API token auth**      | Use AdsPower Team/Enterprise plan API tokens                                       | No GUI needed      | Paid plan required                    |
| **Boot script + VNC**   | Instance boots, sends Slack alert "activate AdsPower at http://IP:6080"            | Works on free plan | Manual step per new instance          |

**Recommendation**: Pre-activate in AMI for dev/staging. Use API tokens for production (requires AdsPower Team plan).

### 3. Replace SSH with AWS SSM

No PEM files. No security group port 22. No key rotation.

```bash
# Install SSM agent (already on Ubuntu AMIs)
# Just add IAM instance profile with AmazonSSMManagedInstanceCore policy

# Connect to any instance
aws ssm start-session --target i-0428f12557f075129

# Run commands on ALL instances
aws ssm send-command \
  --targets "Key=tag:Project,Values=valet" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":["sudo systemctl restart valet-worker"]}'

# Deploy code to ALL instances
aws ssm send-command \
  --targets "Key=tag:Project,Values=valet" \
  --document-name "AWS-RunShellScript" \
  --parameters '{"commands":[
    "cd /opt/valet/app && sudo -u valet aws s3 cp s3://valet-deploys/worker-latest.tar.gz /tmp/",
    "sudo tar -xzf /tmp/worker-latest.tar.gz -C /opt/valet/app",
    "sudo -u valet pnpm install --prod --frozen-lockfile",
    "sudo systemctl restart valet-worker"
  ]}'
```

### 4. Auto Scaling Group (ASG)

Replace individual `aws_instance` resources with a Launch Template + ASG:

```hcl
# infra/terraform/main.tf (production version)

resource "aws_launch_template" "valet_worker" {
  name_prefix   = "valet-worker-"
  image_id      = var.ami_id  # Golden AMI
  instance_type = var.instance_type
  key_name      = var.key_name

  iam_instance_profile {
    name = aws_iam_instance_profile.valet_worker.name
  }

  vpc_security_group_ids = [aws_security_group.valet_worker.id]

  # Boot script: pull secrets from SSM Parameter Store, start services
  user_data = base64encode(templatefile("${path.module}/boot.sh", {
    environment = var.environment
    region      = var.aws_region
  }))

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size = var.volume_size
      volume_type = "gp3"
      encrypted   = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Project     = "valet"
      Environment = var.environment
    }
  }
}

resource "aws_autoscaling_group" "valet_workers" {
  name                = "valet-workers-${var.environment}"
  desired_capacity    = var.desired_count
  min_size            = var.min_count
  max_size            = var.max_count
  vpc_zone_identifier = data.aws_subnets.default.ids

  launch_template {
    id      = aws_launch_template.valet_worker.id
    version = "$Latest"
  }

  # Health check: HTTP on port 8080
  health_check_type         = "EC2"
  health_check_grace_period = 300

  tag {
    key                 = "Project"
    value               = "valet"
    propagate_at_launch = true
  }
}
```

### 5. Fleet Registry (workers table)

Each worker registers itself on boot, heartbeats every 30s:

```sql
-- packages/db/src/schema/workers.ts
CREATE TABLE workers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id   TEXT NOT NULL UNIQUE,  -- AWS instance ID
  public_ip     TEXT NOT NULL,
  private_ip    TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'booting',  -- booting, ready, busy, draining, offline
  capacity      INTEGER NOT NULL DEFAULT 5,       -- max concurrent browser profiles
  active_tasks  INTEGER NOT NULL DEFAULT 0,
  novnc_url     TEXT,                              -- http://{ip}:6080/vnc.html
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  environment   TEXT NOT NULL DEFAULT 'staging'
);

CREATE INDEX idx_workers_status ON workers(status);
```

**Boot script** (runs on every instance start):

```bash
#!/bin/bash
# /opt/valet/boot.sh — called by cloud-init / Launch Template user_data

# 1. Get instance metadata
INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id)
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
PRIVATE_IP=$(curl -s http://169.254.169.254/latest/meta-data/local-ipv4)

# 2. Pull secrets from SSM Parameter Store
aws ssm get-parameter --name "/valet/${ENVIRONMENT}/worker-env" --with-decryption \
  --query 'Parameter.Value' --output text > /opt/valet/.env

# 3. Register with Valet API
curl -X POST https://valet-api.fly.dev/api/v1/workers/register \
  -H "Authorization: Bearer ${WORKER_API_KEY}" \
  -d "{\"instanceId\":\"$INSTANCE_ID\",\"publicIp\":\"$PUBLIC_IP\",\"privateIp\":\"$PRIVATE_IP\"}"

# 4. Start services
systemctl start adspower valet-worker
```

### 6. Task → Worker → VNC Routing

When a task runs, Hatchet assigns it to a specific worker. The worker writes its instance info to the task record:

```typescript
// In the workflow task handler
const instanceId = await fetch("http://169.254.169.254/latest/meta-data/instance-id").then((r) =>
  r.text(),
);
const publicIp = await fetch("http://169.254.169.254/latest/meta-data/public-ipv4").then((r) =>
  r.text(),
);

// Store on the task so frontend can build the noVNC URL
await db
  .update(tasks)
  .set({
    workerIp: publicIp,
    workerInstanceId: instanceId,
  })
  .where(eq(tasks.id, taskId));
```

Frontend reads `task.workerIp` and renders:

```tsx
<LiveView url={`http://${task.workerIp}:6080`} />
```

### 7. CI/CD at Scale

Instead of SCP to individual IPs, upload to S3 and trigger SSM:

```yaml
# .github/workflows/cd-ec2.yml (production version)
- name: Upload to S3
  run: aws s3 cp /tmp/valet-worker.tar.gz s3://valet-deploys/worker-${{ github.sha }}.tar.gz

- name: Deploy to all workers
  run: |
    aws ssm send-command \
      --targets "Key=tag:Project,Values=valet" "Key=tag:Environment,Values=${{ env.ENVIRONMENT }}" \
      --document-name "AWS-RunShellScript" \
      --parameters commands='[
        "aws s3 cp s3://valet-deploys/worker-${{ github.sha }}.tar.gz /tmp/worker.tar.gz",
        "sudo tar -xzf /tmp/worker.tar.gz -C /opt/valet/app",
        "cd /opt/valet/app && sudo -u valet pnpm install --prod",
        "sudo systemctl restart valet-worker"
      ]' \
      --timeout-seconds 300
```

---

## CI/CD Pipeline (Multi-Sandbox)

### Overview

The deployment pipeline supports deploying the worker to multiple EC2 sandboxes in parallel. It is implemented as two GitHub Actions workflows:

1. **`cd-ec2.yml`** — Build and deploy worker code to all sandboxes
2. **`secrets-sync.yml`** — Sync environment variables to all sandboxes

### cd-ec2.yml — Code Deployment

Triggers:

- **Automatic**: Push to `staging` or `main` branches (when worker/package files change)
- **Manual**: `workflow_dispatch` with optional target IPs and environment selection

Flow:

```
Build (1 job)              Deploy (N parallel jobs)        Summary
┌──────────────┐    ┌─────────────────────────────┐    ┌──────────┐
│ Checkout     │    │ For each IP in matrix:      │    │ Fleet    │
│ Install deps │───>│  1. Download artifact       │───>│ deploy   │
│ Build worker │    │  2. Upload tarball via SCP   │    │ summary  │
│ Create tar   │    │  3. Backup current version   │    └──────────┘
│ Upload       │    │  4. Extract + install deps   │
│ artifact     │    │  5. Restart service          │
└──────────────┘    │  6. Health check (3 retries) │
                    │  7. Rollback on failure      │
                    └─────────────────────────────┘
```

Key features:

- **Matrix strategy**: Deploys to all IPs from `SANDBOX_IPS` secret in parallel
- **Build once, deploy many**: Single build job uploads artifact; deploy jobs download it
- **Backup + rollback**: Previous deployment is backed up; restored automatically if health check fails
- **Health checks**: 3 attempts with exponential backoff (10s, 20s, 40s)
- **Backward compatible**: Falls back to `EC2_IP_STG`/`EC2_IP_PROD` if `SANDBOX_IPS` not set
- **Per-instance concurrency**: Prevents parallel deploys to the same instance

### secrets-sync.yml — Environment Variable Sync

Triggers:

- **Manual only**: `workflow_dispatch` with environment selection and optional target IPs

Flow:

1. Reads `SANDBOX_WORKER_ENV` secret (the full .env file contents)
2. Writes it to `/opt/valet/.env` on each sandbox via SSH
3. Restarts the `valet-worker` service
4. Verifies the service started successfully

### GitHub Secrets Structure

Set these in **GitHub Settings > Environments > staging / production**:

| Secret               | Type       | Description                                                |
| -------------------- | ---------- | ---------------------------------------------------------- |
| `SANDBOX_IPS`        | JSON array | IPs to deploy to, e.g. `["34.197.248.80", "35.123.45.67"]` |
| `SANDBOX_SSH_KEY`    | PEM string | SSH private key shared across all sandboxes                |
| `SANDBOX_WORKER_ENV` | Text       | Full .env file contents for the worker service             |

Legacy secrets (backward compatible):

| Secret             | Description                                             |
| ------------------ | ------------------------------------------------------- |
| `EC2_IP_STG`       | Single staging IP (fallback if `SANDBOX_IPS` not set)   |
| `EC2_IP_PROD`      | Single production IP (fallback)                         |
| `EC2_SSH_KEY_STG`  | Staging SSH key (fallback if `SANDBOX_SSH_KEY` not set) |
| `EC2_SSH_KEY_PROD` | Production SSH key (fallback)                           |

### Adding a New Sandbox to the Pipeline

1. **Provision** the EC2 instance (Terraform or manually)
2. **Bootstrap** with deploy script: `./infra/scripts/deploy-worker.sh <new-ip>`
3. **Configure secrets**: `./infra/scripts/set-secrets.sh <new-ip>`
4. **Add IP** to `SANDBOX_IPS` secret in the GitHub environment:
   - Go to GitHub repo > Settings > Environments > (staging or production)
   - Edit `SANDBOX_IPS` and add the new IP to the JSON array
5. **Verify**: Next push to staging/main auto-deploys to all sandboxes including the new one

### deploy-worker.sh Enhancements

The deploy script now supports:

- `--skip-build` — Skip local build step (reuse existing `dist/` artifacts)
- `--rollback-on-failure` — Automatically rollback if health check fails (no interactive prompt)
- **Backup**: Creates `/opt/valet/app-backup` before deploying
- **Health checks**: 3 attempts with exponential backoff (5s, 10s, 20s)
- **Rollback**: Restores from backup and restarts service if health check fails

---

## Migration Path

| Phase                 | Instances | Management           | Deploy                | AdsPower                   |
| --------------------- | --------- | -------------------- | --------------------- | -------------------------- |
| **Now (Dev)**         | 1         | Terraform + SSH      | deploy-worker.sh      | Manual GUI login           |
| **Phase 1 (Staging)** | 1-3       | Terraform + SSM      | cd-ec2.yml (SSH)      | Pre-activated AMI          |
| **Phase 2 (Prod)**    | 3-10      | ASG + SSM            | S3 + SSM send-command | API token auth             |
| **Phase 3 (Scale)**   | 10-50+    | ASG + fleet registry | S3 + rolling deploy   | API token + auto-provision |

---

## Cost Estimates

| Instance  | vCPU | RAM   | On-Demand/hr | Spot/hr | Monthly (on-demand) |
| --------- | ---- | ----- | ------------ | ------- | ------------------- |
| t3.medium | 2    | 4 GB  | $0.042       | ~$0.013 | ~$30                |
| t3.large  | 2    | 8 GB  | $0.083       | ~$0.025 | ~$60                |
| t3.xlarge | 4    | 16 GB | $0.166       | ~$0.050 | ~$120               |

**Recommendation**: t3.medium for dev, t3.large for prod (8 GB helps with multiple browser profiles). Use Spot instances for non-critical workers (70% cheaper).

---

## Testing the Current Setup

### Quick Test (SSH into EC2)

```bash
# 1. SSH into the worker
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80

# 2. Check services
sudo systemctl status valet-worker adspower

# 3. Test AdsPower API directly
curl http://localhost:50325/status

# 4. Run the E2E test script (needs Anthropic key for Stagehand)
cd /opt/valet/app
export ANTHROPIC_API_KEY=sk-ant-...
export ADSPOWER_API_URL=http://127.0.0.1:50325
npx tsx apps/worker/src/scripts/test-adspower.ts
```

### Test via SSH Tunnel (run test locally, connect to remote AdsPower)

```bash
# Terminal 1: SSH tunnel
ssh -i ~/.ssh/valet-worker.pem -L 50325:127.0.0.1:50325 ubuntu@34.197.248.80

# Terminal 2: Run test locally
ADSPOWER_API_URL=http://127.0.0.1:50325 pnpm --filter @valet/worker exec tsx src/scripts/test-adspower.ts
```

### Watch it live

Open http://34.197.248.80:6080/vnc.html in your browser while the test runs.
