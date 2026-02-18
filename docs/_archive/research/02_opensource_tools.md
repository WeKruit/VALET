# Open Source Tools & Technology Research

> **Last Updated:** 2026-02-10 (with live GitHub data)

---

## 1. Browser Automation + AI Agent Frameworks

### Comparison Matrix (Live GitHub Data as of 2026-02-10)

| Tool                                                          |  Stars | Forks | License    | Language   | Last Push  | Best For                                   |
| ------------------------------------------------------------- | -----: | ----: | ---------- | ---------- | ---------- | ------------------------------------------ |
| **[Browser-Use](https://github.com/browser-use/browser-use)** | 78,145 | 9,248 | MIT        | Python     | 2026-02-10 | LLM-native browser control, form filling   |
| **[Stagehand](https://github.com/browserbase/stagehand)**     | 21,018 | 1,366 | MIT        | TypeScript | 2026-02-10 | NL + Playwright extension, self-healing    |
| **[Skyvern](https://github.com/Skyvern-AI/skyvern)**          | 20,359 | 1,806 | AGPL-3.0   | Python     | 2026-02-10 | Enterprise workflows, visual understanding |
| **[LaVague](https://github.com/lavague-ai/LaVague)**          |  6,296 |   582 | Apache-2.0 | Python     | 2025-01-21 | AI web agents (appears stale)              |
| **Playwright**                                                |   72K+ |     - | Apache-2.0 | TypeScript | Active     | Low-level browser automation               |
| **Puppeteer**                                                 |   89K+ |     - | Apache-2.0 | TypeScript | Active     | Headless Chrome automation                 |

### Detailed Analysis

#### Browser-Use (Recommended for this project)

- **Approach:** LLM + DOM manipulation via Playwright
- **Key Feature:** Accepts CDP URL to connect to existing browsers (critical for AdsPower integration)
- **How it works:** Takes screenshot + extracts DOM accessibility tree → sends to LLM → LLM returns structured action → executes via Playwright
- **WebVoyager benchmark:** 89.1%
- **Strengths:**
  - MIT license, massive community (78K stars)
  - Native CDP connection support → plug directly into AdsPower
  - Vision + DOM hybrid approach
  - BYO LLM (OpenAI, Anthropic, Ollama)
  - Python ecosystem (integrates with Celery backend)
- **Weaknesses:**
  - No built-in CAPTCHA solving
  - No built-in 2FA handling
  - Each decision = LLM API call (cost adds up)
- **Integration pattern:**

```python
from browser_use import Agent, Browser, BrowserConfig
browser = Browser(config=BrowserConfig(cdp_url="ws://127.0.0.1:9222/..."))
agent = Agent(task="Fill job application", llm=llm, browser=browser, use_vision=True)
```

#### Stagehand (Alternative option)

- **Approach:** Natural language + Playwright extension with 3 core methods: `act()`, `extract()`, `observe()`
- **Key Feature:** Self-healing + auto-caching - learns site interactions, caches them, re-invokes AI only when layout changes
- **Strengths:** TypeScript (matches your extension stack), MIT license, Browserbase cloud option
- **Weaknesses:** No 2FA/CAPTCHA, no multi-step orchestration built-in, requires Browserbase for cloud
- **Best if:** You want to stay in TypeScript ecosystem

#### Skyvern (Enterprise alternative)

- **Approach:** Computer vision + LLM, works on unseen websites without customization
- **Key Feature:** Built-in CAPTCHA solving, 2FA handling, proxy networks
- **Strengths:** Enterprise-ready, works without per-site customization
- **Weaknesses:** AGPL-3.0 license (copyleft), heavier resource usage
- **Best if:** You want maximum out-of-box automation with less custom code

#### LaVague (Not recommended)

- **Last push:** January 2025 (14 months stale)
- **Status:** Appears abandoned or in maintenance mode
- **Skip this** in favor of Browser-Use or Stagehand

### Recommendation: **Browser-Use**

- Largest community, most active development
- MIT license (no copyleft concerns)
- Native CDP support for AdsPower integration
- Python backend aligns with Celery/FastAPI stack
- Vision + DOM hybrid is ideal for varied ATS forms

---

## 2. LLM + RPA Hybrid Frameworks

### The Hybrid Pattern

No single existing framework perfectly implements RPA + LLM hybrid. The recommended approach is to **build a thin orchestration layer** combining:

| Component           | Tool                         | Purpose                                         |
| ------------------- | ---------------------------- | ----------------------------------------------- |
| RPA actions         | Playwright (via Browser-Use) | Deterministic clicks, fills, uploads            |
| LLM decisions       | GPT-4o / Claude Sonnet       | Form analysis, answer generation, field mapping |
| Workflow definition | Custom YAML templates        | Platform-specific step sequences                |
| Orchestration       | Custom Python state machine  | Mode switching between RPA and Agent            |

### Existing Approaches Found

1. **Browser-Use itself** - Already supports mixing deterministic Playwright actions with LLM-guided steps
2. **Skyvern Workflow Engine** - Defines multi-step workflows with LLM decision points
3. **n8n + AI nodes** - Low-code workflow automation with LLM integration (but not browser-native)
4. **Langchain + Playwright Tools** - Custom agent with browser tools, but requires significant glue code

### Recommended Architecture: Hybrid Execution Engine

```
Workflow Template (YAML) defines steps:
  Step 1: RPA_CLICK "Easy Apply" button  (deterministic)
  Step 2: RPA_FILL contact info          (deterministic, user data)
  Step 3: RPA_UPLOAD resume              (deterministic)
  Step 4: AGENT_FILL_FORM screening Qs   (LLM analyzes, decides)
  Step 5: RPA_CLICK "Submit"             (deterministic)

Engine behavior:
  - RPA steps: Execute directly via Playwright, fast + cheap
  - AGENT steps: Invoke Browser-Use with LLM, slower + costs tokens
  - On RPA failure: Fall back to AGENT mode for that step
  - On AGENT confusion: Escalate to HUMAN_TAKEOVER
```

---

## 3. Anti-Detect Browsers & Fingerprint Management

### Comparison

| Tool                        | Type       | CDP Support |      API       | Pricing   | Proxy Mgmt |
| --------------------------- | ---------- | :---------: | :------------: | --------- | :--------: |
| **AdsPower**                | Commercial |     Yes     | Local REST API | $9-50/mo  |  Built-in  |
| **GoLogin**                 | Commercial |     Yes     |    REST API    | $24-49/mo |  Built-in  |
| **Multilogin**              | Commercial |     Yes     |    REST API    | $99+/mo   |  Built-in  |
| **puppeteer-extra-stealth** | OSS plugin |     N/A     |      N/A       | Free      |     No     |
| **undetected-chromedriver** | OSS        |   Limited   |      N/A       | Free      |     No     |

### AdsPower (Recommended)

**Why AdsPower:**

- **MCP Server available** - AdsPower now has an [official MCP server](https://www.adspower.com/blog/adspower-local-api-mcp-server) that connects AI tools (Claude) to automate browser management
- Local API on port 50325 for programmatic control
- CDP WebSocket URL returned on browser start → direct Playwright/Browser-Use connection
- Built-in proxy binding per profile (IP stickiness)
- Fingerprint management: canvas, WebGL, audio, fonts, timezone, user-agent
- Supports Chrome up to v140 (as of Sept 2025)
- Team plans support 10-100+ profiles

**Key API endpoints:**

```
POST /api/v1/browser/start  → returns CDP ws:// URL
POST /api/v1/browser/stop
POST /api/v1/user/create    → create profile with fingerprint + proxy
POST /api/v1/user/update    → update proxy settings
GET  /api/v1/browser/active → check running browsers
```

**Python integration libraries:**

- [`adspower` PyPI package](https://pypi.org/project/adspower/) - Selenium + Playwright support
- [`CrocoFactory/adspower`](https://github.com/CrocoFactory/adspower) - API wrapper

### Open Source Alternatives

**puppeteer-extra-plugin-stealth:** Patches common detection vectors (navigator.webdriver, chrome.runtime, etc.) but doesn't manage full fingerprints. Good for basic evasion, not sufficient for LinkedIn-level detection.

**undetected-chromedriver:** Patches ChromeDriver to avoid detection. Single-profile, no fingerprint management. Insufficient for multi-account operations.

**Verdict:** For production multi-account automation, commercial anti-detect browsers (AdsPower) are necessary. OSS solutions are insufficient against sophisticated detection.

---

## 4. Sandbox & Isolation Solutions

### Comparison (Live GitHub Data)

| Tool                                                       |  Stars | License    | Language | Purpose                                       |
| ---------------------------------------------------------- | -----: | ---------- | -------- | --------------------------------------------- |
| **[OpenHands](https://github.com/All-Hands-AI/OpenHands)** | 67,715 | Custom     | Python   | AI-driven development in sandboxed containers |
| **[E2B](https://github.com/e2b-dev/E2B)**                  | 10,840 | Apache-2.0 | MDX      | Cloud sandboxes for AI agents                 |
| **Docker**                                                 |    N/A | Apache-2.0 | Go       | Container isolation                           |

### OpenHands (Reference Architecture)

OpenHands sessions run inside Docker containers with full OS capabilities isolated from host. Key features relevant to our use case:

- **BrowserGym interface** for browser automation via declarative primitives
- **Persistent Chromium browser** for human inspection and control
- **REST/WebSocket server** for remote execution
- **CORS support** (v1.3.0, Feb 2026) for remote browser access
- **Daytona integration** for secure sandbox runtime

**How to apply to our system:**

- Use OpenHands' Docker container model as reference for isolating each browser worker
- Each worker = Docker container with AdsPower + Agent process
- Leverage BrowserGym patterns for structured browser interactions
- Use the CORS/WebSocket patterns for remote noVNC access

### E2B (Cloud Sandboxes)

- Provides cloud sandboxes with API access
- Sandboxes include filesystem, network, and process isolation
- Good for running untrusted code, but overkill for browser automation
- **Better fit:** Development/testing phase, not production browser workers

### Recommended: Docker-Based Isolation

For production, use simple Docker Compose per worker:

```yaml
services:
  adspower:
    image: adspower/adspower:latest
    privileged: true
    ports: ["50325:50325", "5900:5900", "6080:6080"]
    volumes: [adspower_data:/root/.adspower]
  agent:
    build: ./agent
    depends_on: [adspower]
    environment:
      ADSPOWER_API_URL: http://adspower:50325
      REDIS_URL: redis://redis:6379
```

---

## 5. Remote Desktop / Human Takeover Solutions

### Comparison (Live GitHub Data)

| Tool                                                               |  Stars | Purpose                   | Latency   | Setup  |
| ------------------------------------------------------------------ | -----: | ------------------------- | --------- | ------ |
| **[noVNC](https://github.com/novnc/noVNC)**                        | 13,410 | Web-based VNC client      | 100-300ms | Low    |
| **[Apache Guacamole](https://github.com/apache/guacamole-server)** |  3,698 | Clientless remote desktop | 100-200ms | Medium |
| **WebRTC**                                                         |    N/A | Real-time media streaming | 30-100ms  | High   |

### noVNC (Recommended for MVP)

- **Zero install** - runs in any browser via JavaScript
- Connects to VNC server (Xvfb + x11vnc) running alongside AdsPower
- Secure WebSocket connection with JWT token authentication
- Mature library (13K+ stars), well-documented

**Integration pattern:**

1. AdsPower browser runs on Xvfb virtual display (:99)
2. x11vnc captures display and exposes VNC on port 5900
3. websockify proxies VNC to WebSocket on port 6080
4. noVNC JavaScript client connects from user's dashboard

### Apache Guacamole (v2.0 option)

- Supports VNC, RDP, SSH protocols
- Built-in authentication and session management
- More enterprise-grade than raw noVNC
- Higher setup complexity (Java server + database)

### WebRTC (v2.0+ option for low latency)

- 30-100ms latency (vs 100-300ms for VNC)
- VP8/VP9/H.264 encoding = lower bandwidth
- Requires STUN/TURN server infrastructure
- Custom implementation needed for input forwarding

### Recommendation: **noVNC for MVP**, upgrade to WebRTC if users complain about latency.

---

## 6. Proxy Management

### Provider Comparison

| Provider       | Residential IPs | Pricing   | Sticky Sessions | API  |
| -------------- | :-------------: | --------- | :-------------: | :--: |
| **IPRoyal**    | 195+ countries  | $7/GB     | Yes (up to 24h) | REST |
| **BrightData** | 195+ countries  | $10-15/GB |       Yes       | REST |
| **Oxylabs**    | 195+ countries  | $10/GB    |       Yes       | REST |
| **SmartProxy** | 195+ countries  | $8.5/GB   |       Yes       | REST |

### Recommendation: **IPRoyal**

- Best price/performance for residential proxies ($7/GB)
- Sticky sessions up to 24 hours (critical for consistent browser fingerprint + IP binding)
- SOCKS5 and HTTP proxy support
- Country/city targeting
- API for programmatic session management

### Proxy Binding Strategy

```
One User → One Platform Account → One AdsPower Profile → One Sticky IP

user_123 + LinkedIn → profile_abc → 203.0.113.42 (IPRoyal US residential)
user_123 + Greenhouse → profile_def → 203.0.113.99 (different IP, same user)
```

- Each AdsPower profile has proxy configured at creation time
- Sticky session ensures same IP across multiple uses
- Session duration: 24 hours minimum, renewed on each use
- Geographic consistency: US IP for US job applications

---

## 7. Gmail / Email Automation

### Gmail MCP Servers (Multiple Available)

| Server                                                                              |  Stars | Features                              |
| ----------------------------------------------------------------------------------- | -----: | ------------------------------------- |
| **[GongRzhe/Gmail-MCP-Server](https://github.com/GongRzhe/Gmail-MCP-Server)**       | Active | Auto-auth, Claude Desktop integration |
| **[jeremyjordan/mcp-gmail](https://github.com/jeremyjordan/mcp-gmail)**             | Active | Python SDK, clean API                 |
| **[Shravan1610/Gmail-mcp-server](https://github.com/Shravan1610/Gmail-mcp-server)** | Active | Full OAuth 2.0, attachments           |

### OAuth 2.0 Flow

1. First run: Server initiates OAuth flow → browser window opens
2. User logs into Google account, grants permissions
3. Google provides access token (stored securely)
4. Subsequent runs use stored token, auto-refresh when expired

### Required OAuth Scopes

| Scope            | Purpose                            | Sensitivity |
| ---------------- | ---------------------------------- | ----------- |
| `gmail.readonly` | Read verification emails           | High        |
| `gmail.modify`   | Mark emails as read, manage labels | Medium      |
| `gmail.labels`   | Create "WeKruit" label             | Low         |

**NOT needed:** `gmail.send`, `gmail.compose`, `gmail.full`

### Google API Verification Requirements

For production apps accessing Gmail:

| Requirement                                 | Timeline                |
| ------------------------------------------- | ----------------------- |
| OAuth consent screen with clear description | Day 1                   |
| Published privacy policy                    | Day 1                   |
| Google security review (sensitive scopes)   | 4-6 weeks               |
| CASA Tier 2 assessment                      | Part of security review |
| Annual re-verification                      | Ongoing                 |

### Phased Approach

| Phase | Method                                        | Why                          |
| ----- | --------------------------------------------- | ---------------------------- |
| MVP   | Webhook-based email forwarding (no OAuth)     | Fastest, no Google review    |
| v1.1  | Gmail OAuth with `gmail.readonly`             | Better UX, needs review      |
| v2.0  | Gmail MCP Server for LLM-native email reading | Premium, intelligent parsing |

---

## 8. Recommended Tech Stack Summary

### Core Stack

| Layer                   | Technology                              | Why                                  |
| ----------------------- | --------------------------------------- | ------------------------------------ |
| **Browser Automation**  | Browser-Use + Playwright                | LLM-native, CDP support, 78K stars   |
| **Anti-Detect Browser** | AdsPower (Local API + MCP)              | Industry standard, profile isolation |
| **LLM**                 | Claude Sonnet / GPT-4o                  | Vision + structured output for forms |
| **Task Queue**          | Celery + Redis                          | Battle-tested async processing       |
| **Backend API**         | FastAPI                                 | Modern Python, WebSocket support     |
| **Human Takeover**      | noVNC (Xvfb + x11vnc + websockify)      | Zero-install, 13K stars              |
| **Proxy**               | IPRoyal residential                     | $7/GB, 24h sticky sessions           |
| **Database**            | PostgreSQL                              | Relational integrity, RLS            |
| **Cache/Broker**        | Redis                                   | Celery broker + rate limiting        |
| **Email Verification**  | Gmail MCP Server (v2.0) / Webhook (MVP) | LLM-native email access              |
| **Container**           | Docker Compose → Kubernetes             | Per-worker isolation                 |
| **Monitoring**          | Prometheus + Grafana                    | Industry standard                    |

### Decision Matrix: Why These Choices

| Decision       | Chosen        | Runner-up    | Reason                                           |
| -------------- | ------------- | ------------ | ------------------------------------------------ |
| Browser agent  | Browser-Use   | Stagehand    | Python backend, CDP native, larger community     |
| Anti-detect    | AdsPower      | GoLogin      | Better API, MCP server, lower price              |
| LLM            | Claude Sonnet | GPT-4o       | Better structured output, vision quality similar |
| Task queue     | Celery        | BullMQ       | Python ecosystem, Celery is battle-tested        |
| Remote desktop | noVNC         | Guacamole    | Simpler setup, sufficient for MVP                |
| Proxy          | IPRoyal       | BrightData   | 30% cheaper, comparable quality                  |
| Email          | Gmail MCP     | IMAP polling | LLM-native, smarter parsing                      |

---

## Sources

- [Browser-Use GitHub](https://github.com/browser-use/browser-use)
- [Skyvern GitHub](https://github.com/Skyvern-AI/skyvern)
- [Stagehand GitHub](https://github.com/browserbase/stagehand)
- [OpenHands GitHub](https://github.com/All-Hands-AI/OpenHands)
- [E2B GitHub](https://github.com/e2b-dev/E2B)
- [noVNC GitHub](https://github.com/novnc/noVNC)
- [AdsPower Local API Docs](https://localapi-doc-en.adspower.com/docs/Rdw7Iu)
- [AdsPower MCP Server](https://www.adspower.com/blog/adspower-local-api-mcp-server)
- [Gmail MCP Server](https://github.com/GongRzhe/Gmail-MCP-Server)
- [Best Open Source Web Agents 2026](https://aimultiple.com/open-source-web-agents)
- [Browser-Use vs Browserbase Comparison](https://www.skyvern.com/blog/browser-use-vs-browserbase-comparison-reviews-and-alternatives/)
- [OpenHands v1.3.0 Release](https://github.com/OpenHands/OpenHands/releases/tag/1.3.0)
