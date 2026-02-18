# Stagehand + Orchestration Architecture Research

**Date:** 2026-02-11
**Status:** Research complete, ready for integration planning

---

## Table of Contents

1. Stagehand Capabilities (iframe, Shadow DOM, dynamic rendering)
2. Problem Detection & Recheck Mechanisms
3. Stagehand-Magnitude Switching Design
4. Orchestration Layer (BullMQ + XState + AdsPower + noVNC)

---

## 1. Stagehand Capabilities

### 1.1 iframe and Shadow DOM Support

**Official documentation states:**

> "Iframe and Shadow DOM interactions are supported out of the box. Stagehand automatically handles iframe traversal and shadow DOM elements without requiring additional configuration or flags."

#### iframe Handling

```typescript
// Method 1: deepLocator hop notation
const button = page.deepLocator("iframe#myframe >> button.submit");
await button.click();

// Method 2: Nested iframes
const input = page.deepLocator("iframe#outer >> iframe#inner >> input#email");
await input.fill("user@example.com");

// Method 3: Deep XPath (auto-detects iframe boundaries)
page.deepLocator("//iframe[@id='myframe']//button");
```

**How it works:**

- `deepLocator` auto-parses iframe steps in selectors
- Auto-switches to correct frame context
- Returns to main frame after execution

#### Shadow DOM Handling

```typescript
// Stagehand v3+ natively supports Shadow DOM
// No special config needed - observe() and act() auto-penetrate Shadow DOM
await stagehand.observe("find the button inside shadow DOM");
// Returned selector auto-includes shadow DOM path
```

- Stagehand v2.4.3+: Shadow DOM support (requires `experimental: true`)
- Stagehand v3+: Shadow DOM support is default

#### Complex Nesting

- Shadow DOM inside iframe: handled via `page.deepLocator("iframe#widget >> [shadow-selector]")`
- iframe inside Shadow DOM: Stagehand v3+ natively supports per GitHub Issue #848

### 1.2 Dynamic Rendering Support

```typescript
// observe() auto-waits for elements to appear
const actions = await stagehand.observe("find the submit button");
// Internal: waits for DOM stability and element visibility

// act() also auto-waits
await stagehand.act("click the login button");
// Waits for element to be interactive before executing

// Explicit wait config
await stagehand.observe("find buttons", { timeout: 10000 });

// Dynamic dropdowns
await stagehand.act("hover over the dropdown and click the option 'Software Engineer'");
```

### 1.3 Error Types

| Error Type                        | Meaning                   | Trigger                                             |
| --------------------------------- | ------------------------- | --------------------------------------------------- |
| `StagehandIframeError`            | Cannot parse iframe       | Selector error or iframe doesn't exist              |
| `ContentFrameNotFoundError`       | Cannot get frame content  | iframe not loaded or blocked                        |
| `XPathResolutionError`            | XPath cannot resolve      | Element not found in page/frame                     |
| `StagehandShadowRootMissingError` | Shadow root doesn't exist | Accessing non-existent Shadow DOM                   |
| `StagehandDomProcessError`        | DOM processing error      | Abnormal page structure or script injection failure |
| `LLMResponseError`                | LLM response error        | AI returned unparseable result                      |

### 1.4 Capability Matrix

**Can handle:**

- iframe (including nested)
- Shadow DOM (v3+ native)
- Shadow DOM inside iframe
- iframe inside Shadow DOM
- Dynamic rendering (built-in smart wait)
- Dynamic dropdowns (natural language)
- Virtual scrolling (via `act("scroll down")`)

**Cannot handle:**

- reCAPTCHA / hCaptcha (requires human)
- Complex graphical CAPTCHAs (needs OCR or human)
- Real-person security checks (Cloudflare click-to-verify)
- External device 2FA (phone verification)

### 1.5 Stagehand vs Magnitude Comparison

