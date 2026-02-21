# CI/CD Workflows for EC2 Sandbox Fleet

This document describes the GitHub Actions workflows for managing the EC2 browser worker sandbox fleet.

## Overview

Three workflows manage the sandbox lifecycle:

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **Provision Sandbox** | `provision-sandbox.yml` | Manual | Create a new EC2 instance |
| **Terminate Sandbox** | `terminate-sandbox.yml` | Manual | Destroy an EC2 instance |
| **CD -> EC2 Worker** | `cd-ec2.yml` | Push / Manual | Deploy code to fleet |

## GitHub Secrets

### Required

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key for Terraform |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key for Terraform |
| `VALET_API_TOKEN` | Admin API token for sandbox management endpoints |
| `SANDBOX_SSH_KEY` | SSH private key (PEM) shared across all sandboxes |

### Deprecated (can be removed)

| Secret | Status |
|--------|--------|
| ~~`SANDBOX_IPS`~~ | Replaced by API fleet discovery |
| ~~`EC2_IP_STG`~~ | Replaced by API fleet discovery |
| ~~`EC2_IP_PROD`~~ | Replaced by API fleet discovery |
| ~~`EC2_SSH_KEY_STG`~~ | Replaced by `SANDBOX_SSH_KEY` |
| ~~`EC2_SSH_KEY_PROD`~~ | Replaced by `SANDBOX_SSH_KEY` |
| ~~`SANDBOX_SECRETS_KEY`~~ | No longer needed |

---

## 1. Provisioning a New Sandbox

### Via GitHub Actions (recommended)

1. Go to **Actions > Provision Sandbox > Run workflow**
2. Select parameters:
   - **Environment**: dev, staging, or prod
   - **Instance type**: t3.medium (dev), t3.large (production), t3.xlarge (high-load)
   - **Browser engine**: chromium (free) or adspower (anti-detect)
   - **Capacity**: max concurrent browser sessions (default: 5)
3. Click **Run workflow**

The workflow will:
- Provision an EC2 instance via Terraform
- Wait for cloud-init to complete
- Install the selected browser engine
- Build and deploy the worker code
- Register the sandbox with the API
- Run a health check

### Post-provisioning steps

After the workflow completes:

1. **Configure secrets** on the instance:
   ```bash
   ./infra/scripts/set-secrets.sh <public-ip>
   ```

2. **If using AdsPower**: connect via noVNC to activate the license:
   ```
   http://<public-ip>:6080/vnc.html
   ```

3. **Verify health**:
   ```bash
   ./infra/scripts/health-check.sh <public-ip>
   ```

### Via CLI (alternative)

```bash
cd infra/terraform
terraform apply \
  -var="instance_type=t3.large" \
  -var="environment=staging" \
  -var="key_name=valet-worker" \
  -var="instance_count=1"
```

Then manually run `deploy-worker.sh` and `set-secrets.sh`.

---

## 2. Deploying Code to the Fleet

### Automatic deployment

Code is automatically deployed when changes are pushed to `staging` or `main` branches in these paths:
- `apps/worker/**`
- `packages/shared/**`, `packages/contracts/**`, `packages/db/**`, `packages/llm/**`
- `pnpm-lock.yaml`

### Manual deployment

1. Go to **Actions > CD -> EC2 Worker > Run workflow**
2. Options:
   - **Target IPs**: comma-separated IPs (leave empty for all sandboxes)
   - **Environment**: staging or production

### Fleet discovery order

The deployment workflow discovers sandboxes in this priority order:

1. **Manual target IPs** (from workflow_dispatch input)
2. **API query** (`GET /admin/sandboxes?status=active`) -- preferred
3. **SANDBOX_IPS** GitHub secret (legacy fallback)

### Deployment process

For each sandbox:
1. Mark status as `deploying` via API
2. Upload build artifact (tarball)
3. Create backup of current deployment
4. Extract new code and install dependencies
5. Restart `valet-worker` systemd service
6. Run health check (3 retries with exponential backoff)
7. Mark status as `active` (success) or `unhealthy` (failure)
8. Rollback to backup on failure

---

## 3. Terminating a Sandbox

1. Go to **Actions > Terminate Sandbox > Run workflow**
2. Enter:
   - **Sandbox ID**: the ID from the API
   - **Environment**: dev, staging, or prod
   - **Force**: skip draining (emergency only)
3. Click **Run workflow**

The workflow will:
- Fetch sandbox details from the API
- Mark status as `terminating`
- Stop the worker service via SSH
- Destroy the EC2 instance via Terraform
- Update sandbox status to `terminated`
- Delete associated secrets from the API

---

## 4. Handling Failed Deployments

### Automatic rollback

If a deployment passes the deploy step but fails the health check, the workflow automatically:
1. Restores the previous version from `/opt/valet/app-backup`
2. Restarts the `valet-worker` service
3. Marks the sandbox as `unhealthy` in the API

### Manual investigation

```bash
# Check service logs
ssh -i ~/.ssh/valet-worker.pem ubuntu@<ip> 'sudo journalctl -u valet-worker -n 100 --no-pager'

# Check service status
ssh -i ~/.ssh/valet-worker.pem ubuntu@<ip> 'sudo systemctl status valet-worker'

# Manual rollback
ssh -i ~/.ssh/valet-worker.pem ubuntu@<ip> << 'EOF'
sudo rm -rf /opt/valet/app
sudo mv /opt/valet/app-backup /opt/valet/app
sudo systemctl restart valet-worker
EOF
```

### Re-deploying after failure

1. Fix the issue in code
2. Push to the branch, or
3. Manually trigger the CD workflow targeting the specific IP

---

## 5. Emergency Procedures

### All sandboxes unresponsive

```bash
# Check all sandbox health
for ip in 34.197.248.80 <other-ips>; do
  echo "--- $ip ---"
  ./infra/scripts/health-check.sh $ip
done
```

### Force restart a sandbox

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<ip> << 'EOF'
sudo systemctl restart xvfb
sudo systemctl restart x11vnc
sudo systemctl restart novnc
sudo systemctl restart adspower  # if using adspower
sudo systemctl restart valet-worker
EOF
```

### Instance replacement

If an instance is unrecoverable:
1. Terminate the sandbox via the workflow
2. Provision a new sandbox with the same configuration
3. Reconfigure secrets on the new instance

### AWS Console access

If Terraform state is corrupted or GitHub Actions are down:
1. Go to AWS Console > EC2 > Instances
2. Filter by tag: `Project=valet`
3. Terminate instances manually
4. Clean up Elastic IPs (to avoid charges)
5. Update sandbox status in the API manually
