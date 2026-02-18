# EC2 Worker Setup & Task Execution Guide

**Instance:** i-0428f12557f075129 (34.197.248.80)
**Status:** ✅ Running with Chromium installed
**Worker:** ✅ Active and dispatching jobs to GhostHands API

---

## ✅ Current Status

### Worker Service

```
● valet-worker.service - Valet Browser Worker
     Active: active (running)
   Main PID: 402 (node)
     Memory: 333.4M
```

### Connected to GhostHands API

- ✅ Worker dispatching jobs via POST /api/v1/gh/valet/apply
- ✅ Receiving callbacks at POST /api/v1/webhooks/ghosthands
- ✅ X-GH-Service-Key authentication configured

### Installed Software

- ✅ Chromium 145.0.7632.45 (snap)
- ✅ Headless dependencies installed
- ✅ Node.js runtime
- ⚠️ AdsPower not configured (fetch failed)

---

## 🏗️ AWS Resource Provisioning (How It Works)

### Automatic Provisioning via GitHub Actions

The `provision-sandbox.yml` workflow automates EC2 provisioning:

#### What It Does Automatically:

1. **Terraform Creates AWS Resources:**
   - EC2 instance (t3.medium/large/xlarge)
   - Security group (allows SSH port 22)
   - Attaches SSH key pair ("valet-worker")
   - Tags instance with environment

2. **Cloud-init Bootstraps Instance:**
   - Updates packages
   - Installs Node.js 20
   - Installs pnpm
   - Creates `/opt/valet` directory
   - Sets up systemd service

3. **Workflow Deploys Worker:**
   - Builds worker locally
   - Creates tarball
   - SCPs to instance
   - Runs `pnpm install --prod`
   - Starts valet-worker service

4. **Registers with API:**
   - POSTs to `/api/v1/admin/sandboxes`
   - Stores instance metadata
   - Marks as "active"

#### Manual Provisioning

```bash
# Trigger via GitHub Actions
gh workflow run provision-sandbox.yml \
  -f environment=staging \
  -f instance_type=t3.medium \
  -f browser_engine=chromium \
  -f capacity=5

# Or use Terraform directly
cd infra/terraform
terraform init
terraform apply \
  -var="instance_type=t3.medium" \
  -var="environment=staging" \
  -var="key_name=valet-worker" \
  -var="instance_count=1"
```

#### What Gets Created in AWS:

| Resource       | Type            | Purpose             |
| -------------- | --------------- | ------------------- |
| EC2 Instance   | t3.medium+      | Runs browser worker |
| Security Group | valet-worker-sg | Allows SSH (22)     |
| EBS Volume     | gp3 40GB        | Instance storage    |
| Elastic IP     | Optional        | Static IP address   |

**Cost:** ~$30-60/month per instance depending on type

---

## 🚀 Triggering & Tracking Application Tasks

### Method 1: Via API (Programmatic)

#### 1. Create a Job Application Task

```bash
# Using curl
curl -X POST https://valet-api-stg.fly.dev/api/v1/tasks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "clz...",
    "jobUrl": "https://greenhouse.io/example/jobs/123",
    "platform": "greenhouse",
    "autopilot": false
  }'
```

**Response:**

```json
{
  "id": "clz1234567890",
  "status": "pending",
  "platform": "greenhouse",
  "autopilot": false,
  "createdAt": "2026-02-15T03:45:00Z"
}
```

#### 2. Track Task Progress via WebSocket

```typescript
// Frontend code (apps/web/src/features/tasks/hooks/use-task-websocket.ts)
const ws = new WebSocket("wss://valet-api-stg.fly.dev/api/v1/ws?task_id=" + taskId);

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case "state_change":
      console.log("Task status:", message.status);
      // Status: pending → provisioning → running → completed
      break;

    case "progress":
      console.log("Progress:", message.phase, message.progressPct + "%");
      // Phase: navigating, analyzing, filling, uploading, reviewing, submitting
      break;

    case "screenshot":
      console.log("Screenshot:", message.url);
      // Display screenshot to user
      break;

    case "error":
      console.log("Error:", message.error);
      break;
  }
};
```

#### 3. Poll Task Status via REST API

```bash
# Get task details
curl https://valet-api-stg.fly.dev/api/v1/tasks/{taskId} \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**

```json
{
  "id": "clz1234567890",
  "status": "running",
  "platform": "greenhouse",
  "progress": {
    "phase": "filling",
    "progressPct": 45,
    "currentStep": "Entering personal information"
  },
  "workflowRunId": "gh-job-...",
  "createdAt": "2026-02-15T03:45:00Z",
  "startedAt": "2026-02-15T03:45:15Z"
}
```

---

---

### Method 3: Via Worker Logs (Debugging)

#### SSH to EC2 Instance

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80
```