| Feature           | Stagehand                          | Magnitude              |
| ----------------- | ---------------------------------- | ---------------------- |
| iframe handling   | Native (deepLocator)               | Visual bypass          |
| Shadow DOM        | Native (v3+)                       | Visual bypass          |
| Dynamic rendering | Smart wait                         | Visual detection       |
| Cost              | $0.05-0.10/op (first), $0 (cached) | $0.15/op               |
| Speed             | Fast (50ms cached)                 | Slow (2-3s)            |
| Accuracy          | High (DOM-based)                   | Medium (visual)        |
| Generalization    | Medium (needs learning)            | High (pure visual)     |
| Caching           | Auto-caches selectors              | No caching             |
| Self-healing      | Re-learns on selector failure      | Re-analyzes every time |

**Recommended Architecture:**

```
Stagehand (primary, 80-90%) -> Magnitude (fallback, 10-20%) -> Human takeover (last resort, <5%)
```

---

## 2. Problem Detection & Recheck Mechanisms

### 2.1 Key Verification Points

| Step        | What to Verify         | Success Signal                     | Failure Signal                  |
| ----------- | ---------------------- | ---------------------------------- | ------------------------------- |
| Page load   | Form renders correctly | Key elements exist (submit button) | 404, blank page, timeout        |
| Field fill  | Data entered correctly | input.value === expectedValue      | Empty field, value mismatch     |
| File upload | Resume uploaded        | Filename displayed, progress 100%  | Error message, filename missing |
| Form submit | Application submitted  | Success page, confirmation msg     | Error message, still on form    |
| CAPTCHA     | CAPTCHA encountered    | Page contains reCAPTCHA/hCaptcha   | -                               |

### 2.2 Multi-Layer Verification Strategy

**Layer 1: Operation-Level** (after each action)

```typescript
// Fill field -> extract value -> compare expected vs actual
await stagehand.act(instruction);
const actualValue = await stagehand.extract({
  instruction: "extract the value of the input field",
  schema: z.object({ value: z.string() }),
  selector: fields[0].selector,
});
if (actualValue.value !== expectedValue) {
  /* retry or fallback */
}
```

**Layer 2: Step-Level** (after completing related operations group)

```typescript
// Extract entire form data -> compare field by field
const formData = await stagehand.extract({
  instruction: "extract all filled form fields",
  schema: z.object({ firstName: z.string(), lastName: z.string(), ... }),
});
```

**Layer 3: Result-Level** (after entire flow completes)

```typescript
// Check URL change, AI page analysis, error messages
const pageAnalysis = await stagehand.extract({
  instruction: "Is this a success/confirmation page?",
  schema: z.object({ isSuccessPage: z.boolean(), confirmationNumber: z.string().optional() }),
});
```

### 2.3 Special Scenario Detection

**CAPTCHA Detection:**

- DOM: `iframe[src*="recaptcha"]`, `.g-recaptcha`, `.h-captcha`, `#captcha`
- URL: redirect to checkpoint/challenge URLs
- Content: "verify you're human", "prove you're not a robot"
- Visual: screenshot sent to LLM for classification (fallback)

**Error Message Detection:**

```typescript
const errorElements = await stagehand.observe(
  "find error messages, validation errors, or warning messages",
);
```

### 2.4 Retry Strategy

- Max 3 attempts with exponential backoff (1s -> 2s -> 4s)
- On verification failure: retry same agent -> switch agent -> human takeover

---

## 3. Stagehand-Magnitude Switching Design

### 3.1 Key Finding: Switching Preserves Stagehand Cache

Stagehand cache is based on `hash(instruction + startURL + config)` - independent of execution flow. Switching to Magnitude mid-flow does NOT invalidate Stagehand's cache. Next time the same instruction+URL is encountered, Stagehand uses cached selectors.

### 3.2 Switch Triggers

| Trigger              | Description                                           | Target         |
| -------------------- | ----------------------------------------------------- | -------------- |
| Stagehand exception  | XPathResolutionError, ContentFrameNotFoundError, etc. | Magnitude      |
| Verification failure | 3 retries failed                                      | Magnitude      |
| Timeout              | Operation exceeds 30s                                 | Magnitude      |
| Unknown platform     | Cache miss + not in known platform list               | Magnitude      |
| CAPTCHA detected     | reCAPTCHA/hCaptcha found                              | Human takeover |
| Magnitude failure    | Magnitude also failed                                 | Human takeover |

