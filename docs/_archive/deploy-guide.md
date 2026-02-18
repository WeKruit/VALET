# Valet v2 部署操作手册

> 所有步骤在你的 **本地电脑** (macOS) 上执行

---

## 前置条件

在开始之前确保你有：

- AWS 账号 + 配置好 AWS CLI (`aws configure`)
- Terraform 已安装 (`brew install terraform`)
- 一个 AWS EC2 Key Pair（没有的话先创建）
- 已有的 Hatchet token、DATABASE_URL、REDIS_URL（在 .env 或 Fly secrets 里）
- AdsPower 账号和 license

---

## Step 1: Push 代码到 GitHub

代码已经在 `feature/adspower-ec2` 分支上提交好了（4 个 commits）。

```bash
cd VALET

# 确认分支和 commits
git log --oneline feature/adspower-ec2 --not staging
# 应该看到 4 个 commits:
# feat(db): add action_manuals schema...
# feat(worker): add AdsPower EC2 integration...
# feat(infra): add EC2 Terraform config...
# docs: add self-learning workflow research notes

# Push 到 GitHub
git push -u origin feature/adspower-ec2

# 然后在 GitHub 上开 PR: feature/adspower-ec2 → staging
```

---

## Step 2: 创建 AWS Key Pair（如果没有）

```bash
# 创建 key pair
aws ec2 create-key-pair \
  --key-name valet-worker \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/valet-worker.pem

chmod 400 ~/.ssh/valet-worker.pem
```

---

## Step 3: Terraform 开 EC2

```bash
cd infra/terraform

# 初始化 Terraform
terraform init

# 预览资源
terraform plan -var="key_name=valet-worker"

# 创建资源（会输出 EC2 IP）
terraform apply -var="key_name=valet-worker"

# 记下输出的 IP 地址，后面要用
# 例如: EC2_IP=54.123.45.67
```

Terraform 会创建：

- 1 台 t3.xlarge EC2 (4 vCPU, 16GB RAM)
- Security Group（开放 22, 6080, 8080 端口）
- Elastic IP

cloud-init 会自动安装 Xvfb + noVNC + Node.js 22 + pnpm。
**等 3-5 分钟** 让 cloud-init 完成。

```bash
# 检查 cloud-init 是否完成
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'cloud-init status'
# 等到输出: status: done
```

---

## Step 4: 安装 AdsPower

```bash
# 通过 SSH 在 EC2 上运行安装脚本
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'bash -s' < infra/scripts/install-adspower.sh
```

安装完后需要手动激活 license：

1. 浏览器打开 `http://<EC2_IP>:6080`（noVNC）
2. 在 VNC 桌面里看到 AdsPower 窗口
3. 登录你的 AdsPower 账号，激活 license
4. 激活成功后关闭 GUI，重启 headless 服务：

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'sudo systemctl restart adspower'
```

验证 AdsPower API：

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> \
  'curl -s http://localhost:50325/status'
# 应该返回 JSON
```

---

## Step 5: 部署 Worker 到 EC2

```bash
# 回到项目根目录
cd ../../

# 部署（会自动 build、打包、上传、装依赖、配 systemd）
./infra/scripts/deploy-worker.sh <EC2_IP>
```

---

## Step 6: 配置 Secrets

```bash
# 交互式设置 secrets（会提示你输入每个值）
./infra/scripts/set-secrets.sh <EC2_IP>
```

你需要准备的值：

| Secret                 | 哪里找                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `HATCHET_CLIENT_TOKEN` | `.env` 文件或 `fly secrets list -a valet-api-stg`                        |
| `DATABASE_URL`         | Supabase Dashboard → Settings → Database → Connection String (port 6543) |
| `REDIS_URL`            | Upstash Console → Database → REST URL                                    |
| `ANTHROPIC_API_KEY`    | https://console.anthropic.com                                            |

---

## Step 7: 健康检查

```bash
./infra/scripts/health-check.sh <EC2_IP>
```

应该看到所有 10 项检查 PASS：

- SSH connectivity
- Xvfb (virtual display)
- x11vnc (VNC server)
- noVNC web viewer (port 6080)
- AdsPower API (port 50325)
- Valet worker
- Node.js
- Disk space
- Memory
- System uptime

---

## Step 8: 验证 v2 Workflow

### 方法 A: 看 Worker 日志

```bash
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> \
  'sudo journalctl -u valet-worker -f'
```

你应该看到类似：

```
Hatchet client connected
Registered workflow: job-application (v1)
Registered workflow: resume-parse
AdsPower health check: OK
Registered workflow: job-application-v2
Worker started with 5 slots
```

### 方法 B: 通过 Web 前端触发一个任务

1. 打开 `http://localhost:5173` 或 `https://valet-web-stg.fly.dev`
2. 登录
3. 上传简历
4. 创建一个 Job Application 任务
5. 观察进度条和实时日志
6. 同时可以在 `http://<EC2_IP>:6080` 看浏览器实际操作

---

## 常用命令

```bash
# 查看 worker 日志
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'sudo journalctl -u valet-worker -f'

# 查看 AdsPower 日志
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'sudo journalctl -u adspower -f'

# 重启 worker
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'sudo systemctl restart valet-worker'

# 重启 AdsPower
ssh -i ~/.ssh/valet-worker.pem ubuntu@<EC2_IP> 'sudo systemctl restart adspower'

# 看 noVNC 桌面
open http://<EC2_IP>:6080

# 销毁 EC2（不用的时候）
cd infra/terraform && terraform destroy -var="key_name=valet-worker"
```

---

## 数据库 Migration

migration 会在下次 API 部署时自动跑（通过 Fly.io 的 release_command）。

如果需要手动跑：

```bash
# 直连数据库跑 migration
fly ssh console -a valet-api-stg -C "node packages/db/dist/migrate.js"
```

新增的 migration：

- `0002_add_external_status` — tasks 表加 external_status 字段 + FK 约束
- `0003_add_action_manuals` — action_manuals + manual_steps 表

---

## 故障排查

| 问题                | 解决                                                    |
| ------------------- | ------------------------------------------------------- |
| cloud-init 超时     | `ssh ubuntu@IP 'cat /var/log/cloud-init-output.log'`    |
| AdsPower API 没响应 | 通过 noVNC 手动激活 license                             |
| Worker 启动失败     | `journalctl -u valet-worker -n 50` 看日志               |
| Hatchet 连不上      | 检查 HATCHET_CLIENT_TOKEN 是否正确                      |
| 数据库连不上        | 确认 DATABASE_URL 用的是 port 6543 (transaction pooler) |
