# LLM Model Research: Browser Automation & Job Application Form Filling

**Date**: February 2026
**Purpose**: Determine optimal LLM models for AI agents that fill job applications in web browsers
**Context**: System uses Browser-Use / CDP to control AdsPower browser instances, filling LinkedIn Easy Apply and other ATS forms

---

## Table of Contents

1. [Browser/Web Agent Benchmarks](#1-browserweb-agent-benchmarks)
2. [Model Comparison for Browser Tasks](#2-model-comparison-for-browser-tasks)
3. [Cost Analysis for Our Use Case](#3-cost-analysis-for-our-use-case)
4. [Specialized Models for GUI/Web Tasks](#4-specialized-models-for-guiweb-tasks)
5. [Model Routing Strategy](#5-model-routing-strategy)
6. [Anthropic Computer Use Deep Dive](#6-anthropic-computer-use-deep-dive)
7. [Final Recommendation](#7-final-recommendation)

---

## 1. Browser/Web Agent Benchmarks

### 1.1 WebVoyager Benchmark

**What it tests**: 643 real-world web navigation tasks across 15 live websites (Amazon, Apple, Google Flights, Booking, GitHub, ArXiv, etc.)

| Agent / Model                     | Success Rate | Notes                                         |
| --------------------------------- | ------------ | --------------------------------------------- |
| **Magnitude** (2025)              | **93.9%**    | Current SOTA; beats all other browser agents  |
| **Surfer-H** (2025)               | **92.2%**    | $0.13/task average cost                       |
| **Browser-Use** (with best model) | **89.1%**    | After removing 55 outdated tasks              |
| **OpenAI Operator (CUA)**         | **87.0%**    | Uses GPT-4o + reinforcement learning          |
| **Browserable**                   | **90.4%**    | Across 567 web tasks                          |
| **Agent-E** (Emergence AI)        | **73.2%**    | Text-only DOM approach; 25 LLM calls/task avg |
| **WebVoyager baseline** (GPT-4V)  | ~55%         | Original 2024 paper                           |

**Key insight**: Vision-grounded multimodal models significantly outperform text-only DOM-based approaches. Chain-of-thought reasoning enables smaller models to close the gap with frontier models.

### 1.2 WebArena Benchmark

**What it tests**: 812 tasks on self-hosted websites (shopping, forums, CMS, GitLab). Tests realistic multi-step workflows.

| Agent / Model                | Success Rate | Notes                                     |
| ---------------------------- | ------------ | ----------------------------------------- |
| **IBM CUGA**                 | **~61.7%**   | Highest known performance                 |
| **OpenAI Operator (CUA)**    | **58.1%**    | GPT-4o based CUA model                    |
| **Gemini 2.5 Pro**           | **54.8%**    | Strong baseline without agentic framework |
| **Claude 3.7 + Agent S2**    | ~34.5%       | With 50 steps                             |
| **WebChoreArena** (extended) | 37.8%        | More tedious tasks; top LLMs only         |
| **2023 baseline**            | ~14%         | Two years ago                             |

**Key insight**: In two years, AI agents leaped from 14% to ~60% success rate. Agentic frameworks with planning and retry logic dramatically boost raw model performance.

### 1.3 OSWorld Benchmark (Desktop/GUI Tasks)

**What it tests**: Open-ended tasks in real computer environments (site navigation, spreadsheet entry, desktop operations). Human baseline: ~72%.

| Agent / Model             | Success Rate | Steps | Notes                                    |
| ------------------------- | ------------ | ----- | ---------------------------------------- |
| **OSAgent** (Oct 2025)    | **76.26%**   | -     | Surpasses human baseline                 |
| **Claude Opus 4.6**       | **72.7%**    | -     | Best single-model performance (Feb 2026) |
| **CoACT-1**               | **60.76%**   | -     | 84.4% of human capability                |
| **Claude Sonnet 4.5**     | **61.4%**    | -     | Major leap from Sonnet 4 (42.2%)         |
| **UI-TARS-1.5**           | **42.5%**    | 100   | Open-source; beats Operator (36.4%)      |
| **OpenAI Operator (CUA)** | **38.1%**    | -     | GPT-4o based                             |
| **Claude 3.7**            | **28.0%**    | 100   | Feb 2025 release                         |
| **UI-TARS-1.5**           | **24.6%**    | 50    | With fewer steps                         |

**Key insight**: Claude models dominate this benchmark. Opus 4.6 at 72.7% essentially matches human performance. The gap between Anthropic and other providers is significant for desktop/GUI tasks.

### 1.4 VisualWebArena Benchmark

**What it tests**: 910 tasks requiring image+text comprehension, spatial reasoning on visual web interfaces (Classifieds, Shopping, Reddit).

| Model                    | Success Rate | Notes                        |
| ------------------------ | ------------ | ---------------------------- |
| **GPT-4o**               | **19.78%**   | Best performer               |
| **GPT-4V**               | 16.37%       | Previous generation          |
| **Llama-3-70B-Instruct** | 9.78%        | Open source baseline         |
| **SoM representation**   | +3-5%        | Visual grounding improvement |

**Key insight**: Even top models only achieve ~20% success. This benchmark highlights that fine-grained visual understanding (OCR, spatial reasoning) remains challenging. GPT-4o leads on vision-heavy tasks.

### 1.5 Mind2Web / Online-Mind2Web

**What it tests**: 300 diverse tasks across 136 live websites. Tests real web interaction with cookies, pop-ups, changing layouts.

| Agent / Model               | Success Rate   | Notes                                             |
| --------------------------- | -------------- | ------------------------------------------------- |
| **Claude Computer Use 3.7** | Best performer | Anthropic 2025                                    |
| **OpenAI Operator**         | **61%**        | Only agent besides Claude that outperforms SeeAct |
| **Enhans ACT-1**            | 2nd overall    | DOM-based; adapts to layout changes               |
| **Most recent agents**      | < SeeAct       | Many 2025 agents underperform 2024 SeeAct         |

**Key insight**: Many recent agents surprisingly underperform the simpler SeeAct agent from early 2024. Only Claude Computer Use and OpenAI Operator consistently beat it, suggesting that raw model capability matters more than complex framework engineering for live web tasks.

### 1.6 SWE-bench Verified (Code Agent Performance)

**What it tests**: Real GitHub issue resolution. Tangentially relevant as it measures agentic capability and code understanding.

| Model                    | Score     | Notes                       |
| ------------------------ | --------- | --------------------------- |
| **Claude Opus 4.6**      | **80.8%** | Feb 2026, latest            |
| **Claude Sonnet 4.5**    | **77.2%** | 82.0% with parallel compute |
| **Gemini 3 Pro Preview** | ~63.8%    | Custom agent setup          |
| **Qwen3-Coder**          | **69.6%** | Open source                 |
| **GPT-4.1**              | **54.6%** | vs GPT-4o at 33.2%          |

### 1.7 BrowseComp (Browsing Agents)

| Model                      | Accuracy  | Notes                       |
| -------------------------- | --------- | --------------------------- |
| **Claude Opus 4.6**        | **84.0%** | Industry-leading            |
| **GPT-4o (with browsing)** | 1.9%      | Browsing alone insufficient |
| **GPT-4o (no browsing)**   | 0.6%      | Near-zero                   |

### 1.8 ScreenSpot (GUI Element Grounding)

| Model                          | Accuracy       | Notes                      |
| ------------------------------ | -------------- | -------------------------- |
| **UI-TARS-1.5**                | **94.2%** (V2) | Best in class              |
| **Operator (CUA)**             | 87.9%          |                            |
| **Claude 3.7**                 | 87.6%          |                            |
| **ScreenSpotPro**: UI-TARS-1.5 | **61.6%**      | vs Claude 27.7%, CUA 23.4% |

---

## 2. Model Comparison for Browser Tasks

### 2.1 Comprehensive Model Matrix

| Model                       | Vision             | Structured Output | Latency (TTFT) | Input $/1M | Output $/1M | Context Window | Tool Use  | Browser Perf                  |
| --------------------------- | ------------------ | ----------------- | -------------- | ---------- | ----------- | -------------- | --------- | ----------------------------- |
| **Claude Opus 4.6**         | Excellent          | Excellent         | ~3s            | $5.00      | $25.00      | 1M tokens      | Excellent | **Best** (72.7% OSWorld)      |
| **Claude Sonnet 4.5**       | Excellent          | Excellent         | ~1.8s          | $3.00      | $15.00      | 200K (1M beta) | Excellent | **Excellent** (61.4% OSWorld) |
| **Claude Haiku 4.5**        | Good               | Good              | <1s            | $1.00      | $5.00       | 200K           | Good      | Good (50.7% OSWorld est.)     |
| **GPT-4o**                  | Excellent          | Excellent         | ~1.5s          | $2.50      | $10.00      | 128K           | Excellent | Good (38.1% OSWorld via CUA)  |
| **GPT-4.1**                 | Good               | **Best**          | ~1.5s          | $2.00      | $8.00       | 1M tokens      | **Best**  | Good (agentic focus)          |
| **GPT-4.1 mini**            | Good               | Good              | <1s            | $0.40      | $1.60       | 1M tokens      | Good      | Decent                        |
| **GPT-4.1 nano**            | Limited            | Decent            | <0.5s          | $0.10      | $0.40       | 1M tokens      | Basic     | Limited                       |
| **GPT-4o mini**             | Good               | Good              | <1s            | $0.15      | $0.60       | 128K           | Good      | Decent                        |
| **Gemini 2.5 Pro**          | Excellent          | Good              | ~2s            | $1.25      | $10.00      | 1M tokens      | Good      | Good (54.8% WebArena)         |
| **Gemini 2.5 Flash**        | Good               | Good              | <1s            | $0.30      | $2.50       | 1M tokens      | Good      | Decent (35%+ on hard tasks)   |
| **Gemini 2.5 Flash-Lite**   | Basic              | Basic             | <0.5s          | $0.10      | $0.40       | 1M tokens      | Basic     | Limited                       |
| **Gemini 2.5 Computer Use** | Excellent          | Good              | ~2s            | ~$1.25     | ~$10.00     | 1M tokens      | Good      | Good (preview)                |
| **UI-TARS-1.5 7B**          | **Best grounding** | Good              | ~1-3s\*        | Self-host  | Self-host   | 32K            | Limited   | **42.5% OSWorld**             |
| **Qwen 2.5 VL 72B**         | Good               | Good              | ~2s\*          | ~$0.60\*\* | ~$0.60\*\*  | 128K           | Decent    | Untested                      |
| **DeepSeek V3**             | Text only          | Good              | ~1.5s          | $0.27      | $1.10       | 128K           | Good      | Limited (no vision)           |
| **DeepSeek R1**             | Text only          | Good              | ~3-10s         | $0.55      | $2.19       | 128K           | Good      | Limited (no vision)           |
| **Llama 4 Maverick**        | Good               | Decent            | ~2s\*          | Self-host  | Self-host   | 1M tokens      | Decent    | Untested                      |
| **Llama 4 Scout**           | Good               | Decent            | ~1s\*          | Self-host  | Self-host   | 10M tokens     | Decent    | Untested                      |
| **CogAgent**                | Good               | Good              | ~2s\*          | Self-host  | Self-host   | ~4K            | Limited   | Good (GUI specialist)         |
| **ShowUI 2B**               | Good grounding     | Decent            | <1s\*          | Self-host  | Self-host   | ~4K            | Limited   | Good (lightweight)            |

\*Self-hosted latency depends on hardware
\*\*Third-party API pricing (Hyperbolic, DeepInfra, etc.)

### 2.2 Detailed Model Notes

#### Claude Sonnet 4.5 (Recommended Primary)

- **Best-in-class for browser automation**: 61.4% OSWorld, strong on all web benchmarks
- Native Computer Use capability: screenshot -> action coordinates
- Excellent structured output (JSON mode, tool use)
- 200K context window (1M in beta) handles large DOM snapshots
- Prompt caching reduces repeat costs by 90%
- Median output speed: 63 tokens/second, 1.8s to first response

#### GPT-4o / GPT-4.1

- GPT-4o: Best multimodal vision (19.78% VisualWebArena leader)
- GPT-4.1: Better instruction following, 1M context, 54.6% SWE-bench
- GPT-4.1 excels at structured/agentic setups with function calling
- CUA (Operator) achieves 87% WebVoyager, 58.1% WebArena
- GPT-4.1 mini is an excellent cost-effective option at $0.40/$1.60

#### Gemini 2.5 Pro / Flash

- Gemini 2.5 Pro: 54.8% WebArena, strong reasoning (91.9% GPQA Diamond)
- Gemini 2.5 Flash: Best cost/performance ratio for simple tasks
- Gemini 2.5 Computer Use model (Oct 2025): screenshot -> UI actions, similar to Claude Computer Use
- 1M token context window standard across all Gemini models
- Flash-Lite at $0.10/$0.40 is extremely cost-effective for simple routing

#### UI-TARS-1.5 7B (Specialized)

- **Best GUI element grounding**: 94.2% ScreenSpot-V2, 61.6% ScreenSpotPro
- Open-source, self-hostable on a single GPU
- 42.5% OSWorld (100 steps) -- competitive with much larger models
- Ideal for: element detection, bounding box prediction, click target identification
- Limitation: 32K context window, limited general reasoning

#### DeepSeek V3 / R1

- Extremely cost-effective: $0.27/$1.10 per 1M tokens
- V3.2 reportedly matches GPT-5 quality at 10x lower cost
- **Major limitation**: No native vision/multimodal capability
- Could work for DOM-only approaches (text-based element analysis)
- R1 has strong reasoning but high latency (thinking tokens)

---

## 3. Cost Analysis for Our Use Case

### 3.1 Assumptions for LinkedIn Easy Apply

Per application interaction profile:

- **5-10 LLM calls** per application
- Each call: ~1,000 input tokens (DOM snippet/screenshot context) + ~200 output tokens (action/decision)
- Total per application: **~7,500 input tokens + ~1,500 output tokens** (average 7.5 calls)
- Some calls include screenshot analysis (higher token count for vision)

### 3.2 Cost Per Application by Model

#### Premium Tier (High accuracy, complex form analysis)

| Model             | Input Cost | Output Cost | **Total per App** | Notes                                  |
| ----------------- | ---------- | ----------- | ----------------- | -------------------------------------- |
| Claude Opus 4.6   | $0.0375    | $0.0375     | **$0.075**        | Best accuracy, overkill for most tasks |
| Claude Sonnet 4.5 | $0.0225    | $0.0225     | **$0.045**        | Best balance for primary model         |
| GPT-4o            | $0.01875   | $0.015      | **$0.034**        | Strong vision, slightly cheaper        |
| Gemini 2.5 Pro    | $0.009375  | $0.015      | **$0.024**        | Good value, large context              |
| GPT-4.1           | $0.015     | $0.012      | **$0.027**        | Best structured output                 |

#### Mid Tier (Routine checks, simple field mapping)

| Model            | Input Cost | Output Cost | **Total per App** | Notes                  |
| ---------------- | ---------- | ----------- | ----------------- | ---------------------- |
| Claude Haiku 4.5 | $0.0075    | $0.0075     | **$0.015**        | Good quality, fast     |
| GPT-4.1 mini     | $0.003     | $0.0024     | **$0.005**        | Excellent cost/quality |
| GPT-4o mini      | $0.001125  | $0.0009     | **$0.002**        | Cheapest "good" option |
| Gemini 2.5 Flash | $0.00225   | $0.00375    | **$0.006**        | Strong mid-tier        |

#### Budget Tier (High volume, simple tasks)

| Model                 | Input Cost | Output Cost | **Total per App** | Notes                           |
| --------------------- | ---------- | ----------- | ----------------- | ------------------------------- |
| GPT-4.1 nano          | $0.00075   | $0.0006     | **$0.001**        | Ultra-cheap, limited capability |
| Gemini 2.5 Flash-Lite | $0.00075   | $0.0006     | **$0.001**        | Similar to nano                 |
| DeepSeek V3 (API)     | $0.002025  | $0.00165    | **$0.004**        | No vision                       |
| Qwen 2.5 VL 72B (API) | $0.0045    | $0.0009     | **$0.005**        | Third-party API                 |

### 3.3 Cost with Model Routing (Recommended)

**Hybrid approach**: Use expensive model for 2-3 critical calls, cheap model for 5-7 routine calls.

| Routing Strategy          | Critical Calls (2-3) | Routine Calls (5-7) | **Total per App** |
| ------------------------- | -------------------- | ------------------- | ----------------- |
| Sonnet 4.5 + GPT-4.1 mini | ~$0.018              | ~$0.003             | **$0.021**        |
| Sonnet 4.5 + Gemini Flash | ~$0.018              | ~$0.005             | **$0.023**        |
| GPT-4o + GPT-4o mini      | ~$0.014              | ~$0.001             | **$0.015**        |
| Sonnet 4.5 + GPT-4.1 nano | ~$0.018              | ~$0.001             | **$0.019**        |

### 3.4 Volume Cost Projections

At 100 applications/day with the recommended routing (Sonnet 4.5 + GPT-4.1 mini):

| Volume         | Daily Cost | Monthly Cost (30d) | Annual Cost |
| -------------- | ---------- | ------------------ | ----------- |
| 50 apps/day    | $1.05      | $31.50             | $378        |
| 100 apps/day   | $2.10      | $63.00             | $756        |
| 500 apps/day   | $10.50     | $315.00            | $3,780      |
| 1,000 apps/day | $21.00     | $630.00            | $7,560      |

**With Anthropic Batch API (50% discount, 24hr processing)**:

- 100 apps/day: ~$1.05/day = $31.50/month (if latency-tolerant)

**With prompt caching** (up to 90% input cost reduction on repeated prompts):

- 100 apps/day: potentially as low as $0.80/day = $24/month

---

## 4. Specialized Models for GUI/Web Tasks

### 4.1 UI-TARS (ByteDance) -- Most Promising Specialist

**What it is**: An open-source multimodal agent model specifically trained for GUI interaction. The 1.5 version uses reinforcement learning for improved reasoning.

**Key strengths**:

- 94.2% accuracy on ScreenSpot-V2 (GUI element grounding) -- beats Claude (87.6%) and Operator (87.9%)
- 61.6% on ScreenSpotPro -- far ahead of Claude (27.7%) and CUA (23.4%)
- 42.5% on OSWorld (100 steps) -- beats Operator (36.4%)
- Only 7B parameters -- runs on a single consumer GPU
- Open source (Apache 2.0 license)

**Limitations**:

- 32K context window (insufficient for large DOM snapshots)
- Limited general reasoning compared to frontier models
- No strong function calling / structured output support
- Requires self-hosting infrastructure

**Verdict for our use case**: Excellent for element detection and click target identification. Could serve as a specialized "grounding" model in a multi-model pipeline, but cannot replace a general-purpose model for form understanding, answer generation, or complex decision-making.

### 4.2 ShowUI (2B) -- Lightweight Specialist

**What it is**: A 2B parameter vision-language-action model for GUI agents (CVPR 2025).

**Key strengths**:

- 75.1% accuracy on zero-shot screenshot grounding
- Extremely lightweight (2B params) -- can run on edge devices
- Competitive across web, mobile, and online environments

**Limitations**:

- Too small for complex reasoning
- Limited context understanding
- No general language capabilities

**Verdict**: Useful as a fast element detector in a pipeline. Not suitable as a primary model.

### 4.3 CogAgent -- Broad GUI Agent

**What it is**: An end-to-end VLM-based GUI agent model.

**Key strengths**:

- Leads in GUI localization (ScreenSpot), single-step operations (OmniAct), and multi-step operations (OSWorld)
- Can process screenshots and output actions directly

**Limitations**:

- ~4K context window (very limited)
- Requires significant VRAM for self-hosting

**Verdict**: Capable but superseded by UI-TARS-1.5 in most benchmarks.

### 4.4 SeeClick -- Element Grounding Specialist

**What it is**: A model specifically designed for GUI element grounding and visual agent tasks.

**Key strengths**:

- Best average performance across three GUI platforms despite fewer parameters
- Efficient at predicting click targets from screenshots

**Verdict**: Good for element detection but outperformed by UI-TARS-1.5.

### 4.5 Ferret-UI / Ferret-UI Lite

**What it is**: Apple's UI understanding model, with a Lite version for on-device use.

**Key strengths**:

- Strong at understanding UI layouts and semantics
- Lite version designed for mobile/edge deployment

**Verdict**: Research-focused; not practical for production browser automation yet.

### 4.6 Summary: Should We Use Specialized Models?

**For our job application use case: Probably not as primary models.**

Reasons:

1. **Form filling requires general reasoning** -- understanding job descriptions, generating answers, mapping resume data to fields. Specialized GUI models lack this.
2. **Element detection is already solved** -- Browser-Use / CDP provides DOM selectors directly, making pixel-level grounding less necessary.
3. **Context window limitations** -- Most specialized models have 4-32K windows, insufficient for DOM + conversation context.
4. **Integration complexity** -- Running multiple model endpoints adds latency and operational overhead.

**Exception**: If you implement a screenshot-based approach (instead of DOM-based), UI-TARS-1.5 could serve as a cost-effective grounding model to identify click targets, while a frontier model handles reasoning.

---

## 5. Model Routing Strategy

### 5.1 Task Classification for Job Applications

| Task Type                    | Complexity | Model Tier                         | Examples                                                         |
| ---------------------------- | ---------- | ---------------------------------- | ---------------------------------------------------------------- |
| **Form Analysis**            | High       | Premium (Sonnet 4.5)               | Understanding what a form is asking, parsing complex ATS layouts |
| **Answer Generation**        | High       | Premium (Sonnet 4.5)               | Writing cover letter snippets, answering "Why this role?"        |
| **Screenshot Understanding** | High       | Premium (Sonnet 4.5 / GPT-4o)      | Analyzing visual layout when DOM is insufficient                 |
| **Field Mapping**            | Medium     | Mid (GPT-4.1 mini)                 | Mapping resume fields to form inputs                             |
| **Simple Selection**         | Low        | Budget (GPT-4.1 nano / Flash-Lite) | Selecting from dropdowns, radio buttons                          |
| **Confirmation Checks**      | Low        | Budget (GPT-4.1 nano / Flash-Lite) | "Did the form submit?", "Is this the right page?"                |
| **Error Recovery**           | Medium     | Mid (Haiku / Flash)                | Detecting and recovering from failed interactions                |
| **Navigation**               | Low        | Budget                             | "Click Next", "Scroll down", basic page transitions              |

### 5.2 Recommended Routing Architecture

```
                    +------------------+
                    |  Task Classifier  |
                    |  (rule-based or   |
                    |   lightweight LLM)|
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
    +---------v------+ +----v--------+ +---v----------+
    | Premium Model  | | Mid Model   | | Budget Model |
    | Claude Sonnet  | | GPT-4.1 mini| | GPT-4.1 nano |
    | 4.5            | | or Haiku    | | or Flash-Lite|
    +----------------+ +-------------+ +--------------+
    - Form analysis    - Field mapping  - Confirmations
    - Answer gen       - Error recovery - Navigation
    - Screenshots      - Simple forms   - Dropdowns
```

### 5.3 Implementation with LiteLLM

LiteLLM provides a unified API compatible with OpenAI's SDK that supports 100+ model providers. Combined with RouteLLM, you can achieve up to 85% cost reduction while maintaining 95% of frontier model quality.

**Key implementation pattern**:

```python
# Pseudocode for model routing
from litellm import completion

def route_model(task_type: str, complexity: float) -> str:
    if complexity > 0.7 or task_type in ["form_analysis", "answer_generation", "screenshot"]:
        return "anthropic/claude-sonnet-4-5"
    elif complexity > 0.3 or task_type in ["field_mapping", "error_recovery"]:
        return "openai/gpt-4.1-mini"
    else:
        return "openai/gpt-4.1-nano"

# All models through unified interface
response = completion(
    model=route_model(task_type, complexity),
    messages=[...],
    tools=[...],
)
```

### 5.4 Fallback Strategy

```
Primary:  Claude Sonnet 4.5
    |
    v (if rate-limited or error)
Fallback 1: GPT-4o
    |
    v (if rate-limited or error)
Fallback 2: Gemini 2.5 Pro
    |
    v (for non-critical tasks)
Budget:   GPT-4.1 mini / nano
```

---

## 6. Anthropic Computer Use Deep Dive

### 6.1 How It Works

Anthropic Computer Use is a native capability built into Claude that enables the model to control computers through a perceive-think-act loop:

1. **Screenshot**: The system captures a screenshot of the current screen state
2. **Analysis**: Claude analyzes the screenshot, understands the UI layout, identifies interactive elements
3. **Action**: Claude outputs precise actions (mouse coordinates for clicks, text to type, keyboard shortcuts)
4. **Execution**: The hosting system executes the action via OS-level input simulation
5. **Repeat**: New screenshot is captured, loop continues until task is complete

### 6.2 Technical Architecture

```
[Screen] --> [Screenshot Capture] --> [Claude API]
                                         |
                                    [Vision Model]
                                    [analyzes UI]
                                         |
                                    [Output: action]
                                    (click x,y / type "text" / key "enter")
                                         |
[Screen] <-- [Action Executor] <---------+
```

### 6.3 Performance Characteristics

| Metric              | Claude Sonnet 4.5 | Claude Opus 4.6  |
| ------------------- | ----------------- | ---------------- |
| OSWorld             | 61.4%             | 72.7%            |
| Speed (tokens/sec)  | 63 tok/s          | ~40 tok/s (est.) |
| Time to first token | 1.8s              | ~3s (est.)       |
| Screenshot analysis | ~2-4s per action  | ~3-5s per action |
| Actions per minute  | ~12-15            | ~8-12            |

### 6.4 Computer Use vs Browser-Use + API

| Aspect                 | Anthropic Computer Use             | Browser-Use + LLM API         |
| ---------------------- | ---------------------------------- | ----------------------------- |
| **Input method**       | Screenshots (pixel-based)          | DOM extraction (text-based)   |
| **Element detection**  | Vision model (coordinate-based)    | CSS selectors / XPath         |
| **Reliability**        | Works on any visual interface      | Depends on DOM structure      |
| **Speed**              | Slower (screenshot encode/decode)  | Faster (text-only calls)      |
| **Cost**               | Higher (image tokens)              | Lower (text tokens only)      |
| **Robustness**         | Handles popups, overlays, CAPTCHAs | May miss visual-only elements |
| **Model lock-in**      | Claude only                        | Any LLM provider              |
| **Context efficiency** | Screenshots use many tokens        | DOM text is token-efficient   |

### 6.5 Can It Work with AdsPower via CDP?

**Yes, with limitations:**

- Computer Use needs a screenshot capture mechanism and an action execution mechanism
- For AdsPower browser instances accessible via CDP:
  - **Screenshot**: Use CDP `Page.captureScreenshot` to get the browser viewport
  - **Action execution**: Use CDP `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` to simulate clicks/typing
  - This creates a "headless Computer Use" setup within the browser window
- **Alternative**: Use Browser-Use library which already integrates with CDP and supports multiple LLMs including Claude

**Recommended approach**: Use Browser-Use's DOM-based approach as the primary method (faster, cheaper), with screenshot-based fallback via Computer Use for complex visual situations.

### 6.6 Latency Breakdown for Single Form Action

| Step                             | Computer Use       | Browser-Use (DOM) |
| -------------------------------- | ------------------ | ----------------- |
| Capture screenshot / Extract DOM | 200-500ms          | 100-300ms         |
| Encode and send to API           | 500-1000ms (image) | 100-200ms (text)  |
| LLM inference                    | 1500-3000ms        | 800-2000ms        |
| Parse response                   | 50ms               | 50ms              |
| Execute action                   | 200-500ms          | 100-300ms         |
| **Total per action**             | **2.5-5.0s**       | **1.1-2.9s**      |

---

## 7. Final Recommendation

### 7.1 Recommended Architecture

```
+------------------------------------------------------------------+
|                    JOB APPLICATION AGENT                          |
|                                                                   |
|  [Task Planner] -- determines what action is needed next         |
|       |                                                           |
|  [Model Router] -- selects model based on task complexity        |
|       |                                                           |
|  +----+----+                                                     |
|  |         |                                                     |
|  v         v                                                     |
|  PRIMARY   SECONDARY                                             |
|  Claude    GPT-4.1 mini                                          |
|  Sonnet    or Gemini                                             |
|  4.5       2.5 Flash                                             |
|  |         |                                                     |
|  +----+----+                                                     |
|       |                                                           |
|  [Browser-Use via CDP] -- DOM-based interaction                  |
|       |                                                           |
|  [AdsPower Browser Instance]                                     |
+------------------------------------------------------------------+
```

### 7.2 Model Selection

| Role                          | Primary Choice                       | Fallback                | Justification                                                                       |
| ----------------------------- | ------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| **Primary (complex tasks)**   | **Claude Sonnet 4.5**                | GPT-4o or GPT-4.1       | Best browser/GUI benchmark scores, native Computer Use, excellent structured output |
| **Secondary (routine tasks)** | **GPT-4.1 mini**                     | Gemini 2.5 Flash        | Best cost/quality ratio at $0.40/$1.60, strong function calling, 1M context         |
| **Budget (confirmations)**    | **GPT-4.1 nano**                     | Gemini 2.5 Flash-Lite   | $0.10/$0.40, adequate for yes/no checks                                             |
| **Screenshot fallback**       | **Claude Sonnet 4.5** (Computer Use) | GPT-4o                  | When DOM extraction fails or visual understanding needed                            |
| **Specialized grounding**     | Not recommended initially            | UI-TARS-1.5 (if needed) | Browser-Use handles element detection via DOM                                       |

### 7.3 Why NOT Other Models

| Model               | Reason Not Primary                                                                    |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Claude Opus 4.6** | 72.7% OSWorld is best, but 5x cost of Sonnet for marginal improvement in form filling |
| **GPT-4o**          | Good but 38.1% OSWorld vs Sonnet's 61.4%; vision edge matters less with DOM approach  |
| **Gemini 2.5 Pro**  | Strong but Computer Use is still preview; less proven for browser automation          |
| **DeepSeek V3/R1**  | No vision capability; text-only limits robustness                                     |
| **Llama 4**         | Untested on browser benchmarks; self-hosting overhead                                 |
| **UI-TARS-1.5**     | Brilliant grounding but lacks general reasoning for form content                      |
| **Qwen 2.5 VL**     | Untested on browser benchmarks; API availability limited                              |

### 7.4 Estimated Cost Per Application (Final)

Using recommended routing strategy:

| Scenario                    | Model Mix                             | Cost/App   | Monthly (100/day) |
| --------------------------- | ------------------------------------- | ---------- | ----------------- |
| **Optimized (recommended)** | 3 Sonnet calls + 5 GPT-4.1 mini calls | **$0.021** | **$63**           |
| **Premium**                 | All Sonnet 4.5                        | $0.045     | $135              |
| **Ultra-budget**            | 2 Sonnet + 6 GPT-4.1 nano             | $0.013     | $39               |
| **With prompt caching**     | Optimized + 90% cache hits            | **$0.008** | **$24**           |
| **Batch API + caching**     | Optimized + batch + cache             | **$0.005** | **$15**           |

### 7.5 Implementation Priority

**Phase 1 (MVP)**:

- Use Claude Sonnet 4.5 for all calls via Browser-Use + CDP
- Estimated cost: $0.045/application
- Focus on getting reliable form filling working

**Phase 2 (Cost Optimization)**:

- Implement model routing with LiteLLM
- Add GPT-4.1 mini for routine tasks
- Add prompt caching for repeated form structures
- Target cost: $0.021/application

**Phase 3 (Scale)**:

- Implement Batch API for non-urgent applications
- Add GPT-4.1 nano for trivial checks
- Add Computer Use fallback for visual edge cases
- Target cost: $0.008-0.015/application

### 7.6 Key Risk Mitigations

1. **Model provider outage**: Implement multi-provider fallback (Claude -> GPT-4o -> Gemini)
2. **Rate limiting**: Use LiteLLM's built-in rate limit handling and retry logic
3. **Cost overrun**: Set per-application token budget caps; abort if exceeded
4. **Accuracy degradation**: Monitor success rates per model; auto-escalate to premium model on failures
5. **Website changes**: DOM-based approach is more resilient than screenshot-based for layout changes

---

## Sources

### Benchmarks & Leaderboards

- [WebVoyager Benchmark Results (Browserable)](https://www.browserable.ai/blog/web-voyager-benchmark)
- [Magnitude SOTA on WebVoyager](https://github.com/sagekit/webvoyager)
- [Browser-Use SOTA Technical Report](https://browser-use.com/posts/sota-technical-report)
- [Agent-E SOTA Results](https://www.emergence.ai/blog/agent-e-sota)
- [WebArena Benchmark](https://webarena.dev/)
- [WebChoreArena](https://webchorearena.github.io/)
- [OSWorld Benchmark](https://os-world.github.io/)
- [OSWorld Verified](https://xlang.ai/blog/osworld-verified)
- [VisualWebArena](https://jykoh.com/vwa)
- [Mind2Web / Online-Mind2Web](https://osu-nlp-group.github.io/Mind2Web/)
- [SWE-bench Leaderboard](https://www.swebench.com/)
- [SWE-bench Verified (Epoch AI)](https://epoch.ai/benchmarks/swe-bench-verified)
- [BrowseComp (OpenAI)](https://openai.com/index/browsecomp/)
- [Browser Agent Benchmark (Browser-Use)](https://browser-use.com/posts/ai-browser-agent-benchmark)

### Model Information

- [Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)
- [Claude Opus 4.6 Release](https://www.anthropic.com/claude/opus)
- [Claude Sonnet 4.5 Introduction](https://www.anthropic.com/news/claude-sonnet-4-5)
- [Anthropic Computer Use Announcement](https://www.anthropic.com/news/3-5-models-and-computer-use)
- [GPT-4.1 Introduction (OpenAI)](https://openai.com/index/gpt-4-1/)
- [OpenAI CUA / Operator](https://openai.com/index/computer-using-agent/)
- [Gemini 2.5 Computer Use Model](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/gemini-computer-use-model/)
- [UI-TARS-1.5 (ByteDance)](https://huggingface.co/ByteDance-Seed/UI-TARS-1.5-7B)
- [UI-TARS GitHub](https://github.com/bytedance/UI-TARS)
- [ShowUI (GitHub)](https://github.com/showlab/ShowUI)
- [Llama 4 Models](https://www.llama.com/models/llama-4/)

### Pricing

- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [DeepSeek API Pricing](https://api-docs.deepseek.com/quick_start/pricing/)
- [LLM Pricing Comparison 2026](https://www.cloudidr.com/blog/llm-pricing-comparison-2026)
- [LLM Pricing Calculator](https://llmpricingcalculator.com/)

### Architecture & Routing

- [RouteLLM Framework](https://lmsys.org/blog/2024-07-01-routellm/)
- [LiteLLM Router](https://docs.litellm.ai/docs/routing)
- [Anthropic Computer Use vs OpenAI CUA (WorkOS)](https://workos.com/blog/anthropics-computer-use-versus-openais-computer-using-agent-cua)
- [Browser Use vs Computer Use vs Operator (Helicone)](https://www.helicone.ai/blog/browser-use-vs-computer-use-vs-operator)
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Browser-Use Library](https://github.com/browser-use/browser-use)

### Job Application Automation

- [Top Browser Agents for Form-Filling 2025 (o-mega)](https://o-mega.ai/articles/top-browser-agents-for-form-filling-in-2025)
- [AI Job Application Agents 2025 (Latenode)](https://latenode.com/blog/ai-agents-autonomous-systems/ai-agent-use-cases-by-industry/ai-job-application-agents-2025-complete-review-of-9-automated-job-search-tools)
- [AIHawk Job Applier Agent](https://github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk)
- [State of AI Browser Agents 2025 (FillApp)](https://fillapp.ai/blog/the-state-of-ai-browser-agents-2025)
