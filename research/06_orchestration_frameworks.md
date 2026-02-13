# Orchestration Framework Research for Browser Automation System

**Date:** 2026-02-10
**Objective:** Identify open-source orchestration backbone for a system that manages browser session spawning, AI agent task routing, state machines (QUEUED -> EXECUTING -> NEED_HUMAN -> COMPLETED), RPA/LLM coordination, and human-in-the-loop takeover.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [AI Agent Orchestration Frameworks](#2-ai-agent-orchestration-frameworks)
3. [Browser-Specific Agent Orchestration](#3-browser-specific-agent-orchestration)
4. [Task Queue and State Machine Libraries](#4-task-queue--state-machine-libraries)
5. [Durable Execution Engines](#5-durable-execution-engines)
6. [Architecture Patterns](#6-architecture-patterns)
7. [Final Recommendations](#7-final-recommendations)

---

## 1. Executive Summary

After researching 25+ frameworks across orchestration, browser agents, task queues, and state machines, the strongest architecture for our browser automation + human-in-the-loop system is a **two-layer approach**:

- **Layer 1 (Workflow Durability):** Temporal.io or Inngest for durable workflow execution, retries, state persistence, and human wait signals.
- **Layer 2 (Agent Logic):** LangGraph for stateful agent decision graphs with interrupt/resume for human-in-the-loop.

This avoids building from scratch while giving us the flexibility to model both infrastructure-level reliability and agent-level intelligence. The key insight from the ecosystem in 2025-2026 is that **Temporal answers "did this complete, and if not, what do we do about it?" while LangGraph answers "given this state, what should the agent do next?"** -- and production deployments are increasingly combining both.

---

## 2. AI Agent Orchestration Frameworks

### Comparison Table

| Framework | Stars | License | Language | Human-in-Loop | Stateful Pause/Resume | State Machine | Async Tasks | Error Recovery | LLM Integration |
|-----------|-------|---------|----------|---------------|----------------------|---------------|-------------|----------------|-----------------|
| **AutoGen** (Microsoft) | 54,449 | CC-BY-4.0 | Python | Yes (conversation) | Limited | No built-in | Yes | Basic retry | Multi-provider |
| **CrewAI** | 43,925 | MIT | Python | Yes (callbacks) | No native | No built-in | Yes (via tools) | Retry + fallback | Multi-provider |
| **LangGraph** | 24,555 | MIT | Python | **Yes (interrupt/resume)** | **Yes (checkpointers)** | **Yes (graph states)** | Yes | Checkpoints + retry | Full LangChain ecosystem |
| **Temporal.io** | 18,242 | MIT | Go (server) / Python SDK | **Yes (signals)** | **Yes (durable)** | **Yes (workflow states)** | **Yes (native)** | **Best-in-class** | Via activities |
| **n8n** | 173,932 | Fair-code | TypeScript | Yes (wait nodes) | Yes | Visual workflows | Yes | Retry config | AI Agent nodes |
| **Prefect** | 21,589 | Apache-2.0 | Python | Limited | Pause/resume tasks | No built-in | Yes | Retry + caching | Via integrations |
| **Dagster** | 14,928 | Apache-2.0 | Python | No | Limited | No built-in | Yes | Retry + reexecution | Via ops |
| **Conductor** (Netflix) | 31,534 | Apache-2.0 | Java | Yes (human tasks) | Yes | **Yes (workflow DSL)** | Yes | Retry + error handling | Via workers |

### Detailed Analysis

#### LangGraph (by LangChain) -- TOP PICK for Agent Logic Layer

- **Repository:** [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)
- **Stars:** 24,555 | **Forks:** 4,272 | **License:** MIT
- **Key strength:** Purpose-built for stateful agent workflows with cycles and decision points.

**Why it fits our use case:**
- **`interrupt()` function** pauses execution mid-node and hands control back to the caller -- perfect for NEED_HUMAN state transitions.
- **Checkpointers** (Postgres, SQLite, in-memory) persist full graph state, enabling resume from any checkpoint.
- **Graph-based state machine:** Nodes represent processing steps, edges represent transitions with conditional logic. Maps directly to our QUEUED -> EXECUTING -> NEED_HUMAN -> COMPLETED flow.
- **`Command(resume=...)`** lets external input (human decisions) flow back into the paused graph.
- **Time-travel debugging** allows replaying agent decisions.
- **Lowest latency** among agent frameworks in benchmarks; passes only state deltas between nodes.

**Human-in-the-Loop pattern (built-in):**
```python
from langgraph.types import interrupt, Command

def human_review_node(state):
    # Pause execution, wait for human
    decision = interrupt("Please review this action")
    if decision == "approve":
        return {"status": "EXECUTING"}
    else:
        return {"status": "CANCELLED"}
```

**Limitations:**
- No infrastructure-level durability (process crash = state loss unless using external checkpointer).
- Redis-based state management has caused lifecycle/debugging issues in production at scale.
- Does not handle distributed task routing, retries across services, or long-running waits (hours/days) well on its own.

#### Temporal.io -- TOP PICK for Workflow Durability Layer

- **Repository:** [temporalio/temporal](https://github.com/temporalio/temporal)
- **Stars:** 18,242 | **Forks:** 1,338 | **License:** MIT
- **Key strength:** Durable execution guarantees -- workflows survive crashes, restarts, and infrastructure failures.

**Why it fits our use case:**
- **Signals** allow injecting data (human approvals) into running workflows without losing state.
- **Workflow.wait_condition()** pauses workflows indefinitely until a signal arrives -- ideal for human-in-the-loop waits that could last minutes to hours.
- **Activities** are retried automatically with configurable policies (exponential backoff, max attempts, timeouts).
- **Event History** provides an immutable audit trail of every state change -- critical for compliance.
- **Language SDKs:** Python, TypeScript, Go, Java.
- **OpenAI Agents SDK integration** (launched July 2025) wraps agent calls in durable workflows.

**Human-in-the-Loop pattern:**
```python
@workflow.defn
class BrowserTaskWorkflow:
    def __init__(self):
        self.human_decision = None

    @workflow.signal
    async def approve_action(self, decision: str):
        self.human_decision = decision

    @workflow.run
    async def run(self, task):
        # Execute browser action
        result = await workflow.execute_activity(
            run_browser_action, task, start_to_close_timeout=timedelta(minutes=5)
        )
        if result.needs_human_review:
            # Wait for human signal -- survives crashes
            await workflow.wait_condition(lambda: self.human_decision is not None)
            if self.human_decision == "approve":
                return await workflow.execute_activity(finalize_action, result)
```

**Limitations:**
- Requires running the Temporal server (self-hosted or Temporal Cloud).
- Steeper learning curve; deterministic replay constraints require understanding.
- Not AI-native -- requires wrapping LLM/agent logic in activities.
- Heavier infrastructure footprint than simpler alternatives.

#### CrewAI

- **Repository:** [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI)
- **Stars:** 43,925 | **Forks:** 5,891 | **License:** MIT

**Assessment:** CrewAI excels at role-based multi-agent collaboration (e.g., "Researcher" + "Writer" agents) but lacks the workflow durability and state machine primitives we need. No native pause/resume for human-in-the-loop. Better suited for autonomous multi-agent tasks than orchestrated browser workflows with human checkpoints.

**Verdict:** Not recommended as orchestration backbone. Could be used as a sub-component if we need multi-agent collaboration within a single task.

#### AutoGen (Microsoft) / AG2

- **Repositories:** [microsoft/autogen](https://github.com/microsoft/autogen) (54,449 stars) | [ag2ai/ag2](https://github.com/ag2ai/ag2) (4,118 stars, Apache-2.0)
- **Note:** Framework split in late 2024. AG2 is the community fork maintaining v0.2 compatibility. Microsoft's AutoGen 0.4 uses actor-model architecture.

**Assessment:** Conversation-driven multi-agent framework. AutoGen 0.4 has a sophisticated actor-model architecture but is still stabilizing. Agent-E (built on AG2) does browser automation. However, no durable execution, no native state machine, and the ecosystem split creates adoption risk.

**Verdict:** Not recommended as orchestration backbone. Agent-E's browser automation patterns are worth studying.

#### n8n

- **Repository:** [n8n-io/n8n](https://github.com/n8n-io/n8n)
- **Stars:** 173,932 | **License:** Fair-code (sustainable use)

**Assessment:** Extremely popular visual workflow automation with 400+ integrations and AI Agent nodes. Supports 220 workflow executions/second on a single instance. However, it is a general-purpose automation platform, not an agent orchestration framework. The fair-code license could be restrictive for commercial embedding. Best as a complementary tool for non-technical team members to build automations, not as the core orchestration layer for a browser agent system.

**Verdict:** Not recommended as core backbone. Consider for admin/ops workflows that complement the main system.

#### Conductor (Netflix OSS)

- **Repository:** [conductor-oss/conductor](https://github.com/conductor-oss/conductor)
- **Stars:** 31,534 | **License:** Apache-2.0

**Assessment:** Powerful microservice orchestration with JSON-based workflow DSL, human tasks, and state management. However, it is Java-based, requires significant infrastructure (Elasticsearch, Dynomite/Redis), and is designed for microservice choreography rather than AI agent workflows. Overkill for our use case.

**Verdict:** Not recommended. Infrastructure overhead too high for our needs.

---

## 3. Browser-Specific Agent Orchestration

### Comparison Table

| Framework | Stars | License | Orchestration Built-in | Multi-step Workflows | Human-in-Loop | State Persistence | Self-hostable |
|-----------|-------|---------|----------------------|---------------------|---------------|-------------------|---------------|
| **Browser-Use** | 78,150 | MIT | Basic (agent loop) | Via agent steps | No native | No | Yes |
| **Skyvern** | 20,360 | AGPL-3.0 | **Yes (workflow engine)** | **Yes (chained tasks)** | Roadmap (livestreams) | Yes | Yes |
| **LaVague** | 6,296 | Apache-2.0 | Basic | Agent-driven | No | No | Yes |
| **Agent-E** | 1,212 | MIT | Via AG2/AutoGen | Via agent framework | Via AutoGen | No | Yes |
| **Dendrite** | 306 | MIT | SDK-level | Via code | No | No | Yes |
| **WebArena** | 1,328 | Apache-2.0 | Research benchmark | N/A | N/A | N/A | N/A |

### Detailed Analysis

#### Browser-Use

- **Repository:** [browser-use/browser-use](https://github.com/browser-use/browser-use)
- **Stars:** 78,150 | **License:** MIT

The dominant open-source browser automation agent. Uses LLMs to understand and interact with web pages dynamically. However, its orchestration is a simple agent loop -- it lacks workflow persistence, state machines, or human-in-the-loop interrupts. It is a **browser action executor**, not a workflow orchestrator.

**How it fits:** Use Browser-Use as the browser action layer (the "hands") while LangGraph/Temporal handles orchestration (the "brain").

#### Skyvern

- **Repository:** [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern)
- **Stars:** 20,360 | **License:** AGPL-3.0 (restrictive for commercial use)

The most complete browser automation platform with built-in workflow orchestration. Features include workflow chaining, parallel execution, CAPTCHA solving, 2FA handling, anti-bot detection, and a visual workflow builder. Their roadmap includes "Interactable Livestreams" for human-in-the-loop.

**Caution:** AGPL-3.0 license requires open-sourcing any derivative work or network-accessible service. This is a significant constraint for a commercial product.

**How it fits:** If AGPL is acceptable, Skyvern could replace much of our custom orchestration for browser-specific workflows. Otherwise, study its architecture but build with MIT-licensed components.

#### Agent-E (by Emergence AI)

- **Repository:** [EmergenceAI/Agent-E](https://github.com/EmergenceAI/Agent-E)
- **Stars:** 1,212 | **License:** MIT

Built on AG2 (AutoGen fork), Agent-E is a DOM-aware browser automation agent that parses the Document Object Model for precise interactions. Interesting architecture for form-filling and button-clicking tasks.

**How it fits:** Worth studying for DOM interaction patterns. MIT licensed, so code can be adapted.

---

## 4. Task Queue & State Machine Libraries

### Task Queues

| Library | Stars | License | Language | Async Native | Broker | Performance | Learning Curve |
|---------|-------|---------|----------|-------------|--------|-------------|---------------|
| **Celery** | 27,993 | BSD-like | Python | No (pre-fork) | RabbitMQ, Redis | Good | Medium-High |
| **Dramatiq** | 5,129 | LGPL-3.0 | Python | Event-driven I/O | RabbitMQ, Redis | **10x faster than RQ** | Low |
| **Huey** | 5,923 | MIT | Python | Optional | Redis | **10x faster than RQ** | Low |
| **ARQ** | 2,800 | MIT | Python | **Yes (asyncio)** | Redis | Moderate | Low |

**Key insight:** If we adopt Temporal or LangGraph, we likely do **not need a separate task queue**. Both frameworks handle task scheduling, execution, and retry internally. A standalone task queue is only needed if we build a custom orchestration layer.

**If we need one:** Dramatiq for the best balance of simplicity and performance, or ARQ if native asyncio support is critical.

### State Machine Libraries

| Library | Stars | License | Language | Async Support | Persistence | Visual Tools | Callbacks/Hooks |
|---------|-------|---------|----------|-------------|-------------|-------------|----------------|
| **XState** | 29,230 | MIT | TypeScript | Yes (actors) | Via adapters | **Stately Studio** | Yes |
| **transitions** (Python) | 6,408 | MIT | Python | No | No built-in | Diagram export | Yes |
| **python-statemachine** | 1,189 | MIT | Python | **Yes** | No built-in | Diagram export | **Guards + Validators** |
| **Stately Agent** | 334 | MIT | TypeScript | Yes | Via XState | **Stately Studio** | LLM-powered |

**Key insight:** Again, if we adopt LangGraph, its graph states **are** the state machine. Each node represents a state, edges represent transitions, and conditional edges handle branching logic like NEED_HUMAN. A separate state machine library is only needed for fine-grained sub-task state tracking within a node.

**If we need one (TypeScript/extension side):** XState is the gold standard -- 29K stars, actor model, visual debugging via Stately Studio, and Stately Agent adds LLM-powered decision making to state machines.

**If we need one (Python/backend side):** `python-statemachine` for async support and guards/validators, or `transitions` for its maturity and extensions.

---

## 5. Durable Execution Engines

These are a newer category that deserves separate attention. They provide the "your code will complete no matter what" guarantee.

| Engine | Stars | License | Language | AI-Specific Features | Complexity | Self-host |
|--------|-------|---------|----------|---------------------|-----------|-----------|
| **Temporal** | 18,242 | MIT | Go (server) | OpenAI SDK integration | High | Yes |
| **Hatchet** | 6,516 | MIT | Go (server) | Agentic workflow primitives | Medium | Yes |
| **Inngest** | 4,790 | Source-available | Go (server) | `step.ai.wrap()` for LLM calls | **Low** | Yes |
| **Restate** | 3,472 | Source-available | Rust (server) | Durable AI loops | Medium | Yes |

### Hatchet -- Worth Watching

- **Repository:** [hatchet-dev/hatchet](https://github.com/hatchet-dev/hatchet)
- **Stars:** 6,516 | **License:** MIT
- Built on Postgres (simpler infra than Temporal). Task start times under 20ms. Processing 1B+ tasks/month in production. Python, TypeScript, and Go SDKs. Designed for agentic AI workflows with retry and parallelization. YC W24 company.

### Inngest -- Simplest Developer Experience

- **Repository:** [inngest/inngest](https://github.com/inngest/inngest)
- **Stars:** 4,790 | **License:** Source-available
- `step.ai.wrap()` provides durable LLM execution with visibility into request/response data. Event-driven with built-in queues. Serverless-friendly. TypeScript-first with Python support.

---

## 6. Architecture Patterns

### Pattern A: Temporal + LangGraph (Two-Layer Architecture)

This is the emerging production pattern documented by multiple teams in 2025-2026.

```
                    Temporal Workflow (Durability Layer)
                    ====================================
                    |                                    |
                    |   Activity 1: Browser Setup        |
                    |       -> spawn Playwright session   |
                    |                                    |
                    |   Activity 2: Agent Execution       |
                    |       -> LangGraph graph runs here  |
                    |       -> checkpoints for decisions  |
                    |       -> interrupt() for human      |
                    |                                    |
                    |   Signal: human_decision            |
                    |       -> resume with approval       |
                    |                                    |
                    |   Activity 3: Finalize              |
                    |       -> update DB, notify user     |
                    ====================================
```

**Pros:**
- Best-in-class durability (Temporal) + best-in-class agent logic (LangGraph)
- Human-in-the-loop at both layers (Temporal signals for long waits, LangGraph interrupts for quick decisions)
- Full audit trail via Temporal Event History
- Each layer is independently testable
- Both are MIT licensed

**Cons:**
- Two systems to learn and operate
- Temporal requires infrastructure (server + DB)
- Complexity in mapping LangGraph checkpoints to Temporal activities

### Pattern B: LangGraph-Only with Postgres Checkpointer

```
                    LangGraph Graph (Single Layer)
                    ================================
                    |                                |
                    |  Node: QUEUED                  |
                    |    -> validate task             |
                    |    -> edge: start_execution     |
                    |                                |
                    |  Node: EXECUTING               |
                    |    -> Browser-Use agent action  |
                    |    -> conditional edge:          |
                    |       needs_human? -> NEED_HUMAN |
                    |       complete? -> COMPLETED     |
                    |                                |
                    |  Node: NEED_HUMAN              |
                    |    -> interrupt()               |
                    |    -> wait for Command(resume=) |
                    |                                |
                    |  Node: COMPLETED               |
                    |    -> save results              |
                    ================================
                    |
                    PostgresSaver (persistence)
```

**Pros:**
- Single framework handles state machine + agent logic + human-in-the-loop
- Simpler architecture, fewer moving parts
- Fast iteration, large LangChain community
- Postgres checkpointer provides durability for most use cases

**Cons:**
- Not as durable as Temporal (process crash during non-checkpointed code = state loss)
- No built-in task distribution across workers
- Scaling requires custom infrastructure
- Redis-based state management has caused issues at scale in production

### Pattern C: Hatchet/Inngest + Custom Agent Logic

```
                    Hatchet/Inngest (Lightweight Durability)
                    =========================================
                    |                                         |
                    |  Step 1: queue_task (durable)           |
                    |  Step 2: execute_browser_action (durable)|
                    |  Step 3: check_needs_human (durable)    |
                    |  Step 4: wait_for_human (durable)       |
                    |  Step 5: finalize (durable)             |
                    =========================================
```

**Pros:**
- Simpler infrastructure than Temporal (Postgres-based)
- MIT licensed (Hatchet)
- Lower learning curve
- Built-in queuing and retries

**Cons:**
- Less mature ecosystems
- No built-in agent/LLM abstractions
- Custom agent logic must be built from scratch
- Smaller communities for troubleshooting

---

## 7. Final Recommendations

### For Each Decision Layer:

#### Orchestration Layer

| Option | Recommendation | Rationale |
|--------|---------------|-----------|
| **LangGraph (standalone)** | **RECOMMENDED for MVP/Phase 1** | Fastest path to a working system. Handles state machine, agent logic, and human-in-the-loop in one framework. Postgres checkpointer provides adequate durability for initial deployment. MIT licensed. |
| **Temporal + LangGraph** | **RECOMMENDED for Production/Phase 2** | Add Temporal when you need: cross-service orchestration, long-running waits (hours), guaranteed completion, audit trails. Run LangGraph graphs as Temporal activities. |
| **Hatchet + LangGraph** | **ALTERNATIVE for Production** | If Temporal feels too heavy, Hatchet provides similar durability with less infrastructure (Postgres-only). Newer but growing fast. |
| CrewAI | Not recommended | Lacks state machines, durability, and fine-grained human-in-the-loop control. |
| AutoGen / AG2 | Not recommended | Ecosystem split risk. Conversation-driven model less suitable for structured browser workflows. |
| n8n | Not recommended as core | Consider for admin-facing workflow builder as complementary tool. |

#### Task Queue

| Option | Recommendation | Rationale |
|--------|---------------|-----------|
| **Built-in to orchestration framework** | **RECOMMENDED** | LangGraph and Temporal both include task scheduling. Adding Celery/Dramatiq creates unnecessary complexity. |
| Dramatiq | Fallback option | If building custom orchestration, Dramatiq is the best standalone choice: simple API, good performance, event-driven I/O. |
| Celery | Not recommended | Overly complex for our needs. Pre-fork model less efficient for I/O-bound browser tasks. |

#### State Machine

| Option | Recommendation | Rationale |
|--------|---------------|-----------|
| **LangGraph graph states** | **RECOMMENDED for backend** | The graph IS the state machine. Nodes = states, edges = transitions, conditional edges = guards. No extra library needed. |
| **XState** | **RECOMMENDED for frontend/extension** | If the Chrome extension needs local state management for UI flows, XState is the gold standard. Stately Agent adds LLM-powered decision making. |
| `transitions` / `python-statemachine` | Not recommended | Unnecessary if using LangGraph. Only consider for isolated sub-components that need pure state machine logic without agent integration. |

#### Browser Action Layer

| Option | Recommendation | Rationale |
|--------|---------------|-----------|
| **Browser-Use** | **RECOMMENDED** | 78K stars, MIT licensed, dominant open-source browser agent. Use as the "hands" controlled by LangGraph orchestration. |
| Skyvern | Evaluate carefully | Most complete solution but AGPL-3.0 is restrictive. If license is acceptable, it could replace much custom work. |
| Custom Playwright | Fallback option | If Browser-Use is too opinionated, raw Playwright with custom LLM integration gives full control. |

### Recommended Architecture (Phased)

#### Phase 1: MVP

```
Chrome Extension (React + XState for UI state)
        |
        v
Backend API (FastAPI / Python)
        |
        v
LangGraph (orchestration + state machine + human-in-the-loop)
  |-- PostgresSaver (state persistence)
  |-- Browser-Use (browser actions)
  |-- Claude/GPT API (LLM decisions)
```

- **Time to prototype:** 2-4 weeks
- **Infrastructure:** Postgres only
- **Human-in-the-loop:** LangGraph `interrupt()` / `Command(resume=...)`

#### Phase 2: Production Hardening

```
Chrome Extension (React + XState)
        |
        v
Backend API (FastAPI)
        |
        v
Temporal Workflow Engine (durability + signals + audit trail)
  |-- Activity: LangGraph Agent (orchestration + decisions)
  |     |-- Browser-Use (browser actions)
  |     |-- LLM APIs (decisions)
  |-- Signal: human_approval (human-in-the-loop)
  |-- Activity: Notification Service
  |-- Activity: Data Persistence
```

- **When to upgrade:** When you need guaranteed completion, multi-hour human waits, cross-service coordination, or compliance audit trails.
- **Infrastructure:** Postgres + Temporal server (self-hosted or Temporal Cloud)

---

## Sources

### AI Agent Frameworks
- [LangGraph - GitHub](https://github.com/langchain-ai/langgraph)
- [LangGraph Interrupts Documentation](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [LangGraph Human-in-the-Loop](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/wait-user-input/)
- [LangGraph Explained 2026 Edition](https://medium.com/@dewasheesh.rana/langgraph-explained-2026-edition-ea8f725abff3)
- [CrewAI - GitHub](https://github.com/crewAIInc/crewAI)
- [AutoGen - GitHub](https://github.com/microsoft/autogen)
- [AG2 - GitHub](https://github.com/ag2ai/ag2)
- [CrewAI vs LangGraph vs AutoGen (DataCamp)](https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen)
- [Best AI Agent Frameworks 2026](https://medium.com/@kia556867/best-ai-agent-frameworks-in-2026-crewai-vs-autogen-vs-langgraph-06d1fba2c220)
- [Top 10 LangGraph Alternatives 2026](https://www.ema.co/additional-blogs/addition-blogs/langgraph-alternatives-to-consider)

### Workflow Orchestration
- [Temporal.io - GitHub](https://github.com/temporalio/temporal)
- [Temporal + LangGraph Two-Layer Architecture](https://www.anup.io/temporal-langgraph-a-two-layer-architecture-for-multi-agent-coordination/)
- [Orchestrating Multi-Step Agents: Temporal/Dagster/LangGraph Patterns](https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/orchestrating-multi-step-agents-temporal-dagster-langgraph-patterns-for-long-running-work/)
- [Temporal and OpenAI Launch AI Agent Durability (InfoQ)](https://www.infoq.com/news/2025/09/temporal-aiagent/)
- [Temporal vs Airflow: Agent Orchestration Showdown 2025](https://sparkco.ai/blog/temporal-vs-airflow-agent-orchestration-showdown-2025)
- [Agentic AI Workflows: Why Orchestration with Temporal is Key](https://intuitionlabs.ai/articles/agentic-ai-temporal-orchestration)
- [Temporal AI Agent Demo - GitHub](https://github.com/temporal-community/temporal-ai-agent)

### Durable Execution
- [Hatchet - GitHub](https://github.com/hatchet-dev/hatchet)
- [Inngest - GitHub](https://github.com/inngest/inngest)
- [Restate - GitHub](https://github.com/restatedev/restate)
- [Inngest vs Temporal Comparison](https://www.inngest.com/compare-to-temporal)
- [Rise of Durable Execution Engines](https://www.kai-waehner.de/blog/2025/06/05/the-rise-of-the-durable-execution-engine-temporal-restate-in-an-event-driven-architecture-apache-kafka/)
- [Restate: Durable AI Loops](https://www.restate.dev/blog/durable-ai-loops-fault-tolerance-across-frameworks-and-without-handcuffs)

### Browser Automation
- [Browser-Use - GitHub](https://github.com/browser-use/browser-use)
- [Skyvern - GitHub](https://github.com/Skyvern-AI/skyvern)
- [Agent-E - GitHub](https://github.com/EmergenceAI/Agent-E)
- [LaVague - GitHub](https://github.com/lavague-ai/LaVague)
- [Dendrite - GitHub](https://github.com/dendrite-systems/dendrite-python-sdk)
- [AI Web Agents Complete Guide (Skyvern)](https://www.skyvern.com/blog/ai-web-agents-complete-guide-to-intelligent-browser-automation-november-2025/)
- [AWS: AI Agent-Driven Browser Automation](https://aws.amazon.com/blogs/machine-learning/ai-agent-driven-browser-automation-for-enterprise-workflow-management/)

### Task Queues and State Machines
- [Celery - GitHub](https://github.com/celery/celery)
- [Dramatiq - GitHub](https://github.com/Bogdanp/dramatiq)
- [ARQ - GitHub](https://github.com/samuelcolvin/arq)
- [XState - GitHub](https://github.com/statelyai/xstate)
- [Stately Agent - GitHub](https://github.com/statelyai/agent)
- [transitions - GitHub](https://github.com/pytransitions/transitions)
- [python-statemachine - GitHub](https://github.com/fgmacedo/python-statemachine)
- [Python Task Queue Load Test Comparison](https://stevenyue.com/blogs/exploring-python-task-queue-libraries-with-load-test)
- [Python Background Tasks 2025 Comparison](https://devproportal.com/languages/python/python-background-tasks-celery-rq-dramatiq-comparison-2025/)

### General
- [n8n - GitHub](https://github.com/n8n-io/n8n)
- [Conductor - GitHub](https://github.com/conductor-oss/conductor)
- [Prefect - GitHub](https://github.com/PrefectHQ/prefect)
- [Dagster - GitHub](https://github.com/dagster-io/dagster)
- [Complete Guide to AI Agent Frameworks 2025 (Langflow)](https://www.langflow.org/blog/the-complete-guide-to-choosing-an-ai-agent-framework-in-2025)
- [Top 5 Open-Source Agentic AI Frameworks 2026](https://aimultiple.com/agentic-frameworks)
- [Top 10+ Agentic Orchestration Frameworks 2026](https://aimultiple.com/agentic-orchestration)
