# Required GitHub Secrets

This document lists all GitHub secrets required for CI/CD workflows in the WeKruit Valet monorepo.

## 🔐 Repository Secrets

Set these in: **Settings → Secrets and variables → Actions → Repository secrets**

### Core Deployment

| Secret Name       | Description                            | Used By                                                                            | Example Value |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| `FLY_API_TOKEN`   | Fly.io API token for deployments       | `deploy.yml`, `cd-staging.yml`, `cd-prod.yml`                                      | `fo1_...`     |
| `VALET_API_TOKEN` | Admin API token for sandbox management | `cd-ec2.yml`, `provision-sandbox.yml`, `terminate-sandbox.yml`, `secrets-sync.yml` | JWT token     |

### EC2 Sandbox Management

| Secret Name          | Description                                                  | Used By                                                                            | Example Value                          |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------- |
| `SANDBOX_SSH_KEY`    | SSH private key (PEM format) for EC2 instances               | `cd-ec2.yml`, `provision-sandbox.yml`, `terminate-sandbox.yml`, `secrets-sync.yml` | `-----BEGIN RSA PRIVATE KEY-----\n...` |
| `SANDBOX_WORKER_ENV` | Full .env file contents for worker instances                 | `secrets-sync.yml`                                                                 | Multi-line string with all env vars    |
| `SANDBOX_IPS`        | (Optional) JSON array of fallback IPs if API discovery fails | `cd-ec2.yml`                                                                       | `["34.197.248.80"]`                    |

### AWS (for Terraform provisioning)

| Secret Name             | Description               | Used By                                          | Example Value |
| ----------------------- | ------------------------- | ------------------------------------------------ | ------------- |
| `AWS_ACCESS_KEY_ID`     | AWS IAM access key ID     | `provision-sandbox.yml`, `terminate-sandbox.yml` | `AKIA...`     |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret access key | `provision-sandbox.yml`, `terminate-sandbox.yml` | `wJalrXU...`  |

### Claude Code Integration

| Secret Name               | Description                            | Used By                                | Example Value |
| ------------------------- | -------------------------------------- | -------------------------------------- | ------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for Claude Code PR reviews | `claude.yml`, `claude-code-review.yml` | OAuth token   |

### Legacy (Deprecated - use API-driven fleet discovery)

| Secret Name        | Description        | Status                                             |
| ------------------ | ------------------ | -------------------------------------------------- |
| `EC2_SSH_KEY_STG`  | Staging SSH key    | ⚠️ Deprecated - use `SANDBOX_SSH_KEY`              |
| `EC2_SSH_KEY_PROD` | Production SSH key | ⚠️ Deprecated - use `SANDBOX_SSH_KEY`              |
| `EC2_IP_STG`       | Staging EC2 IP     | ⚠️ Deprecated - use API discovery or `SANDBOX_IPS` |
| `EC2_IP_PROD`      | Production EC2 IP  | ⚠️ Deprecated - use API discovery or `SANDBOX_IPS` |

---

## 🔍 Validation

### Check if all secrets are set

```bash
gh secret list
```

### Test secret access (without revealing values)

```bash
gh secret list | grep -E "FLY_API_TOKEN|VALET_API_TOKEN|SANDBOX_SSH_KEY|AWS_ACCESS_KEY_ID"
```

If any required secrets are missing, you'll see errors in workflow runs like:

- `Secret not found: FLY_API_TOKEN`
- `Authentication failed`
- `Permission denied (publickey)` (missing SSH key)

---

## 🔧 Setup Instructions

### 1. Fly.io Token

```bash
# Generate a new Fly.io token
fly auth token

# Add to GitHub
gh secret set FLY_API_TOKEN
# Paste the token when prompted
```

### 2. SSH Key for EC2

```bash
# If you don't have the valet-worker.pem key, create a new one:
ssh-keygen -t rsa -b 4096 -f ~/.ssh/valet-worker.pem -N ""

# Add to GitHub (paste the entire PEM file)
gh secret set SANDBOX_SSH_KEY < ~/.ssh/valet-worker.pem
```

**Important:** The corresponding public key must be added to AWS EC2 as "valet-worker" key pair.

### 3. Valet API Token

Generate an admin API token from your Valet API:

```bash
# Example: Generate via API or admin dashboard
# Then set it:
gh secret set VALET_API_TOKEN
# Paste the JWT when prompted
```

### 4. AWS Credentials

```bash
# Get your AWS credentials from IAM console
gh secret set AWS_ACCESS_KEY_ID
# Paste access key ID

gh secret set AWS_SECRET_ACCESS_KEY
# Paste secret access key
```

### 5. Sandbox Worker Environment

```bash
# Create a template .env for EC2 workers
cat > /tmp/worker.env << 'EOF'
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
GH_SERVICE_SECRET=...
# ... all other env vars ...
EOF

# Set the secret
gh secret set SANDBOX_WORKER_ENV < /tmp/worker.env

# Clean up
rm /tmp/worker.env
```

---

## 📋 Checklist for New Environments

When setting up a new environment (dev/staging/production):

- [ ] Generate Fly.io API token
- [ ] Create/reuse SSH key pair for EC2
- [ ] Generate admin API token from Valet API
- [ ] Set up AWS credentials with proper IAM permissions
- [ ] Create worker .env template
- [ ] Set all secrets in GitHub
- [ ] Validate with: `gh secret list`
- [ ] Test with a manual workflow dispatch

---

## 🛡️ Security Best Practices

1. **Rotate secrets regularly** - Update tokens every 3-6 months
2. **Use least-privilege IAM policies** - Don't use root AWS credentials
3. **Never commit secrets to git** - They belong only in GitHub Secrets or .env (gitignored)
4. **Document secret changes** - Update this file when adding/removing secrets
5. **Use separate secrets per environment** when possible (e.g., separate AWS accounts for staging/prod)

---

## 🆘 Troubleshooting

### Workflow fails with "Secret not found"

```bash
# List all secrets
gh secret list

# Set the missing secret
gh secret set SECRET_NAME
```

### SSH connection fails to EC2

- Verify `SANDBOX_SSH_KEY` is set correctly
- Check that the public key exists in AWS EC2 as "valet-worker"
- Verify EC2 security group allows SSH (port 22) from GitHub Actions IPs

### Fly.io deployment fails with authentication error

- Regenerate Fly.io token: `fly auth token`
- Update the secret: `gh secret set FLY_API_TOKEN`

### API fleet discovery fails

- Verify `VALET_API_TOKEN` has admin permissions
- Check API is accessible from GitHub Actions runners
- Set fallback `SANDBOX_IPS` as JSON array: `gh secret set SANDBOX_IPS -b '["IP1","IP2"]'`
