# Valet v2: Swarm Master Plan

**作者:** Manus AI
**日期:** 2026年2月13日

---

## 1. 全局架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Valet v2 Architecture                        │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Team 3: The Brain (valet-brain)                              │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐  │  │
│  │  │ Manual      │  │ Execution    │  │ Learning Loop       │  │  │
│  │  │ Manager     │  │ Engine       │  │ (Trace → Manual)    │  │  │
│  │  │ (DB+CRUD)   │  │ (Reuse/      │  │                     │  │  │
│  │  │             │  │  Explore)    │  │                     │  │  │
│  │  └─────────────┘  └──────┬───────┘  └─────────────────────┘  │  │
│  └──────────────────────────┼────────────────────────────────────┘  │
│                             │ uses AgentBrowser                     │
│  ┌──────────────────────────┼────────────────────────────────────┐  │
│  │  Team 2: The Hands (valet-hands)                              │  │
│  │  ┌─────────────┐  ┌─────┴──────┐  ┌───────────────────────┐  │  │
│  │  │ Humanized   │  │ Agent      │  │ Stagehand + Magnitude │  │  │
│  │  │ Page        │  │ Browser    │  │ Wrappers              │  │  │
│  │  │ (Bezier,    │  │ (Unified   │  │                       │  │  │
│  │  │  Markov)    │  │  Interface)│  │                       │  │  │
│  │  └─────────────┘  └─────┬──────┘  └───────────────────────┘  │  │
│  └──────────────────────────┼────────────────────────────────────┘  │
│                             │ uses Playwright Page                   │
│  ┌──────────────────────────┼────────────────────────────────────┐  │
│  │  Team 1: The Foundation (valet-foundation)                    │  │
│  │  ┌─────────────┐  ┌─────┴──────┐  ┌───────────────────────┐  │  │
│  │  │ EC2 +       │  │ Browser    │  │ Hatchet Workflows     │  │  │
│  │  │ AdsPower    │  │ Provider   │  │ (Orchestration,       │  │  │
│  │  │ (IaC)       │  │ Service    │  │  Pause/Resume,        │  │  │
│  │  │             │  │            │  │  Streaming)           │  │  │
│  │  └─────────────┘  └────────────┘  └───────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. 三个 Prompt 文件清单

| 文件                          | 团队                   | 代号               | 核心职责                                   |
| ----------------------------- | ---------------------- | ------------------ | ------------------------------------------ |
| `prompt_team_1_foundation.md` | Team 1: The Foundation | `valet-foundation` | Hatchet + EC2 + AdsPower + 代理 + 工作流   |
| `prompt_team_2_hands.md`      | Team 2: The Hands      | `valet-hands`      | 拟人化层 + Stagehand/Magnitude AI 引擎封装 |
| `prompt_team_3_brain.md`      | Team 3: The Brain      | `valet-brain`      | 自学习手册 + 执行引擎 + 学习循环           |

---

## 3. 为什么三个团队可以并行？

关键在于**每个团队面向接口编程，mock 对方的输出**：

| 团队       | 它提供什么                                  | 它消费什么                      | 如何 Mock                                              |
| ---------- | ------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| **Team 1** | `BrowserSession`（含 `playwrightEndpoint`） | 无外部依赖                      | 不需要 mock                                            |
| **Team 2** | `AgentBrowser` 类                           | 一个标准 Playwright `Page` 对象 | 直接用本地 `chromium.launch()` 测试，**不需要 Team 1** |
| **Team 3** | `/api/v1/tasks/execute` API                 | `AgentBrowser` 类               | 创建 `MockAgentBrowser`，**不需要 Team 2**             |

**Team 2 不需要 Team 1**：`AgentBrowser` 的构造函数接受任何标准 Playwright `Page` 对象。开发和测试时直接用 `chromium.launch()` 获取本地浏览器即可。

**Team 3 不需要 Team 2**：`ExecutionEngine` 通过依赖注入接收 `AgentBrowser`。测试时用 `MockAgentBrowser` 即可。

---

## 4. Ticket 到团队的完整映射

### 原有 Tickets（WEK-47 到 WEK-62）

| Ticket | Title                             | Priority | 分配给             |
| ------ | --------------------------------- | -------- | ------------------ |
| WEK-47 | Define Core Interfaces            | Urgent   | **Team 1**         |
| WEK-48 | Implement Hatchet Workflow        | Urgent   | **Team 1**         |
| WEK-49 | Implement SandboxController       | Urgent   | **Team 1**         |
| WEK-50 | Integrate Stagehand Engine        | High     | **Team 2**         |
| WEK-51 | Browserbase Cloud Environment     | Medium   | **Team 1**（后续） |
| WEK-52 | EC2 + AdsPower Integration        | High     | **Team 1**         |
| WEK-53 | Magnitude Engine Integration      | Medium   | **Team 2**         |
| WEK-54 | Chrome Extension                  | Medium   | 后续单独处理       |
| WEK-55 | QA Bank                           | Low      | 后续单独处理       |
| WEK-56 | Batch Processing                  | Low      | 后续单独处理       |
| WEK-59 | Task Pause/Resume                 | High     | **Team 1**         |
| WEK-60 | Expand Stagehand Agent Mode       | Medium   | **Team 2**         |
| WEK-61 | Expand Magnitude Multi-Screenshot | Medium   | **Team 2**         |
| WEK-62 | Hatchet Streaming                 | High     | **Team 1**         |