### 3.3 State Preservation During Switch

Both agents share the same Playwright `Page` object. On switch:

1. Record which fields are already filled (SharedContext)
2. Pass only remaining fields to the new agent
3. Both agents operate on the same browser session

### 3.4 Performance Optimization

**Platform prediction:** Known platforms (LinkedIn, Greenhouse, Workday, Lever) -> Stagehand first. Unknown -> Magnitude directly.

**Historical success rate tracking:** If Stagehand success rate < 50% for a platform, route directly to Magnitude.

**Fast fail:** Non-retryable errors (XPathResolutionError, ContentFrameNotFoundError) -> switch immediately. Retryable errors (timeout, network) -> retry first.

---

## 4. Orchestration Layer Design

### 4.1 Architecture Overview

```
User Layer (Web App) -> WebSocket
    |
Orchestration Layer (Task Queue + State Machine + Event Bus)
    |
Execution Layer (AdsPower + Stagehand + Magnitude + noVNC)
```

### 4.2 Task Queue (BullMQ)

- Based on Redis, high performance
- Priority queues, delayed tasks, retries
- Built-in UI Dashboard
- TypeScript native support
- Concurrency: 10 concurrent tasks default

```typescript
const applicationQueue = new Queue("job-applications", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 3600 * 24 * 7, count: 1000 },
  },
});
```

### 4.3 State Machine (XState)

States: `idle -> initializing -> loading_page -> filling_form -> uploading_files -> checking_captcha -> [waiting_for_human] -> submitting -> verifying -> completed/failed`

- Clear state transitions, no "state explosion"
- Visualizable state diagram
- Easy to test and debug
- Guards: `shouldRetry` (attemptCount < 3), `hasCAPTCHA`

### 4.4 AdsPower Integration

```typescript
class AdsPowerManager {
  private baseURL = "http://localhost:50325"; // AdsPower Local API

  async launchProfile(userId: string): Promise<{ profileId: string; page: Page }> {
    // 1. Get user's dedicated profile or from shared pool
    // 2. Start profile via AdsPower API
    // 3. Connect via CDP (Playwright connectOverCDP)
    // 4. Return page object
  }
}
```

### 4.5 noVNC Human Takeover

- websockify proxy per browser worker
- JWT-secured WebSocket connection
- User sees full browser viewport, can click/type/scroll
- "Resume Automation" button triggers Hatchet durable event
- Timeout: 30 minutes default, configurable

### 4.6 Monitoring

- BullMQ Dashboard at `/admin/queues`
- Winston logging (error.log + combined.log)
- Socket.IO for real-time progress to frontend

### 4.7 Implementation Timeline

| Phase     | Duration    | Deliverable                                  |
| --------- | ----------- | -------------------------------------------- |
| Phase 1   | 1 week      | Base infrastructure (BullMQ + State Machine) |
| Phase 2   | 2 weeks     | Stagehand + AdsPower integration             |
| Phase 3   | 1 week      | Magnitude fallback                           |
| Phase 4   | 1 week      | Human takeover (noVNC)                       |
| Phase 5   | 1 week      | Monitoring, logging, optimization            |
| **Total** | **6 weeks** | Full orchestration layer                     |

---

## 5. Summary & Recommendations

**Core cost model:**

- Average $0.01-0.02 per application (with Stagehand caching)
- 95%+ automation rate with 3-layer fallback
- 50ms/step cached (Stagehand), 2-3s/step (Magnitude)

**Architecture principle:** Stagehand (primary) -> Magnitude (fallback) -> Human (last resort)

**Key technical decisions needed:**

1. BullMQ (Node.js/TypeScript) vs Hatchet (Python) for orchestration
2. XState vs direct state management in Hatchet workflows
3. Whether to run orchestration in Node.js (closer to Stagehand/Playwright) or Python (closer to FastAPI backend)
