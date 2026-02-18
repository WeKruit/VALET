# Task Orchestration & Workflow Execution: Open-Source Research

> **Research Date:** 2026-02-10
> **Purpose:** Evaluate open-source tools for async browser automation task management
> **Constraint:** 12-week MVP timeline. Minimize build-from-scratch work.

---

## Table of Contents

1. [Task Queue Systems](#1-task-queue-systems)
2. [Workflow Orchestration](#2-workflow-orchestration)
3. [Inter-Process Communication](#3-inter-process-communication)
4. [State Machine Libraries](#4-state-machine-libraries)
5. [Rate Limiting Libraries](#5-rate-limiting-libraries)
6. [Monitoring & Dashboard](#6-monitoring--dashboard)
7. [Combined Recommendation](#7-combined-recommendation)
8. [Final Verdict](#8-final-verdict)

---

## 1. Task Queue Systems

### Comparison Table (Live GitHub Stats as of 2026-02-10)

| Library                                               | Stars  | License  | Async Native                                 | Pause/Resume                                                                              | Priority Queues   | Rate Limiting                | Retry/DLQ                | Monitoring UI                                          |
| ----------------------------------------------------- | ------ | -------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------- | ---------------------------- | ------------------------ | ------------------------------------------------------ |
| **[Celery](https://github.com/celery/celery)**        | 27,993 | BSD      | No (sync workers, async via gevent/eventlet) | No native; [workaround exists](https://github.com/TotallyNotChase/resumable-celery-tasks) | Yes               | Yes (per-worker, not global) | Yes / Yes                | [Flower](https://github.com/mher/flower) (7,102 stars) |
| **[Dramatiq](https://github.com/Bogdanp/dramatiq)**   | 5,129  | LGPL-3.0 | No (sync + gevent)                           | No                                                                                        | Yes               | Yes (via middleware)         | Yes / Yes                | dramatiq-dashboard                                     |
| **[Huey](https://github.com/coleifer/huey)**          | 5,923  | MIT      | No (sync)                                    | No                                                                                        | Yes               | No built-in                  | Yes / No                 | Mini admin                                             |
| **[ARQ](https://github.com/python-arq/arq)**          | 2,800  | MIT      | **Yes (asyncio native)**                     | No (abort only)                                                                           | No                | No built-in                  | Yes / No                 | arq-dashboard (3rd party)                              |
| **[TaskTiger](https://github.com/closeio/tasktiger)** | 1,459  | MIT      | No                                           | No                                                                                        | Yes               | No                           | Yes / Yes                | tasktiger-admin                                        |
| **[RQ](https://github.com/rq/rq)**                    | 10,575 | BSD      | No                                           | No                                                                                        | Yes (via queues)  | No                           | Yes / Yes (failed queue) | rq-dashboard                                           |
| **[Taskiq](https://github.com/taskiq-python/taskiq)** | 1,909  | MIT      | **Yes (asyncio native)**                     | No                                                                                        | Yes (via brokers) | Yes (middleware)             | Yes / Yes                | No built-in                                            |

### Critical Feature: Pause/Resume for Human-in-the-Loop

**None of these task queues natively support pausing a running task and resuming it later.** This is the single most important finding. Task queues are designed for fire-and-forget or at most retry-on-failure. True pause/resume requires:

- **Celery workaround:** Split the workflow into multiple tasks. Task 1 runs until CAPTCHA, publishes an event, stops. An API endpoint receives the human solution. Task 2 picks up where Task 1 left off. This requires persisting state externally (Redis/DB). See: [resumable-celery-tasks](https://github.com/TotallyNotChase/resumable-celery-tasks) and [Celery_task_controller](https://github.com/shubhamkumar27/Celery_task_controller).
- **ARQ/Taskiq:** Same pattern -- you'd need to build it yourself with async events.
- **The right tool for this is a workflow orchestrator, not a task queue.**

### Verdict on Task Queues

For our use case (multi-step browser automation with human-in-the-loop), **a simple task queue is insufficient**. We would need to build significant custom infrastructure on top of any of these. Move to Section 2.

---

## 2. Workflow Orchestration

This is where the real answer lies. These tools are designed for exactly our use case.

### Comparison Table (Live GitHub Stats as of 2026-02-10)

| Tool                                                                                                                                 | Stars  | License    | Pause/Resume             | Human-in-the-Loop                            | Async Python | Rate Limiting      | Real-time Status        | Self-hosted          | Managed Cloud                  |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | ------------------------ | -------------------------------------------- | ------------ | ------------------ | ----------------------- | -------------------- | ------------------------------ |
| **[Temporal](https://github.com/temporalio/temporal)** (server: 18,242; [Python SDK](https://github.com/temporalio/sdk-python): 959) | 18,242 | MIT        | **Yes (signals)**        | **Yes (native signals/queries)**             | **Yes**      | Via activities     | Queries + event history | Yes (Docker Compose) | Temporal Cloud ($50/M actions) |
| **[Hatchet](https://github.com/hatchet-dev/hatchet)**                                                                                | 6,516  | MIT        | **Yes (durable events)** | **Yes (UserEventCondition, durable events)** | **Yes**      | **Yes (built-in)** | Built-in web UI         | Yes (Postgres-based) | Hatchet Cloud (free: $5/mo)    |
| **[Prefect](https://github.com/PrefectHQ/prefect)**                                                                                  | 21,589 | Apache-2.0 | Limited (manual pause)   | Limited                                      | **Yes**      | No built-in        | Prefect UI              | Yes                  | Prefect Cloud                  |
| **[Airflow](https://github.com/apache/airflow)**                                                                                     | 44,214 | Apache-2.0 | No (batch-oriented)      | No (designed for ETL)                        | No           | No                 | Airflow UI              | Yes                  | MWAA, Astronomer               |
| **[Dagster](https://github.com/dagster-io/dagster)**                                                                                 | 14,928 | Apache-2.0 | Limited                  | Limited                                      | Partial      | No                 | Dagster UI              | Yes                  | Dagster Cloud                  |
| **[LangGraph](https://github.com/langchain-ai/langgraph)**                                                                           | 24,555 | MIT        | **Yes (interrupt())**    | **Yes (interrupt + Command(resume=...))**    | **Yes**      | No built-in        | Via checkpointer        | N/A (library)        | LangGraph Cloud                |

### Deep Dive: The Three Realistic Contenders

#### A. Temporal -- The Gold Standard for Durable Workflows

**How it solves our exact problem (human-in-the-loop CAPTCHA):**

```python
import asyncio
from dataclasses import dataclass
from datetime import timedelta
from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

@dataclass
class CaptchaSolution:
    solution: str
    solved_by: str

@dataclass
class TaskStatus:
    state: str
    progress: float
    message: str

@workflow.defn
class JobApplicationWorkflow:
    def __init__(self):
        self.captcha_solution: CaptchaSolution | None = None
        self.status = TaskStatus(state="CREATED", progress=0.0, message="")

    @workflow.run
    async def run(self, application_data: dict) -> dict:
        # 1. PROVISIONING: Start browser session
        self.status = TaskStatus("PROVISIONING", 0.1, "Starting browser...")
        browser_info = await workflow.execute_activity(
            start_browser_session,
            application_data["profile_id"],
            start_to_close_timeout=timedelta(seconds=60),
        )

        # 2. EXECUTING: Navigate and fill form
        self.status = TaskStatus("EXECUTING", 0.3, "Navigating to job posting...")
        await workflow.execute_activity(
            navigate_to_job,
            browser_info,
            application_data["job_url"],
            start_to_close_timeout=timedelta(seconds=120),
        )

        self.status = TaskStatus("EXECUTING", 0.5, "Filling application form...")
        form_result = await workflow.execute_activity(
            fill_application_form,
            browser_info,
            application_data,
            start_to_close_timeout=timedelta(minutes=5),
        )

        # 3. NEED_HUMAN: If CAPTCHA detected, PAUSE and wait for signal
        if form_result.get("captcha_detected"):
            self.status = TaskStatus(
                "NEED_HUMAN", 0.7, "CAPTCHA detected -- waiting for human..."
            )

            # THIS IS THE KEY: workflow pauses here, releases all resources,
            # and resumes exactly here when signal arrives. Can wait DAYS.
            try:
                await workflow.wait_condition(
                    lambda: self.captcha_solution is not None,
                    timeout=timedelta(minutes=30),
                )
            except asyncio.TimeoutError:
                self.status = TaskStatus("TIMEOUT", 0.7, "CAPTCHA not solved in time")
                return {"status": "timeout", "reason": "captcha_timeout"}

            # Resume with the solution
            await workflow.execute_activity(
                submit_captcha_solution,
                browser_info,
                self.captcha_solution.solution,
                start_to_close_timeout=timedelta(seconds=30),
            )

        # 4. COMPLETED: Submit and verify
        self.status = TaskStatus("EXECUTING", 0.9, "Submitting application...")
        result = await workflow.execute_activity(
            submit_application,
            browser_info,
            start_to_close_timeout=timedelta(seconds=60),
        )

        self.status = TaskStatus("COMPLETED", 1.0, "Application submitted!")
        return result

    @workflow.signal
    def solve_captcha(self, solution: CaptchaSolution):
        """Called by external API when human solves CAPTCHA"""
        self.captcha_solution = solution

    @workflow.query
    def get_status(self) -> TaskStatus:
        """Called by frontend to poll status (or used with WebSocket relay)"""
        return self.status


# --- Activities (side-effectful, can fail and retry) ---

@activity.defn
async def start_browser_session(profile_id: str) -> dict:
    """Call AdsPower API to start browser, return CDP connection info"""
    # ... AdsPower API call ...
    pass

@activity.defn
async def navigate_to_job(browser_info: dict, job_url: str):
    """Use Playwright to navigate to job posting"""
    pass

@activity.defn
async def fill_application_form(browser_info: dict, data: dict) -> dict:
    """Use Playwright + LLM to fill form fields"""
    pass

@activity.defn
async def submit_captcha_solution(browser_info: dict, solution: str):
    """Submit CAPTCHA solution in browser"""
    pass

@activity.defn
async def submit_application(browser_info: dict) -> dict:
    """Click submit and verify success"""
    pass


# --- External API to send signal ---
async def handle_captcha_solved(task_id: str, solution: str):
    """Called by your FastAPI endpoint when human solves CAPTCHA"""
    client = await Client.connect("localhost:7233")
    handle = client.get_workflow_handle(task_id)
    await handle.signal(
        JobApplicationWorkflow.solve_captcha,
        CaptchaSolution(solution=solution, solved_by="human"),
    )
```

**Temporal Pros:**

- True durable execution: workflow survives crashes and resumes exactly where it left off
- Native signals for human-in-the-loop (CAPTCHA, manual review, approvals)
- Native queries for real-time status
- Built-in retry with backoff per activity
- Built-in timeouts at every level
- Full event history for debugging
- Web UI for monitoring workflows
- Cross-language support (can call Go/Java activities from Python)
- Battle-tested at scale (Netflix, Uber, Stripe, Snap)

**Temporal Cons:**

- **Infrastructure overhead:** Requires running Temporal Server (Go binary) + database (Postgres/MySQL/Cassandra). Docker Compose setup is non-trivial for production.
- **Learning curve:** Determinism constraints (no random(), no datetime.now() in workflow code)
- **Self-hosted complexity:** [Multiple services](https://medium.com/@mailman966/my-journey-hosting-a-temporal-cluster-237fec22a5ec) (frontend, matching, history, worker) in production
- **Temporal Cloud cost:** $50/M actions minimum, but [free $1K startup credits](https://aws.amazon.com/marketplace/pp/prodview-xx2x66m6fp2lo) available
- Python SDK still maturing (959 stars vs Go SDK)

---

#### B. Hatchet -- The Modern Middle Ground

**How it solves our exact problem (human-in-the-loop CAPTCHA):**

```python
from hatchet_sdk import Hatchet, Context, DurableContext
from hatchet_sdk.conditions import or_, SleepCondition, UserEventCondition
from datetime import timedelta

hatchet = Hatchet()

@hatchet.workflow(name="JobApplicationWorkflow")
class JobApplicationWorkflow:

    @hatchet.task(name="StartBrowser")
    async def start_browser(self, input: dict, ctx: Context) -> dict:
        ctx.put("status", {"state": "PROVISIONING", "progress": 0.1})
        # Start AdsPower browser session
        browser_info = await start_adspower_session(input["profile_id"])
        return {"browser_info": browser_info}

    @hatchet.task(name="FillForm", parents=["StartBrowser"])
    async def fill_form(self, input: dict, ctx: Context) -> dict:
        ctx.put("status", {"state": "EXECUTING", "progress": 0.5})
        browser_info = ctx.task_output("StartBrowser")["browser_info"]
        result = await fill_application(browser_info, input)
        return {"captcha_detected": result.get("captcha_detected", False)}

    # DURABLE EVENT: Pause and wait for human CAPTCHA solution
    @hatchet.durable_task(name="WaitForCaptcha", parents=["FillForm"])
    async def wait_for_captcha(self, input: dict, ctx: DurableContext) -> dict:
        fill_result = ctx.task_output("FillForm")
        if not fill_result["captcha_detected"]:
            return {"skipped": True}

        ctx.put("status", {"state": "NEED_HUMAN", "progress": 0.7})

        # THIS IS THE KEY: task pauses here and waits for external event
        # Can wait up to the timeout (30 minutes here)
        result = await ctx.aio_wait_for(
            "captcha_solution",
            or_(
                UserEventCondition(event_key="captcha:solved"),
                SleepCondition(timedelta(minutes=30)),  # timeout
            ),
        )
        return {"solution": result}

    @hatchet.task(name="SubmitApplication", parents=["WaitForCaptcha"])
    async def submit_application(self, input: dict, ctx: Context) -> dict:
        ctx.put("status", {"state": "EXECUTING", "progress": 0.9})
        # Submit with CAPTCHA solution if needed
        captcha_result = ctx.task_output("WaitForCaptcha")
        # ... submit application ...
        ctx.put("status", {"state": "COMPLETED", "progress": 1.0})
        return {"status": "completed"}
```

**Hatchet Pros:**

- **Postgres-only infrastructure** -- no separate message broker needed
- Built-in web UI for monitoring, debugging, and replaying tasks
- Built-in rate limiting and concurrency control
- Durable events for human-in-the-loop (exactly what we need)
- DAG-based workflow definition is intuitive
- Python SDK is first-class
- **Much simpler self-hosting** than Temporal (just Postgres)
- Free tier: $5/mo, 2K task runs/day, 10 tasks/sec
- YC-backed (W24), actively developed (6,516 stars, pushed today)

**Hatchet Cons:**

- Younger project (2024 vs Temporal's 2020)
- Smaller community and ecosystem
- Less battle-tested at massive scale
- Documentation still maturing
- No cross-language workflow support
- Fewer production case studies

---

#### C. LangGraph -- AI-Native State Graphs

**How it solves our exact problem (human-in-the-loop CAPTCHA):**

```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.types import interrupt, Command
from typing import TypedDict

class ApplicationState(TypedDict):
    job_url: str
    profile_id: str
    browser_info: dict | None
    status: str
    progress: float
    captcha_detected: bool
    captcha_solution: str | None
    result: dict | None

def start_browser(state: ApplicationState) -> dict:
    # Start AdsPower session
    browser_info = start_adspower_session(state["profile_id"])
    return {"browser_info": browser_info, "status": "PROVISIONING", "progress": 0.1}

def fill_form(state: ApplicationState) -> dict:
    result = fill_application(state["browser_info"], state)
    return {
        "status": "EXECUTING",
        "progress": 0.5,
        "captcha_detected": result.get("captcha_detected", False),
    }

def check_captcha(state: ApplicationState) -> str:
    """Router: decide next step based on CAPTCHA detection"""
    if state["captcha_detected"]:
        return "need_human"
    return "submit"

def wait_for_captcha(state: ApplicationState) -> dict:
    # THIS IS THE KEY: interrupt() pauses the graph and waits for
    # Command(resume={"solution": "..."}) from external caller
    solution = interrupt(
        {"message": "CAPTCHA detected", "task_id": state.get("task_id")}
    )
    return {
        "captcha_solution": solution["solution"],
        "status": "EXECUTING",
        "progress": 0.8,
    }

def submit_application(state: ApplicationState) -> dict:
    result = submit_app(state["browser_info"], state.get("captcha_solution"))
    return {"result": result, "status": "COMPLETED", "progress": 1.0}

# Build the graph
graph = StateGraph(ApplicationState)
graph.add_node("start_browser", start_browser)
graph.add_node("fill_form", fill_form)
graph.add_node("wait_for_captcha", wait_for_captcha)
graph.add_node("submit", submit_application)

graph.add_edge(START, "start_browser")
graph.add_edge("start_browser", "fill_form")
graph.add_conditional_edges("fill_form", check_captcha)
graph.add_edge("wait_for_captcha", "submit")
graph.add_edge("submit", END)

# Compile with persistence (required for interrupt to work)
checkpointer = PostgresSaver.from_conn_string("postgresql://...")
app = graph.compile(checkpointer=checkpointer)

# --- Running it ---
config = {"configurable": {"thread_id": "task-123"}}

# Start execution (will pause at interrupt if CAPTCHA detected)
result = app.invoke(
    {"job_url": "...", "profile_id": "...", "browser_info": None},
    config=config,
)

# Later, when human solves CAPTCHA:
result = app.invoke(Command(resume={"solution": "abc123"}), config=config)
```

**LangGraph Pros:**

- Extremely flexible state graph model
- Native `interrupt()` for human-in-the-loop (released 2025)
- Checkpoint-based persistence (Postgres, Redis, SQLite)
- Ideal if you are already using LLMs in your workflow (form filling, resume parsing)
- Lightweight -- it's a library, not a service
- Huge community (24,555 stars)
- No infrastructure overhead beyond a checkpointer backend

**LangGraph Cons:**

- **Not a task queue** -- no built-in worker management, concurrency control, or rate limiting
- No built-in monitoring UI (unless using LangGraph Cloud / LangSmith)
- Designed for LLM agent workflows, not general task orchestration
- No built-in retry/timeout per step (you'd build this yourself)
- No priority queues
- You still need something to schedule and distribute work across workers
- Relatively new (interrupt() is from late 2025)

---

## 3. Inter-Process Communication

### For API <-> Workers <-> Frontend Communication

| Technology                                                            | Use Case                     | Persistence               | Ordering | Python Support      | Recommendation                                                               |
| --------------------------------------------------------------------- | ---------------------------- | ------------------------- | -------- | ------------------- | ---------------------------------------------------------------------------- |
| **Redis Pub/Sub**                                                     | Ephemeral event broadcasting | No (fire-and-forget)      | No       | redis-py / aioredis | Good for real-time UI updates if clients are always connected                |
| **Redis Streams**                                                     | Persistent event log         | **Yes** (append-only log) | **Yes**  | redis-py            | **Best for task status updates** -- missed messages retrievable on reconnect |
| **RabbitMQ** (13,449 stars)                                           | Message broker               | Yes                       | Yes      | pika / aio-pika     | Overkill if using Temporal/Hatchet (they have their own messaging)           |
| **NATS** ([nats.py](https://github.com/nats-io/nats.py): 1,187 stars) | Lightweight messaging        | JetStream: Yes            | Yes      | nats-py             | Great perf, but another service to manage                                    |
| **ZeroMQ** ([pyzmq](https://github.com/zeromq/pyzmq): 4,091 stars)    | Socket-based messaging       | No                        | No       | pyzmq               | Low-level, too much DIY for our use case                                     |

### Frontend Real-Time Updates

| Technology                   | Stars             | Auto-Reconnect | Fallback               | Binary Support | Rooms/Channels | Recommendation                                                            |
| ---------------------------- | ----------------- | -------------- | ---------------------- | -------------- | -------------- | ------------------------------------------------------------------------- |
| **FastAPI WebSocket**        | (part of FastAPI) | Manual         | No                     | Yes            | Manual         | **Best for our stack** -- no extra dependency, native FastAPI integration |
| **python-socketio**          | 4,323             | **Yes**        | **Yes** (long-polling) | Yes            | **Yes**        | Better if you need rooms/namespaces and auto-reconnect                    |
| **SSE (Server-Sent Events)** | N/A               | Browser-native | N/A                    | No             | No             | Simplest for one-way status updates, but no bidirectional                 |

### Recommended Architecture

```
Frontend (React/Extension)
    |
    v (WebSocket or SSE)
FastAPI Server
    |
    v (Redis Streams for persistence, Pub/Sub for real-time relay)
Redis
    ^
    | (publish status updates)
Workers (Temporal/Hatchet activities)
```

**For MVP:** Use **FastAPI WebSocket** + **Redis Pub/Sub** for real-time status. Add Redis Streams later if you need persistence/replay. If using Temporal, you can use `workflow.query` to poll status instead of building a separate pub/sub layer.

---

## 4. State Machine Libraries

### Comparison Table (Live GitHub Stats)

| Library                                                                    | Stars  | License | Language   | Async Support      | Persistence                | Visualization                     | Recommendation                |
| -------------------------------------------------------------------------- | ------ | ------- | ---------- | ------------------ | -------------------------- | --------------------------------- | ----------------------------- |
| **[transitions](https://github.com/pytransitions/transitions)**            | 6,408  | MIT     | Python     | Yes (AsyncMachine) | No built-in (DIY)          | Graphviz export                   | Best Python FSM library       |
| **[python-statemachine](https://github.com/fgmacedo/python-statemachine)** | 1,189  | MIT     | Python     | Yes (AsyncEngine)  | "Persistent domain models" | Graphviz                          | Good alternative, cleaner API |
| **[XState](https://github.com/statelyai/xstate)**                          | 29,230 | MIT     | TypeScript | N/A (event-driven) | Via persistence adapters   | **XState Visualizer (excellent)** | If you need frontend FSM too  |

### Do We Even Need a Separate State Machine Library?

**Key insight:** If we use Temporal or Hatchet, the state machine is built into the workflow engine itself. The workflow IS the state machine. Task lifecycle (CREATED -> QUEUED -> EXECUTING -> NEED_HUMAN -> COMPLETED) is managed by the orchestrator.

You only need a standalone state machine library if:

1. You're using a simple task queue (Celery/ARQ) and need to manage state yourself
2. You need fine-grained client-side state management (XState in the extension)

**For the existing `modalStateMachine.ts` in the extension:** This is a frontend DOM-interaction state machine -- keep it as-is. It's for a different purpose (handling LinkedIn modals) than the backend task lifecycle.

---

## 5. Rate Limiting Libraries

### Comparison Table

| Library                                                   | Stars | Async             | Algorithms                                 | Storage Backends                     | Distributed              | Recommendation                              |
| --------------------------------------------------------- | ----- | ----------------- | ------------------------------------------ | ------------------------------------ | ------------------------ | ------------------------------------------- |
| **[limits](https://github.com/alisaifee/limits)**         | 603   | Via async storage | Fixed window, sliding window, token bucket | Redis, Memcached, MongoDB, in-memory | **Yes** (Redis)          | Best general-purpose Python rate limiter    |
| **[aiolimiter](https://github.com/mjpieters/aiolimiter)** | 741   | **Yes (native)**  | Token bucket                               | In-memory only                       | No                       | Best for single-process async rate limiting |
| **Celery rate_limit**                                     | N/A   | No                | Token bucket                               | Per-worker                           | No (per-worker only)     | Inadequate for global rate limiting         |
| **Hatchet built-in**                                      | N/A   | Yes               | Concurrency + rate limiting                | Postgres                             | **Yes**                  | Best if using Hatchet (zero extra config)   |
| **Temporal activity rate limit**                          | N/A   | Yes               | Via custom worker config                   | N/A                                  | **Yes** (per task queue) | Good if using Temporal                      |

### Our Rate Limiting Requirements

We need rate limiting at multiple levels:

1. **Per-platform:** LinkedIn max N actions/day, Indeed max M actions/day
2. **Per-user:** Free tier vs paid tier limits
3. **Per-browser-profile:** One action at a time per AdsPower profile
4. **Global:** Don't overwhelm our infrastructure

### Recommended Approach

```python
# Using `limits` library with Redis for distributed rate limiting
from limits import parse
from limits.storage import RedisStorage
from limits.strategies import MovingWindowRateLimiter

storage = RedisStorage("redis://localhost:6379")
limiter = MovingWindowRateLimiter(storage)

# Define rate limits
linkedin_daily = parse("50/day")        # 50 LinkedIn actions per day
linkedin_hourly = parse("10/hour")      # 10 per hour (spread out)
per_user_daily = parse("100/day")       # per user limit
per_profile_concurrent = parse("1/second")  # one action per profile at a time

def check_rate_limit(user_id: str, platform: str, profile_id: str) -> bool:
    """Check all rate limits before executing a task"""
    platform_key = f"platform:{platform}"
    user_key = f"user:{user_id}"
    profile_key = f"profile:{profile_id}"

    if not limiter.hit(linkedin_daily, platform_key, user_key):
        return False
    if not limiter.hit(linkedin_hourly, platform_key, user_key):
        return False
    if not limiter.hit(per_user_daily, user_key):
        return False
    if not limiter.hit(per_profile_concurrent, profile_key):
        return False
    return True
```

If using **Hatchet**, much of this is built in via concurrency control and rate limiting on task definitions -- significantly less custom code.

---

## 6. Monitoring & Dashboard

| Tool                                                       | Stars    | Purpose                    | Works With             | Self-hosted | Cost                 |
| ---------------------------------------------------------- | -------- | -------------------------- | ---------------------- | ----------- | -------------------- |
| **[Flower](https://github.com/mher/flower)**               | 7,102    | Celery monitoring          | Celery only            | Yes         | Free                 |
| **Temporal Web UI**                                        | Built-in | Workflow monitoring        | Temporal               | Yes         | Free (with Temporal) |
| **Hatchet Web UI**                                         | Built-in | Task + workflow monitoring | Hatchet                | Yes         | Free (with Hatchet)  |
| **[Grafana](https://github.com/grafana/grafana)**          | 72,093   | Dashboards + alerting      | Any (via data sources) | Yes         | Free                 |
| **[Prometheus](https://github.com/prometheus/prometheus)** | 62,647   | Metrics collection         | Any                    | Yes         | Free                 |
| **[Sentry](https://github.com/getsentry/sentry)**          | 43,130   | Error tracking             | Any                    | Yes         | Free tier available  |

### Recommended Monitoring Stack

**For MVP:** Use the built-in UI of your orchestrator (Temporal Web UI or Hatchet Dashboard). Add Sentry for error tracking.

**For Production:** Add Grafana + Prometheus for custom metrics (task completion rate, avg duration, failure rate, queue depth).

---

## 7. Combined Recommendation: Four Options

### Option A: Celery-Based (Traditional)

```
Celery + Redis + transitions (state machine) + FastAPI WebSocket + limits (rate limiting)
```

| Aspect                 | Detail                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**       | Celery workers execute tasks. Custom state machine tracks lifecycle. Redis Pub/Sub relays status to FastAPI WebSocket. `limits` library for rate limiting. |
| **Pause/Resume**       | Must split workflows into separate Celery tasks chained via signals. State persisted to Redis/Postgres between steps. Complex and error-prone.             |
| **Monitoring**         | Flower + custom dashboard                                                                                                                                  |
| **Infrastructure**     | Redis (broker) + Postgres (results) + your app                                                                                                             |
| **Time to MVP**        | 8-10 weeks (significant custom state management and pause/resume logic)                                                                                    |
| **Maintenance burden** | High -- you own the state machine, the pause/resume, the error recovery                                                                                    |

**Pros:** Battle-tested, huge ecosystem, tons of tutorials, every Python dev knows Celery.

**Cons:** You are building a workflow orchestrator from scratch on top of a task queue. The pause/resume pattern for CAPTCHA is fragile. No built-in workflow visualization. Flower is limited.

**Verdict: NOT recommended.** Too much custom code for our requirements.

---

### Option B: Temporal-Based (Durable Execution)

```
Temporal Server + temporalio Python SDK + FastAPI (API gateway) + Redis Pub/Sub (status relay)
```

| Aspect                 | Detail                                                                                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**       | Temporal server manages all workflow state. Python workers execute activities. FastAPI handles HTTP API + WebSocket. Optional Redis for real-time status relay (or use Temporal queries). |
| **Pause/Resume**       | **Native.** `workflow.wait_condition()` + signals. Zero custom code.                                                                                                                      |
| **Monitoring**         | Temporal Web UI (excellent) + optional Grafana                                                                                                                                            |
| **Infrastructure**     | Temporal Server (Docker) + Postgres + Redis (optional) + your app                                                                                                                         |
| **Time to MVP**        | 6-8 weeks (once you learn Temporal concepts)                                                                                                                                              |
| **Maintenance burden** | Low for workflow logic. Medium for Temporal infrastructure.                                                                                                                               |

**Pros:**

- The pause/resume pattern is 10 lines of code, not a custom framework
- Full event history for every workflow execution
- Automatic retry with configurable backoff
- Timeout handling at every level
- Production-proven at massive scale
- Replaces Celery, state machine library, and custom retry logic in one tool

**Cons:**

- Must run Temporal Server (4 microservices in production)
- Docker Compose for dev is fine; production needs careful ops work
- Temporal Cloud: $50/M actions (but $1K-$6K startup credits available)
- Learning curve: determinism rules, workflow vs activity distinction
- Python SDK community smaller than Go/Java

**Verdict: Best for correctness and long-term scalability.** If you have ops capacity or will use Temporal Cloud.

---

### Option C: Hatchet-Based (Modern Middle Ground)

```
Hatchet (self-hosted or cloud) + FastAPI (API gateway) + Redis (optional, for WebSocket relay)
```

| Aspect                 | Detail                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**       | Hatchet manages workflows, task queues, rate limiting, and monitoring. Python workers run tasks. FastAPI handles HTTP API + WebSocket. |
| **Pause/Resume**       | **Native.** Durable events with `ctx.aio_wait_for()` + `UserEventCondition`.                                                           |
| **Monitoring**         | Built-in Hatchet Web UI (very good)                                                                                                    |
| **Infrastructure**     | Hatchet (single binary) + Postgres + your app. That's it.                                                                              |
| **Time to MVP**        | **5-7 weeks** (simplest setup of all orchestrator options)                                                                             |
| **Maintenance burden** | Low. Postgres-based, no separate message broker needed.                                                                                |

**Pros:**

- **Simplest infrastructure:** Just Postgres. No Redis required for the orchestrator.
- Built-in rate limiting and concurrency control (critical for our use case)
- Built-in monitoring UI with task history and debugging
- Durable events solve the CAPTCHA pause/resume pattern cleanly
- DAG-based workflow definition is very intuitive
- Python SDK is async-native and well-designed
- YC-backed, very actively developed
- Free cloud tier ($5/mo) for getting started

**Cons:**

- Younger project (2024). Less battle-tested than Temporal.
- Smaller community (6.5K stars vs Temporal's 18K)
- Fewer production case studies at massive scale
- Documentation still improving
- If Hatchet-the-company fails, you're on a less-maintained OSS project

**Verdict: Best for MVP speed and simplicity.** The fastest path to shipping.

---

### Option D: Hybrid (LangGraph + Task Queue)

```
LangGraph (workflow logic) + Celery/ARQ (task distribution) + Redis + FastAPI WebSocket
```

| Aspect                 | Detail                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Architecture**       | LangGraph defines workflow graphs with state. Celery/ARQ distributes work. Redis for state persistence and messaging. |
| **Pause/Resume**       | LangGraph `interrupt()` + `Command(resume=...)`. But you build the worker layer yourself.                             |
| **Monitoring**         | LangSmith (paid) or custom                                                                                            |
| **Infrastructure**     | Redis + Postgres + your app + Celery workers                                                                          |
| **Time to MVP**        | 8-10 weeks (gluing pieces together takes time)                                                                        |
| **Maintenance burden** | Medium-High. You own the glue between LangGraph and the task queue.                                                   |

**Pros:**

- LangGraph is excellent if LLM calls are central to your workflow
- Very flexible state graph model
- `interrupt()` is elegant for human-in-the-loop
- Huge LangChain ecosystem

**Cons:**

- LangGraph is a library, not a platform. No worker management, no rate limiting, no monitoring.
- You still need a task queue underneath for distribution and concurrency
- Two systems to learn and maintain
- Overengineered if your workflow is mostly browser automation with occasional LLM calls

**Verdict: Only choose this if LLM agent logic dominates your workflow.** For browser automation with occasional LLM, it's overkill.

---

## 8. Final Verdict

### Recommendation: Option C (Hatchet) for MVP, with Option B (Temporal) as the scale-up path

#### Why Hatchet for the MVP (Weeks 1-12)

| Factor                         | Hatchet                     | Temporal             | Celery                  | LangGraph Hybrid   |
| ------------------------------ | --------------------------- | -------------------- | ----------------------- | ------------------ |
| Time to first working workflow | **2-3 days**                | 3-5 days             | 5-7 days                | 5-7 days           |
| Infrastructure complexity      | **Low (Postgres only)**     | Medium (4 services)  | Medium (Redis + broker) | Medium-High        |
| Pause/resume for CAPTCHA       | **Native (durable events)** | **Native (signals)** | DIY (complex)           | Native (interrupt) |
| Built-in rate limiting         | **Yes**                     | No (via activities)  | Per-worker only         | No                 |
| Built-in monitoring UI         | **Yes (excellent)**         | Yes (excellent)      | Flower (limited)        | LangSmith (paid)   |
| Learning curve for team        | **Low**                     | Medium               | Low (but DIY state)     | Medium             |
| Cost to start                  | **$5/mo or free self-host** | $100/mo cloud or DIY | Free                    | Free + LangSmith   |
| Fits 12-week timeline          | **Yes**                     | Yes (tight)          | Risky                   | Risky              |

#### Recommended Stack for MVP

```
+------------------+     +------------------+     +------------------+
|  Chrome Extension|     |   FastAPI Server  |     |    Hatchet       |
|  (React + TS)    |<--->|   (API Gateway)   |<--->|  (Orchestrator)  |
|                  | WS  |                   | SDK |                  |
+------------------+     +------------------+     +------------------+
                                |                         |
                                v                         v
                          +----------+              +-----------+
                          | Postgres |              |  Workers   |
                          | (shared) |              | (Python)   |
                          +----------+              +-----------+
                                                         |
                                                    +---------+
                                                    | AdsPower|
                                                    | Gmail   |
                                                    | LLM API |
                                                    +---------+
```

**Components:**

1. **Hatchet** -- Workflow orchestration, task queuing, rate limiting, monitoring
2. **FastAPI** -- API gateway, WebSocket server for frontend updates
3. **Postgres** -- Shared database for app data and Hatchet state
4. **Redis** -- Only if needed for WebSocket pub/sub (optional, can poll Hatchet API instead)
5. **`limits` library** -- Additional rate limiting if Hatchet's built-in isn't granular enough
6. **Sentry** -- Error tracking from day one

**What we do NOT need to build:**

- Custom state machine for task lifecycle (Hatchet handles it)
- Custom pause/resume logic (durable events)
- Custom retry/timeout logic (built into Hatchet)
- Custom monitoring dashboard (Hatchet UI)
- Custom task queue (Hatchet IS the queue)
- Custom dead letter queue (Hatchet handles failed tasks)

#### Migration Path to Temporal (If Needed)

If we hit Hatchet's limits (>500 tasks/sec, need cross-language workflows, need event sourcing):

1. The workflow patterns are similar (DAG tasks -> Temporal activities)
2. Durable events -> Temporal signals
3. Hatchet web UI -> Temporal web UI
4. Migration is conceptually straightforward, though code must be rewritten

#### Alternative: Go Straight to Temporal If...

- You already have Docker/K8s ops experience on the team
- You expect >10K tasks/day within 6 months
- You want the most battle-tested option regardless of setup time
- You plan to use Temporal Cloud (simplifies ops, $1K free credits for startups)

---

## Appendix: Key Sources

- [Temporal Python SDK](https://github.com/temporalio/sdk-python)
- [Temporal Pause-Resume-Compensate Sample](https://github.com/temporalio/temporal-pause-resume-compensate)
- [Hatchet Documentation](https://docs.hatchet.run/home)
- [Hatchet Durable Events](https://docs.hatchet.run/home/durable-events)
- [LangGraph Interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts)
- [LangGraph Human-in-the-Loop](https://langchain-ai.github.io/langgraph/how-tos/human_in_the_loop/wait-user-input/)
- [Temporal + LangGraph Two-Layer Architecture](https://www.anup.io/temporal-langgraph-a-two-layer-architecture-for-multi-agent-coordination/)
- [Celery vs Temporal Comparison](https://pedrobuzzi.hashnode.dev/celery-vs-temporalio)
- [Modern Queueing Architectures](https://medium.com/@pranavprakash4777/modern-queueing-architectures-celery-rabbitmq-redis-or-temporal-f93ea7c526ec)
- [Hatchet vs Temporal: How to Think About Durable Execution](https://hatchet.run/blog/durable-execution)
- [Redis Streams vs Pub/Sub](https://oneuptime.com/blog/post/2026-01-21-redis-streams-vs-pubsub/view)
- [Scaling WebSockets with Redis Pub/Sub and FastAPI](https://medium.com/@nandagopal05/scaling-websockets-with-pub-sub-using-python-redis-fastapi-b16392ffe291)
- [Self-Hosting Temporal Cluster](https://medium.com/@mailman966/my-journey-hosting-a-temporal-cluster-237fec22a5ec)
- [Workflow Orchestration Platforms Comparison 2025](https://procycons.com/en/blogs/workflow-orchestration-platforms-comparison-2025/)
- [Resumable Celery Tasks](https://github.com/TotallyNotChase/resumable-celery-tasks)
- [Celery Rate Limiting](https://moldstud.com/articles/p-mastering-task-rate-limiting-with-celery-essential-insights-for-developers)
- [Hatchet Pricing](https://hatchet.run/pricing)
- [Temporal Cloud Pricing](https://aws.amazon.com/marketplace/pp/prodview-xx2x66m6fp2lo)
- [Choosing the Right Python Task Queue](https://judoscale.com/blog/choose-python-task-queue)
