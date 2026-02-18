# Executive Summary: WeKruit Valet

> **Date:** 2026-02-10
> **Status:** Deep Research Complete, Ready for Implementation
> **Research Documents:** 10 files, ~350KB of technical research

---

## What We're Building

An **async, AI-agent-driven job application system** ("Copilot") that runs in the background on behalf of users. Users provide a job URL + resume + preferences. The system opens an anti-detect browser (AdsPower), navigates to the job posting, fills forms via LLM, answers screening questions, and submits. When blocked (CAPTCHA, ambiguous questions), it pauses and lets the user take over via remote browser (noVNC). MVP targets LinkedIn Easy Apply only, expanding to Greenhouse, Lever, Workday in later phases.

---

## Recommended Tech Stack (Revised)

| Layer                   | Technology                                                 | Why                                                                                     |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Browser Interaction** | Extension Content Script (primary) + Patchright (fallback) | Most stealthy approach; content scripts are invisible to bot detection                  |
| **Browser Automation**  | Browser-Use via CDP (for server-side)                      | 78K stars, MIT, hybrid DOM+vision, recently dropped Playwright for raw CDP (5x faster)  |
| **Anti-Detect Browser** | AdsPower (Local API + MCP)                                 | Commercial, fingerprint management, CDP WebSocket URL per profile                       |
| **LLM Primary**         | Claude Sonnet 4.5                                          | 61.4% OSWorld, native Computer Use, best browser automation benchmarks                  |
| **LLM Routing**         | LiteLLM + model router                                     | Route complex tasks to Sonnet, routine to GPT-4.1 mini, trivial to GPT-4.1 nano         |
| **Orchestration**       | **Hatchet** (MVP) → Temporal (scale)                       | Replaces Celery. Native pause/resume for CAPTCHA, built-in rate limiting, Postgres-only |
| **Backend API**         | FastAPI + WebSocket                                        | REST + real-time status updates                                                         |
| **Human Takeover**      | noVNC (Xvfb + x11vnc)                                      | 13K stars, WebSocket-based remote browser                                               |
| **Proxy**               | IPRoyal residential (sticky sessions)                      | 24h sticky, bind IP to AdsPower profile                                                 |
| **Database**            | PostgreSQL (shared with Hatchet)                           | Single DB for app data + orchestrator state                                             |
| **Email (v2.0)**        | Gmail MCP Server                                           | LLM-native email access for verification codes                                          |

### Key Architecture Changes from Round 1

1. **Hatchet replaces Celery** -- native durable events for CAPTCHA pause/resume (was complex DIY with Celery)
2. **Model routing added** -- 3-tier LLM strategy cuts costs from $0.045 to $0.021 per application
3. **Extension content script as primary interaction** -- most stealthy, no CDP detection vectors
4. **Patchright discovered** -- patched Playwright that supports closed shadow DOM (critical for Workday)
5. **Cordyceps discovered** -- Playwright API inside Chrome extension without CDP (emerging, promising)

---

## Architecture (Revised)

```
Chrome Extension (React + TS)
    |
    v (WebSocket)
FastAPI Server (API Gateway)
    |
    v (SDK)
Hatchet (Orchestrator + Task Queue + Rate Limiting + Monitoring)
    |
    v
Python Workers
    ├── AdsPower Client (browser profiles + proxy binding)
    ├── Browser-Use Agent (DOM + LLM via CDP)
    ├── LLM Router (LiteLLM: Sonnet → GPT-4.1 mini → GPT-4.1 nano)
    └── noVNC (human takeover when CAPTCHA detected)

Data: PostgreSQL (shared: app + Hatchet state) + Redis (optional: WebSocket relay)
```

**Core innovation: 3-layer interaction strategy**

1. **Extension Content Script** (LinkedIn, Greenhouse) -- DOM selectors, zero detection risk
2. **Patchright / CDP** (Workday) -- closed shadow DOM access, stealth patches
3. **Vision LLM Fallback** (unknown ATS) -- screenshot analysis, element detection via `elementFromPoint()`

---

## LLM Cost Model (Refined)

### Model Routing Strategy

| Task Type                                               | Model             | Cost/1M tokens |
| ------------------------------------------------------- | ----------------- | -------------- |
| Complex (form analysis, answer generation, screenshots) | Claude Sonnet 4.5 | $3/$15         |
| Routine (field mapping, error recovery)                 | GPT-4.1 mini      | $0.40/$1.60    |
| Trivial (confirmations, navigation)                     | GPT-4.1 nano      | $0.10/$0.40    |

### Per-Application Cost

| Strategy                 | Cost/App   | Monthly (100/day) |
| ------------------------ | ---------- | ----------------- |
| All Sonnet (MVP Phase 1) | $0.045     | $135              |
| **Routed (recommended)** | **$0.021** | **$63**           |
| With prompt caching      | $0.008     | $24               |
| With batch API + caching | $0.005     | $15               |

### Updated Total COGS Per Application

| Component           |       Cost |
| ------------------- | ---------: |
| Cloud VM (3 min)    |     $0.008 |
| AdsPower license    |      $0.01 |
| Residential proxy   |      $0.02 |
| LLM tokens (routed) | **$0.021** |
| Storage             |     $0.005 |
| **Total**           | **$0.064** |

_Down from $0.10-0.20 in Round 1 estimate, primarily due to model routing optimization._