### 新增 Tickets（WEK-63 到 WEK-72）

| Ticket | Title                                              | Priority | 分配给     |
| ------ | -------------------------------------------------- | -------- | ---------- |
| WEK-63 | Implement Human Cloak Layer v1                     | Urgent   | **Team 2** |
| WEK-64 | EC2 + AdsPower Environment Setup (IaC)             | Urgent   | **Team 1** |
| WEK-65 | Implement IProxyManager (IPRoyal)                  | High     | **Team 1** |
| WEK-66 | Implement IHumanInterventionHandler (VNC/LiveView) | Medium   | **Team 1** |
| WEK-67 | Design Action Manuals Database Schema              | High     | **Team 3** |
| WEK-68 | Implement Manual Manager Service v1                | High     | **Team 3** |
| WEK-69 | Implement Execution Engine v1 (Reuse Mode)         | Medium   | **Team 3** |
| WEK-70 | Manual Generation from Stagehand Trace             | High     | **Team 3** |
| WEK-71 | Manual Generation from Magnitude Trace             | Medium   | **Team 3** |
| WEK-72 | Implement IFormAnalyzer (LLM Form Filling)         | Medium   | **Team 3** |

---

## 5. 执行顺序（每个团队内部）

### Team 1: The Foundation

```
Week 1-2: WEK-47 (Core Interfaces) + WEK-64 (EC2/AdsPower IaC)
    ↓
Week 2-3: WEK-52 (AdsPower API Client) + WEK-65 (Proxy Manager)
    ↓
Week 3-4: WEK-48 (Hatchet Workflow) + WEK-49 (SandboxController)
    ↓
Week 4-5: WEK-59 (Pause/Resume) + WEK-62 (Streaming)
    ↓
Week 5-6: WEK-66 (VNC/LiveView) + WEK-51 (Browserbase, optional)
```

### Team 2: The Hands

```
Week 1-2: WEK-63 (Human Cloak Layer - Bezier + Markov)
    ↓
Week 2-3: WEK-50 (Stagehand Engine Wrapper)
    ↓
Week 3-4: WEK-53 (Magnitude Engine Wrapper)
    ↓
Week 4-5: WEK-60 (Stagehand Agent Mode Expansion)
    ↓
Week 5-6: WEK-61 (Magnitude Multi-Screenshot Expansion)
```

### Team 3: The Brain

```
Week 1-2: WEK-67 (Database Schema Design) + WEK-68 (Manual Manager v1)
    ↓
Week 2-3: WEK-69 (Execution Engine - Reuse Mode)
    ↓
Week 3-4: WEK-70 (Learning Loop - Stagehand Trace → Manual)
    ↓
Week 4-5: WEK-71 (Learning Loop - Magnitude Trace → Manual)
    ↓
Week 5-6: WEK-72 (IFormAnalyzer - LLM Form Filling)
```

---

## 6. 集成时间线

```
Week 6: Team 1 + Team 2 集成
  → AgentBrowser 连接真实的 AdsPower 浏览器（替换本地 chromium）
  → 验证拟人化操作在 AdsPower 环境中正常工作

Week 7: Team 2 + Team 3 集成
  → ExecutionEngine 使用真实的 AgentBrowser（替换 mock）
  → 验证"探索-固化-复用"循环端到端工作

Week 8: 全系统集成 + Workday/Greenhouse POC
  → Hatchet 触发完整工作流
  → 对一个真实的 Greenhouse 职位进行端到端投递测试
```

---

## 7. 如何使用这些 Prompt

每个 prompt 文件都是**自包含的**，可以直接复制粘贴给 Claude Code 启动一个独立的开发 swarm。

**启动步骤**：

1. 打开 Claude Code（或你使用的 AI 编码工具）
2. 创建三个独立的 session/workspace
3. 分别粘贴对应的 prompt 文件内容
4. 每个 session 会按照 prompt 中的 TDD 步骤自动开始开发

**注意事项**：

- 每个 prompt 都包含了完整的接口定义，团队之间不需要等待
- 如果某个团队的接口需要变更，需要同步更新其他团队的 mock
- 建议每周做一次三个团队的 sync meeting，确认接口没有 drift
