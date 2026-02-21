# Migration to Shared SSH Key

## Why?

Previously each sandbox could have its own SSH key, stored as per-instance GitHub secrets (`EC2_SSH_KEY_STG`, `EC2_SSH_KEY_PROD`) or managed via a secrets API. This added complexity with no security benefit for fleets under 50 instances.

Now all sandboxes use a single shared SSH key (`valet-worker`). This simplifies:
- GitHub Actions workflows (one secret instead of many)
- Local development (one PEM file)
- Terraform provisioning (single `key_name` default)
- Deployment scripts (`--key` flag or default path)

## Steps

### 1. Generate shared key (if you don't have one)

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/valet-worker.pem -N ""
chmod 600 ~/.ssh/valet-worker.pem
```

### 2. Upload to AWS

```bash
aws ec2 import-key-pair \
  --key-name valet-worker \
  --public-key-material fileb://~/.ssh/valet-worker.pem.pub \
  --region us-east-1
```

### 3. Update GitHub secrets

**Add:**
- `SANDBOX_SSH_KEY` -- contents of `~/.ssh/valet-worker.pem`

**Delete (no longer needed):**
- `EC2_SSH_KEY_STG`
- `EC2_SSH_KEY_PROD`
- `SANDBOX_SSH_KEYS` (if it exists)
- `SANDBOX_SECRETS_KEY` (if it exists)

### 4. Update existing sandboxes (if any)

Copy the public key to all running instances:

```bash
for IP in 34.197.248.80; do
  ssh-copy-id -i ~/.ssh/valet-worker.pem ubuntu@$IP
done
```

### 5. Test

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80
```

### 6. Clean up

- Remove old per-sandbox secrets from the database (if the secrets API was used)
- Delete unused GitHub secrets listed above