---

## MVP Scope (LinkedIn Easy Apply Only)

| Feature                                  | Included  |
| ---------------------------------------- | :-------: |
| Paste job URL → auto-apply               |    Yes    |
| Resume upload + LLM parsing              |    Yes    |
| Screening question bank (pre-answers)    |    Yes    |
| LLM-powered form filling                 |    Yes    |
| Real-time progress dashboard (WebSocket) |    Yes    |
| CAPTCHA detection + noVNC takeover       |    Yes    |
| Application tracking dashboard           |    Yes    |
| Browser extension button                 | No (v1.1) |
| Greenhouse / Lever support               | No (v1.2) |
| Gmail OAuth integration                  | No (v1.1) |
| Bulk URL submission                      | No (v1.1) |

**Estimated development time:** ~12 weeks

---

## Platform Strategy

| Platform            | Difficulty | Interaction Approach                                      | MVP Priority |
| ------------------- | :--------: | --------------------------------------------------------- | :----------: |
| LinkedIn Easy Apply |   3.5/5    | Extension content script + DOM selectors                  |   **MVP**    |
| Greenhouse          |   1.8/5    | Extension content script + iframe `all_frames`            |   Phase 1    |
| Lever               |   1.3/5    | Extension or Playwright (standard DOM)                    |   Phase 1    |
| Workday             |   4.8/5    | Patchright (closed shadow DOM) or `chrome.dom` API        |   Phase 3    |
| Unknown ATS         |  Variable  | Hybrid: accessibility tree → cached LLM → vision fallback |   Phase 3    |

---

## Top 5 Risks (Updated with Legal Research)

| #   | Risk                            | Severity | Key Finding                                                                                                                                                                     |
| --- | ------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **LinkedIn TOS / legal action** | CRITICAL | Proxycurl was sued and shut down (2025). LinkedIn actively litigates. Mitigation: Copilot model (user-initiated), UETA "electronic agent" framework, aggressive self-throttling |
| 2   | **Account bans**                |   HIGH   | Safe limits: 20 connections/day, 5-7s between actions, 2-week warmup for new accounts. AdsPower + residential proxy + content script stealth                                    |
| 3   | **Bot detection**               |   HIGH   | Extension content scripts are undetectable by web code. CDP has detection vectors (`navigator.webdriver`, `__playwright__binding__`). Use Patchright for CDP tasks              |
| 4   | **LLM hallucination**           |  MEDIUM  | Model routing: use Sonnet for critical decisions, cheaper models for routine. Confidence scoring + user Q&A bank as ground truth                                                |
| 5   | **Platform UI changes**         |  MEDIUM  | Stagehand-style caching: LLM analyzes once, caches selector mappings, self-heals on failure                                                                                     |

---

## Key Differentiators vs. Competition

| Us (WeKruit Copilot)                        | LazyApply / Sonara / Massive        |
| ------------------------------------------- | ----------------------------------- |
| Copilot: user stays in control              | Autopilot: spray and pray           |
| LLM-powered intelligent filling             | Template-based generic answers      |
| Human takeover for edge cases               | Fail silently or skip               |
| Extension-based (invisible to detection)    | Client-side automation (detectable) |
| 3-tier model routing (cost-efficient)       | Single model or no AI               |
| Full transparency (screenshots, confidence) | Black box                           |
| Hatchet durable workflows (crash-resistant) | Simple task queues                  |

---

## Research Documents

### Round 1: Foundation Research

| File                            | Contents                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `01_platform_analysis.md`       | 8 ATS platforms: flows, CAPTCHA, anti-bot, selectors, rate limits             |
| `02_opensource_tools.md`        | Tool comparison with live GitHub data (Browser-Use, Stagehand, Skyvern, etc.) |
| `03_architecture_design.md`     | System architecture, state machines, data model, scaling, security            |
| `04_product_requirements.md`    | PRD, user flows, competitive analysis, MVP, pricing, risk matrix              |
| `05_claude_code_team_prompt.md` | Ready-to-use prompt for 5-agent implementation team                           |

### Round 2: Deep Research

| File                                 | Contents                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `06_orchestration_frameworks.md`     | LangGraph vs Temporal vs CrewAI vs Hatchet. Winner: Hatchet (MVP) + Temporal (scale)                         |
| `07_browser_interaction_research.md` | DOM vs Vision vs Hybrid. Shadow DOM strategies. Extension vs CDP vs OS-level. Platform-specific approaches   |
| `08_llm_model_comparison.md`         | 15+ models benchmarked. Claude Sonnet 4.5 primary + GPT-4.1 mini secondary. Cost per application analysis    |
| `09_task_orchestration_research.md`  | Hatchet vs Temporal vs Celery with code examples. Inter-process comms. Rate limiting. Monitoring stack       |
| `10_safety_legal_architecture.md`    | Legal framework (UETA, CFAA, Proxycurl case). Error handling matrix (27 scenarios). Configuration management |

---

## Next Steps

1. **Architecture review** -- Walk through revised stack (Hatchet + model routing + extension interaction)
2. **Spike: AdsPower + Browser-Use CDP** -- Validate core integration
3. **Spike: Extension content script on LinkedIn** -- Test form filling via content script
4. **Spike: Hatchet workflow** -- Build pause/resume CAPTCHA flow
5. **MVP build** -- 12-week execution plan