#### Tail Worker Logs

```bash
# Live logs
sudo journalctl -u valet-worker -f --since "5 minutes ago"

# Full logs
sudo journalctl -u valet-worker --no-pager

# Just errors
sudo journalctl -u valet-worker -p err
```

**Example Log Output:**

```json
{"level":30,"time":1771126708694,"pid":402,"name":"valet-worker","msg":"Starting Valet worker..."}
{"level":30,"msg":"job-application-v2 workflow registered"}
{"level":30,"msg":"Worker valet-worker listening for actions"}
{"level":30,"msg":"Connection established using LISTEN_STRATEGY_V2"}
{"level":30,"msg":"Received task","taskId":"clz1234567890"}
{"level":30,"msg":"Provisioning browser...","platform":"greenhouse"}
{"level":30,"msg":"Navigating to job URL..."}
{"level":30,"msg":"Form analysis complete","fields":12}
```

---

## 📊 Task Lifecycle & Progress Tracking

### Task Status Flow

```
pending
  ↓
queued (GhostHands API receives job)
  ↓
provisioning (Browser starting)
  ↓
running
  ├─→ navigating (Opening job URL)
  ├─→ analyzing (Detecting form fields)
  ├─→ filling (Entering data)
  ├─→ uploading (Attaching resume)
  ├─→ reviewing (User review if autopilot=false)
  └─→ submitting (Clicking submit)
  ↓
completed / failed / cancelled
```

### Application Phases (Internal Worker States)

| Phase          | Description                                 | Progress % |
| -------------- | ------------------------------------------- | ---------- |
| `provisioning` | Starting browser session                    | 0-10%      |
| `navigating`   | Opening job application URL                 | 10-20%     |
| `analyzing`    | Detecting form fields with AI               | 20-35%     |
| `filling`      | Entering user data into fields              | 35-70%     |
| `uploading`    | Attaching resume file                       | 70-80%     |
| `reviewing`    | Waiting for human review (if not autopilot) | 80-90%     |
| `submitting`   | Clicking submit button                      | 90-95%     |
| `verifying`    | Confirming submission success               | 95-100%    |

### WebSocket Message Types

#### 1. `state_change`

```json
{
  "type": "state_change",
  "taskId": "clz123",
  "status": "running",
  "timestamp": "2026-02-15T03:45:30Z"
}
```

#### 2. `progress`

```json
{
  "type": "progress",
  "taskId": "clz123",
  "phase": "filling",
  "progressPct": 45,
  "stepDescription": "Entering contact information",
  "currentStep": "Email address",
  "timestamp": "2026-02-15T03:45:35Z"
}
```

#### 3. `screenshot`

```json
{
  "type": "screenshot",
  "taskId": "clz123",
  "url": "https://[project].storage.supabase.co/object/screenshots/clz123-step-3.png",
  "phase": "filling",
  "timestamp": "2026-02-15T03:45:40Z"
}
```

#### 4. `intervention_required` (Human takeover)

```json
{
  "type": "intervention_required",
  "taskId": "clz123",
  "reason": "captcha",
  "interventionUrl": "http://34.197.248.80:6080/vnc.html",
  "timeoutMs": 300000,
  "timestamp": "2026-02-15T03:45:45Z"
}
```

#### 5. `error`

```json
{
  "type": "error",
  "taskId": "clz123",
  "error": "Failed to locate submit button",
  "phase": "submitting",
  "recoverable": true,
  "timestamp": "2026-02-15T03:45:50Z"
}
```

#### 6. `completed`

```json
{
  "type": "completed",
  "taskId": "clz123",
  "result": {
    "success": true,
    "confirmationNumber": "APP-123456",
    "screenshotUrl": "https://..."
  },
  "timestamp": "2026-02-15T03:46:00Z"
}
```

---

## 🧪 Testing the Full Flow

### Step-by-Step Test

#### 1. Start EC2 Instance (if stopped)

```bash
aws ec2 start-instances --instance-ids i-0428f12557f075129
aws ec2 wait instance-running --instance-ids i-0428f12557f075129
```

#### 2. Verify Worker is Running

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 \
  "sudo systemctl status valet-worker"
```

**Expected:** `Active: active (running)`

#### 3. Check GhostHands API Connection

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 \
  "sudo journalctl -u valet-worker -n 20 | grep -i 'ghost\|connected\|ready'"
```

**Expected:** Worker is running and able to dispatch jobs to GhostHands API.

#### 4. Trigger Test Task via API

```bash
# Get your auth token first
TOKEN=$(curl -X POST https://valet-api-stg.fly.dev/api/v1/auth/google \
  -H "Content-Type: application/json" \
  -d '{"code":"your_oauth_code"}' | jq -r '.accessToken')

# Create a test task
TASK_ID=$(curl -X POST https://valet-api-stg.fly.dev/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resumeId": "test-resume-id",
    "jobUrl": "https://jobs.ashbyhq.com/example/123",
    "platform": "ashby",
    "autopilot": false
  }' | jq -r '.id')

echo "Task created: $TASK_ID"
```

#### 5. Watch Worker Logs in Real-Time

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 \
  "sudo journalctl -u valet-worker -f"
```

**Expected Log Sequence:**

1. "Received task" with taskId
2. "Provisioning browser..."
3. "Navigating to job URL..."
4. "Form analysis complete"
5. "Filling field: ..." (multiple)
6. "Screenshot captured"
7. "Waiting for human review" (if autopilot=false)

#### 6. Track via WebSocket (Frontend)

```typescript
// In browser console or React component
const ws = new WebSocket(`wss://valet-api-stg.fly.dev/api/v1/ws?task_id=${TASK_ID}`);
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

#### 7. Verify Task Completion

```bash
curl https://valet-api-stg.fly.dev/api/v1/tasks/$TASK_ID \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Expected:**

```json
{
  "status": "completed",
  "result": {
    "success": true,
    "screenshotUrl": "https://..."
  }
}
```

---

## 🔧 Worker Management

### Restart Worker

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 \
  "sudo systemctl restart valet-worker"
```

### View Worker Environment

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 \
  "sudo cat /opt/valet/.env"
```

### Update Worker Code

```bash
# Trigger deployment via GitHub Actions
gh workflow run cd-ec2.yml \
  -f environment=staging \
  -f target_ips="34.197.248.80"

# Or manually deploy
cd /Users/adam/Desktop/WeKruit/Hiring/VALET
pnpm --filter @valet/worker build
pnpm --filter @valet/shared build
pnpm --filter @valet/contracts build
pnpm --filter @valet/db build
pnpm --filter @valet/llm build

tar -czf worker.tar.gz \
  apps/worker/dist/ \
  apps/worker/package.json \
  packages/*/dist/ \
  packages/*/package.json \
  package.json \
  pnpm-workspace.yaml \
  pnpm-lock.yaml

scp -i ~/.ssh/valet-worker.pem worker.tar.gz ubuntu@34.197.248.80:/tmp/

ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 << 'EOF'
sudo systemctl stop valet-worker
sudo tar -xzf /tmp/worker.tar.gz -C /opt/valet/app
cd /opt/valet/app
sudo -u valet pnpm install --prod
sudo systemctl start valet-worker
sudo systemctl status valet-worker
EOF
```

### Stop Instance (to save costs)

```bash
aws ec2 stop-instances --instance-ids i-0428f12557f075129
```

**Note:** EBS storage costs continue (~$4/month). Terminate to avoid all charges.

---

## 📝 Next Steps

1. **✅ EC2 Running** - Instance i-0428f12557f075129 active
2. **✅ Chromium Installed** - Version 145.0.7632.45
3. **✅ Worker Connected** - Dispatching to GhostHands API
4. **⏭️ Test Application Flow** - Trigger a real job application
5. **⏭️ Setup AdsPower** (Optional) - For persistent browser profiles
6. **⏭️ Add More Workers** - Provision additional instances for scale

---

## 🐛 Troubleshooting

### Worker Not Starting

```bash
sudo journalctl -u valet-worker -n 100 --no-pager
```

### GhostHands API Connection Fails

Check environment variables:

```bash
sudo cat /opt/valet/.env | grep -E "GHOSTHANDS|GH_SERVICE"
```

Verify GhostHands API is accessible:

```bash
curl -I $GHOSTHANDS_API_URL/health
```

### Chromium Crashes

Install missing dependencies:

```bash
sudo apt-get install -y libgbm1 libasound2
```

### Task Stuck in "provisioning"

Check browser provider health:

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@34.197.248.80 \
  "sudo journalctl -u valet-worker | grep 'provider initialized'"
```

---

**Status:** ✅ Ready for application testing!
**Instance:** Running and healthy
**Next Action:** Trigger a test task!
