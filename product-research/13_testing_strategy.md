# WeKruit Valet -- Comprehensive Testing Strategy

> **Version:** 1.0
> **Date:** 2026-02-11
> **Status:** Ready for Engineering Review
> **Audience:** Engineering, QA, DevOps, Product
> **Covers:** Copilot MVP (Phase 0-3) + Autopilot (Phase 4-5) + Scale (Phase 6)
> **References:** 03_complete_prd.md, 09_updated_product_roadmap.md, 10_stagehand_orchestration_research.md

---

## Table of Contents

1. [Testing Philosophy & Principles](#1-testing-philosophy--principles)
2. [Testing Pyramid](#2-testing-pyramid)
3. [Unit Testing Strategy](#3-unit-testing-strategy)
4. [Integration Testing Strategy](#4-integration-testing-strategy)
5. [E2E Testing Strategy](#5-e2e-testing-strategy)
6. [Browser Automation Testing (Critical)](#6-browser-automation-testing-critical)
7. [LLM Testing Strategy](#7-llm-testing-strategy)
8. [Performance Testing](#8-performance-testing)
9. [Security Testing](#9-security-testing)
10. [Visual Regression Testing](#10-visual-regression-testing)
11. [CI/CD Pipeline Design](#11-cicd-pipeline-design)
12. [Test Data Strategy](#12-test-data-strategy)
13. [Quality Gate Mapping](#13-quality-gate-mapping)
14. [Test Tooling Recommendations](#14-test-tooling-recommendations)
15. [Phase-Aligned Test Plan](#15-phase-aligned-test-plan)
16. [Appendix: Example Test Code](#appendix-example-test-code)

---

## 1. Testing Philosophy & Principles

### Core Principles

1. **Test the contract, not the implementation.** Tests verify observable behavior at component boundaries. Internal refactors should not break tests.
2. **The testing pyramid is a budget, not a suggestion.** Every slow, flaky, or expensive test must justify its existence against the cheaper alternative one layer down.
3. **Browser automation tests are the riskiest code in the system.** They interact with third-party DOM, LLM non-determinism, and real browser state. They receive the most testing investment.
4. **LLM outputs are probabilistic.** Tests for LLM-powered features use assertion ranges, golden-set evaluation, and confidence-threshold validation rather than exact string matching.
5. **Security is not a phase; it is continuous.** Security tests run on every PR, not just during Phase 3.
6. **Mock external services at the boundary.** Stagehand, Magnitude, AdsPower, LiteLLM, and noVNC all get mock implementations for unit and integration tests. Real services are used only in dedicated smoke tests and staging.
7. **No tests against live job platforms.** All ATS testing uses mock pages that replicate platform DOM structure. Testing against real LinkedIn/Greenhouse/Lever/Workday is a legal risk and creates flaky dependencies.

### Risk-Based Prioritization

| Component | Risk Level | Reason | Test Investment |
|-----------|-----------|--------|-----------------|
| Form Analyzer + Filler | CRITICAL | Core value prop; LLM non-determinism; DOM variability | 30% of test effort |
| Orchestrator (Hatchet + XState) | HIGH | Complex state machine; crash recovery; pause/resume | 20% of test effort |
| Auth + RLS | HIGH | Security boundary; data isolation; GDPR | 15% of test effort |
| WebSocket + Real-time | MEDIUM | User-facing latency; reconnection logic | 10% of test effort |
| Frontend (Dashboard) | MEDIUM | User-facing; many states; visual correctness | 10% of test effort |
| LLM Router | MEDIUM | Cost control; model selection; fallback chains | 10% of test effort |
| CAPTCHA Detection + noVNC | MEDIUM | Human-in-the-loop boundary; timeout logic | 5% of test effort |

---

## 2. Testing Pyramid

```
                    /\
                   /  \
                  / E2E \            ~5% of tests   | 20-50 tests
                 / (Full  \          Slowest (30s-5min each)
                / user flows)\       Playwright + mock ATS pages
               /--------------\
              / Integration     \    ~15% of tests  | 100-200 tests
             / (Component        \   Medium (1-10s each)
            / boundaries, DB,     \  pytest + testcontainers + WS clients
           / WebSocket, queues)    \
          /-------------------------\
         / Unit Tests                \   ~80% of tests  | 500-1000 tests
        / (Pure logic, components,    \  Fastest (<100ms each)
       / state machines, parsers,      \ Vitest (frontend) + pytest (backend)
      / form analysis, LLM mocks)      \
     /-----------------------------------\
    / Static Analysis (always-on)         \  TypeScript strict, mypy, ESLint, Ruff
   /----------------------------------------\
```

### Test Count Targets by Phase

| Phase | Unit | Integration | E2E | Total |
|-------|------|-------------|-----|-------|
| Phase 0 (Foundation) | 50 | 15 | 3 | 68 |
| Phase 1 (Copilot Core) | 200 | 50 | 10 | 260 |
| Phase 2 (Dashboard + HITL) | 150 | 40 | 10 | 200 |
| Phase 3 (QA + Beta) | 100 | 30 | 15 | 145 |
| Phase 4-5 (Autopilot) | 150 | 40 | 12 | 202 |
| **Total** | **650** | **175** | **50** | **875** |

---

## 3. Unit Testing Strategy

### 3.1 Frontend (Vitest + React Testing Library)

**Framework:** Vitest (Vite-native, fast, ESM-compatible) + @testing-library/react + @testing-library/user-event

**What to test:**
- Component rendering in all states (loading, empty, error, populated, disabled)
- User interactions (click, type, paste, keyboard shortcuts)
- Zustand store state transitions
- Custom hooks (useTaskWebSocket, useAuth, useKillSwitch)
- URL validation and platform detection logic
- Form validation (Zod schemas)
- Confidence score display logic (color thresholds, badges)

**What NOT to test:**
- shadcn/ui component internals (tested upstream)
- CSS styling (use visual regression tests instead)
- Third-party libraries (Tremor charts, react-vnc, RJSF)

**Naming convention:** `ComponentName.test.tsx` colocated with component files.

**Key test files:**

| File | Tests | Description |
|------|-------|-------------|
| `ApplyPage.test.tsx` | 12 | URL input, platform detection badge, job preview, start button states |
| `ProgressPanel.test.tsx` | 10 | Timeline steps, progress bar, confidence indicators, completion state |
| `VncViewer.test.tsx` | 8 | Modal open/close, countdown timer, resume button, cancel button |
| `KillSwitch.test.tsx` | 6 | Visibility when active, click handler, keyboard shortcut, offline queue |
| `useTaskWebSocket.test.ts` | 10 | Connect, disconnect, reconnect backoff, message parsing, heartbeat |
| `platformDetection.test.ts` | 15 | LinkedIn, Greenhouse, Lever, Workday URL patterns, edge cases |
| `confidenceScoring.test.ts` | 8 | Color thresholds (green/yellow/red), badge text, tooltip content |
| `authStore.test.ts` | 8 | Login, logout, token refresh, expired token redirect |
| `AutopilotUnlock.test.tsx` | 6 | Locked state, progress display, unlock trigger, consent modal |

### 3.2 Backend API (pytest)

**Framework:** pytest + pytest-asyncio + httpx (async test client) + factory_boy

**What to test:**
- Request validation (Pydantic models reject bad input)
- Response schemas (correct fields, types, status codes)
- Business logic (task creation, consent versioning, rate limit checks)
- Database queries (via SQLAlchemy models, tested against real PostgreSQL in CI)
- JWT generation, validation, expiry
- Error responses (4xx, 5xx with correct error codes)

**Naming convention:** `test_<router_name>.py` in `tests/api/` directory.

**Key test files:**

| File | Tests | Description |
|------|-------|-------------|
| `test_auth.py` | 12 | OAuth flow, JWT issue/validate/refresh, expired token, invalid token |
| `test_tasks.py` | 15 | Create task, list with filters, stats, cancel, status transitions |
| `test_resumes.py` | 10 | Upload, parse, retrieve, update, delete, size limit, type validation |
| `test_questions.py` | 8 | CRUD, JSON Schema generation, discover endpoint, semantic match |
| `test_consent.py` | 10 | Record consent, version check, invalidation, immutability, GDPR |
| `test_preferences.py` | 6 | Get, update, mode selection, autopilot locked |
| `test_rate_limiting.py` | 8 | Per-user, per-platform, per-endpoint, rate limit headers |
| `test_kill_switch.py` | 5 | Cancel all active, response time assertion, cascading cancel |

### 3.3 Orchestrator (pytest)

**Framework:** pytest + unittest.mock for Hatchet SDK mocking

**What to test:**
- XState state machine transitions (every valid and invalid transition)
- Guard conditions (shouldRetry, hasCAPTCHA, confidenceAboveThreshold)
- BullMQ/Hatchet job creation, retry logic, backoff timing
- Workflow step execution order
- Checkpoint creation and restoration
- Circuit breaker state (closed -> open -> half-open)

**Key test files:**

| File | Tests | Description |
|------|-------|-------------|
| `test_application_state_machine.py` | 20 | All state transitions, guard conditions, invalid transitions |
| `test_workflow_steps.py` | 15 | Each step in isolation with mocked dependencies |
| `test_checkpoint_manager.py` | 8 | Save, restore, stale detection, cleanup |
| `test_circuit_breaker.py` | 10 | Trip on 3 failures, auto-reset timer, half-open probe, manual reset |
| `test_retry_strategy.py` | 6 | Exponential backoff timing, max attempts, non-retryable errors |

### 3.4 LLM Router (pytest)

**Framework:** pytest with fully mocked LLM responses (no real API calls in unit tests)

**What to test:**
- Task-type-to-model mapping logic
- Fallback chain (primary fails -> secondary -> tertiary)
- Token budget enforcement
- Cost calculation accuracy
- Prompt template rendering
- Structured output parsing (JSON mode validation)

**Key test files:**

| File | Tests | Description |
|------|-------|-------------|
| `test_llm_router.py` | 12 | Model selection per task type, fallback on 5xx, budget limit |
| `test_prompt_templates.py` | 10 | Template rendering with variable substitution, schema inclusion |
| `test_token_tracker.py` | 8 | Usage logging, cost calculation, per-user aggregation |
| `test_structured_output.py` | 10 | JSON schema validation, malformed response handling |

### 3.5 Form Analyzer (pytest)

**Framework:** pytest with snapshot testing for DOM analysis outputs

**What to test:**
- DOM snapshot parsing (extract form fields from HTML)
- Field type detection (text, dropdown, radio, checkbox, file upload)
- Field-to-profile mapping accuracy
- Confidence score calculation
- Unknown field handling (flag for review)

**Key test files:**

| File | Tests | Description |
|------|-------|-------------|
| `test_form_analyzer.py` | 20 | Field extraction from mock DOM snapshots (LinkedIn, Greenhouse, Lever, Workday) |
| `test_field_mapper.py` | 15 | Profile field matching, Q&A bank matching, LLM-generated answers |
| `test_confidence_scorer.py` | 10 | Score calculation, threshold application, source-based weighting |

---

## 4. Integration Testing Strategy

### 4.1 Boundary Map

Each integration test validates the contract between exactly two components. Tests use real instances of both components (or lightweight fakes) rather than mocks.

```
Frontend <--REST/WS--> API Server <--SQL--> PostgreSQL (with RLS)
                           |
                           +--Hatchet SDK--> Orchestrator <--CDP--> Worker
                           |                                  |
                           +--Redis PubSub--> WebSocket       +--Stagehand--> Browser
                           |                                  |
                           +--Novu SDK--> Notification         +--AdsPower API--> Profile
                           |                                  |
                           +--S3 SDK--> Object Storage         +--LiteLLM--> LLM APIs
```

### 4.2 Integration Test Matrix

| Boundary | Test Type | Setup | Key Assertions |
|----------|-----------|-------|----------------|
| **API <-> PostgreSQL** | Testcontainers (Postgres) | Real DB with migrations | Queries return correct data; RLS blocks cross-user access; indexes used |
| **API <-> Hatchet** | Hatchet test worker | Real Hatchet in Docker | Task created -> worker picks up -> status updated -> API reflects status |
| **API <-> Redis (WebSocket)** | Redis container + WS client | Real Redis PubSub | Event published -> WS client receives within 200ms |
| **API <-> S3 (Resumes)** | MinIO container | Real S3-compatible store | Upload -> retrieve -> delete; encrypted at rest; size limit enforced |
| **Orchestrator <-> Worker** | Mock worker process | Hatchet in Docker | Task dispatched -> worker reports progress -> orchestrator updates state |
| **Worker <-> Stagehand** | Mock HTTP server as ATS page | Playwright + mock page | Navigate -> observe fields -> fill -> verify filled values |
| **Worker <-> AdsPower** | Mock AdsPower API | HTTP mock server | Create profile -> launch -> get CDP URL -> stop -> cleanup |
| **Worker <-> LLM** | Recorded LLM responses (VCR) | Replay cassettes | Prompt sent -> response parsed -> structured output validated |
| **Frontend <-> API (REST)** | MSW (Mock Service Worker) | In-browser mock | Fetch calls -> correct request shape -> response handled |
| **Frontend <-> API (WebSocket)** | Mock WS server | ws library | Connect -> receive events -> update UI state -> reconnect on drop |

### 4.3 Database Integration Tests (Critical)

**Tool:** testcontainers-python with PostgreSQL image

These tests verify:
1. **RLS enforcement:** User A's JWT -> query tasks -> only User A's tasks returned
2. **Migration correctness:** `alembic upgrade head` from empty DB succeeds; `downgrade -1` cleanly rolls back
3. **Index performance:** EXPLAIN ANALYZE on critical queries shows index scans (not seq scans)
4. **Constraint enforcement:** Foreign keys, NOT NULL, CHECK constraints block invalid data
5. **Consent immutability:** INSERT into consent_records succeeds; UPDATE/DELETE raises error

```python
# Example: RLS integration test structure
class TestRowLevelSecurity:
    """Verify PostgreSQL RLS prevents cross-user data access."""

    async def test_user_a_cannot_see_user_b_tasks(self, db_session, user_a, user_b):
        # Create tasks for both users
        task_a = await create_task(db_session, user_id=user_a.id, job_url="https://example.com/job1")
        task_b = await create_task(db_session, user_id=user_b.id, job_url="https://example.com/job2")

        # Query as user A (RLS applied)
        tasks = await get_tasks_for_user(db_session, user_id=user_a.id)

        assert len(tasks) == 1
        assert tasks[0].id == task_a.id
        # task_b is invisible to user_a

    async def test_rls_applied_on_direct_sql(self, db_session, user_a, user_b):
        """Verify RLS works even with raw SQL, not just ORM queries."""
        result = await db_session.execute(
            text("SELECT * FROM tasks WHERE user_id = :uid"),
            {"uid": user_b.id}
        )
        # With RLS and user_a's session context, this returns 0 rows
        assert result.rowcount == 0
```

### 4.4 WebSocket Integration Tests

**Tool:** python-socketio test client or raw websocket client

```python
class TestWebSocketIntegration:
    """Verify real-time updates flow from worker to frontend."""

    async def test_task_progress_reaches_client_within_200ms(self, ws_client, redis_client):
        task_id = "test-task-123"
        await ws_client.connect(f"/ws/tasks/{task_id}", auth=valid_jwt)

        start = time.monotonic()
        await redis_client.publish(f"task:{task_id}", json.dumps({
            "type": "progress",
            "step": "filling_form",
            "percent": 45,
        }))

        message = await ws_client.receive(timeout=1.0)
        latency_ms = (time.monotonic() - start) * 1000

        assert latency_ms < 200
        assert message["type"] == "progress"
        assert message["percent"] == 45
```

---

## 5. E2E Testing Strategy

### 5.1 Framework

**Tool:** Playwright (TypeScript) with custom test fixtures

**Why Playwright over Cypress:**
- Multi-browser support (Chromium, Firefox, WebKit)
- Native WebSocket interception
- Network request mocking built-in
- Parallel execution
- Trace viewer for debugging failed tests

### 5.2 Test Environment

E2E tests run against:
- **Frontend:** Vite dev server (or production build)
- **Backend:** Real FastAPI server with test database
- **Database:** PostgreSQL (testcontainers or Docker Compose)
- **External services:** All mocked (LLM, AdsPower, Stagehand, Novu)

### 5.3 Critical User Flows

#### Flow 1: Happy Path (Copilot)

```
Sign up (Google OAuth mock) ->
  Resume upload (PDF) ->
  Quick review ->
  Dashboard (empty state) ->
  Paste LinkedIn URL ->
  Job preview card ->
  Pre-fill preview ->
  "Approve & Start" ->
  Progress panel (WebSocket mock events) ->
  Completion card with screenshot ->
  Application in history table
```

**Assertions:**
- Each step loads within 3 seconds
- Progress bar advances through all states
- Completion shows correct job title and company
- History table shows 1 row with "Completed" status

#### Flow 2: CAPTCHA Intervention

```
Start application ->
  Progress reaches "Filling Form" ->
  WebSocket sends "human_needed" (CAPTCHA) ->
  VNC modal opens ->
  Countdown timer starts ->
  User clicks "Resume Automation" ->
  Progress resumes ->
  Application completes
```

**Assertions:**
- VNC modal appears within 2 seconds of CAPTCHA event
- Countdown timer counts down correctly
- "Resume Automation" sends correct event
- Progress continues from the paused step (not restart)

#### Flow 3: Autopilot Unlock + Batch

```
Complete 3 Copilot applications ->
  "Graduate to Autopilot" modal appears ->
  User clicks "Try Autopilot" ->
  Consent form with 8 checkboxes ->
  User checks all + types confirmation ->
  Autopilot mode activated ->
  Paste 5 URLs in batch ->
  Batch processes sequentially ->
  Summary dashboard updates
```

**Assertions:**
- Unlock modal only appears after 3 successful apps
- Consent form requires all 8 checkboxes + typed phrase
- Mode indicator switches from blue (Copilot) to purple (Autopilot)
- Batch progress shows per-application status

#### Flow 4: Error Recovery

```
Start application ->
  Progress reaches "Submitting" ->
  WebSocket sends "error" (session expired) ->
  Error card with "Retry" button ->
  Click "Retry" ->
  New task created ->
  Application completes
```

#### Flow 5: Kill Switch

```
Start application ->
  Progress at 50% ->
  Click "Stop All" (or Ctrl+Shift+K) ->
  Confirmation toast within 2 seconds ->
  Task status is "Cancelled" ->
  No further WebSocket events
```

#### Flow 6: Mode Switching Mid-Session

```
Start Copilot application ->
  Switch to Autopilot in settings ->
  Current application continues in Copilot (mode change applies to next) ->
  Start new application ->
  New application runs in Autopilot mode
```

### 5.4 Flakiness Mitigation

- **Retry policy:** Each E2E test retries once on failure (Playwright `retries: 1`)
- **Strict selectors:** Use `data-testid` attributes, never CSS classes or text content
- **Wait strategies:** `waitForSelector` with explicit timeouts, never `page.waitForTimeout()`
- **Network stability:** All external calls mocked; no real network dependencies
- **Isolation:** Each test gets a fresh user, fresh database state (via API seed endpoint)
- **Trace on failure:** Playwright trace recorded on failure for debugging

---

## 6. Browser Automation Testing (Critical)

This is the highest-risk area. The system interacts with third-party DOM structures that change without notice. All testing uses mock ATS pages -- never real platforms.

### 6.1 Mock ATS Page Architecture

Build a local mock server (Express or Playwright's `route` API) that serves HTML pages replicating the DOM structure of target platforms.

```
/mock-ats/
  /linkedin/
    easy-apply-single-page.html       # Simple 1-page Easy Apply
    easy-apply-multi-step.html         # 3-step modal flow
    easy-apply-with-captcha.html       # Injects reCAPTCHA iframe
    easy-apply-with-custom-questions.html  # Screening questions
    already-applied.html               # "Already Applied" state
    login-required.html                # Session expired
  /greenhouse/
    standard-form.html                 # Basic Greenhouse form
    with-custom-questions.html         # Custom screening questions
    with-eeoc.html                     # EEO/diversity questions
  /lever/
    standard-form.html                 # Basic Lever form
    with-cover-letter.html             # Cover letter textarea
  /workday/
    shadow-dom-form.html               # Workday-style Shadow DOM
    multi-page-wizard.html             # Multi-page wizard
    dynamic-dropdown.html              # Dynamically loaded dropdowns
  /edge-cases/
    iframe-nested.html                 # Form inside nested iframes
    react-synthetic-events.html        # React-controlled inputs
    virtual-scroll-dropdown.html       # Dropdown with virtual scrolling
    custom-file-upload.html            # Non-standard file upload widget
    slow-loading-form.html             # Form loads after 5-second delay
```

### 6.2 Mock ATS Page Design Principles

1. **DOM fidelity:** Copy actual class names, ARIA attributes, and nesting structure from real platforms (captured once via DevTools snapshot)
2. **Behavioral fidelity:** Implement client-side validation, dynamic field show/hide, multi-step navigation
3. **Variation:** Multiple versions of each page to test selector resilience
4. **Instrumentation:** Each mock page includes a hidden `<script>` that records all form interactions (field fills, clicks, submits) into `window.__mockAtsLog` for assertion

### 6.3 Stagehand 3-Layer Fallback Testing

Test the Stagehand -> Magnitude -> Human escalation path:

| Test Scenario | Stagehand Behavior | Expected Fallback |
|---------------|-------------------|-------------------|
| Known platform, cached selectors | Succeeds on first try | No fallback needed |
| Known platform, stale selectors | Throws `XPathResolutionError` | Magnitude takes over |
| Unknown platform, no cache | Stagehand attempts, may fail | Magnitude fallback |
| Magnitude also fails | Both fail | Human takeover via noVNC |
| CAPTCHA detected | N/A (not automatable) | Immediate human takeover |
| Timeout (>30s per operation) | Times out | Switch to Magnitude |

**Implementation:** Mock Stagehand client that can be configured to succeed, fail with specific errors, or timeout:

```python
class MockStagehandClient:
    """Configurable mock for testing fallback behavior."""

    def __init__(self, behavior: str = "succeed"):
        self.behavior = behavior  # "succeed", "xpath_error", "timeout", "shadow_error"
        self.call_count = 0

    async def observe(self, instruction: str, **kwargs):
        self.call_count += 1
        if self.behavior == "xpath_error":
            raise XPathResolutionError(f"Cannot resolve: {instruction}")
        if self.behavior == "timeout":
            await asyncio.sleep(35)  # Exceeds 30s timeout
        if self.behavior == "shadow_error":
            raise StagehandShadowRootMissingError("Shadow root not found")
        return [{"selector": "input#email", "description": "Email field"}]

    async def act(self, instruction: str, **kwargs):
        self.call_count += 1
        if self.behavior == "succeed":
            return {"success": True}
        raise StagehandDomProcessError("DOM operation failed")
```

### 6.4 Form Filling Accuracy Tests

The most critical test suite. Compares expected field values against actual filled values.

**Methodology:**
1. Load mock ATS page in Playwright
2. Run form analyzer on the DOM
3. Run form filler with known user profile
4. Extract all input values from the page
5. Compare against expected values

**Test matrix (minimum 50 scenarios):**

| Scenario | Input Type | Expected Value | Pass Criteria |
|----------|-----------|---------------|---------------|
| First name (text) | `<input type="text">` | "Adam" | Exact match |
| Email (email) | `<input type="email">` | "adam@example.com" | Exact match |
| Phone (tel) | `<input type="tel">` | "(555) 123-4567" | Normalized match |
| LinkedIn URL | `<input type="url">` | Full LinkedIn URL | Contains linkedin.com |
| Years of experience | `<select>` | "5-7 years" | Closest match |
| Work authorization | `<input type="radio">` | "Yes" radio selected | Radio checked |
| Resume upload | `<input type="file">` | File selected | File name matches |
| Custom dropdown (React) | `<div role="listbox">` | Correct option | Visible text matches |
| Multi-select skills | `<input type="checkbox">` | Relevant skills checked | Subset match |
| Free-text answer | `<textarea>` | LLM-generated answer | Non-empty, relevant |
| Salary expectation | `<input type="number">` | From Q&A bank | Within range |
| Start date | `<input type="date">` | From Q&A bank | Valid date format |

### 6.5 CAPTCHA Detection Tests

**Mock CAPTCHA elements injected into test pages:**

```html
<!-- reCAPTCHA v2 iframe mock -->
<iframe src="https://www.google.com/recaptcha/api2/anchor" width="304" height="78"></iframe>
<div class="g-recaptcha" data-sitekey="mock-key"></div>

<!-- hCaptcha mock -->
<div class="h-captcha" data-sitekey="mock-key"></div>
<iframe src="https://assets.hcaptcha.com/captcha/v1/mock"></iframe>

<!-- Generic CAPTCHA -->
<div id="captcha-container">
  <p>Verify you're human</p>
  <img src="captcha-image.png" alt="CAPTCHA" />
</div>

<!-- Cloudflare challenge -->
<div id="challenge-stage">
  <p>Checking your browser before accessing the site...</p>
</div>
```

**Test assertions:**
- Detection occurs within 2 seconds of CAPTCHA element appearing
- Correct CAPTCHA type identified (reCAPTCHA, hCaptcha, generic, Cloudflare)
- All DOM interaction stops immediately after detection
- Checkpoint saved before transitioning to NEED_CAPTCHA state
- Screenshot captured and attached to task event

### 6.6 Shadow DOM Testing (Workday)

Mock Workday-style Shadow DOM:

```html
<!-- workday-shadow-dom-form.html -->
<workday-app>
  #shadow-root (open)
    <div class="WJOB">
      <workday-text-input>
        #shadow-root (open)
          <label>First Name</label>
          <input type="text" data-automation-id="firstName" />
      </workday-text-input>
      <workday-dropdown>
        #shadow-root (open)
          <label>Country</label>
          <div role="listbox" data-automation-id="country">
            <div role="option">United States</div>
            <div role="option">Canada</div>
          </div>
      </workday-dropdown>
    </div>
</workday-app>
```

**Test assertions:**
- Stagehand `observe()` penetrates shadow DOM and finds all form fields
- `act()` correctly fills fields inside shadow roots
- Nested shadow DOM (shadow root inside shadow root) handled
- Shadow DOM inside iframe handled

### 6.7 Selector Healing Tests

Test that stale selectors are detected and recovered:

1. Run form filler against mock page v1 (selectors cached)
2. Modify mock page to v2 (changed class names, restructured DOM, same semantic content)
3. Run form filler again -- first attempt with cached selectors should fail
4. Verify Stagehand re-learns selectors automatically
5. Run form filler a third time -- should use new cached selectors and succeed

---

## 7. LLM Testing Strategy

### 7.1 Prompt Testing (Golden Set Evaluation)

Maintain a curated set of prompt inputs and expected outputs:

```
/test-fixtures/llm/
  /resume-parsing/
    resume_1_software_engineer.pdf    -> expected_output_1.json
    resume_2_marketing_manager.pdf    -> expected_output_2.json
    resume_3_fresh_graduate.pdf       -> expected_output_3.json
    resume_4_career_changer.pdf       -> expected_output_4.json
    resume_5_non_english_name.pdf     -> expected_output_5.json
  /form-analysis/
    linkedin_dom_snapshot_1.html      -> expected_mapping_1.json
    greenhouse_dom_snapshot_1.html    -> expected_mapping_2.json
    lever_dom_snapshot_1.html         -> expected_mapping_3.json
  /screening-questions/
    question_set_1.json               -> expected_answers_1.json
    question_set_2.json               -> expected_answers_2.json
  /match-scoring/
    job_description_1.txt + resume_1  -> expected_score_range: 80-95
    job_description_2.txt + resume_3  -> expected_score_range: 30-50
```

**Evaluation methodology:**
- Run each golden set test against the real LLM (in a dedicated CI step, not on every PR)
- Compare outputs using fuzzy matching (not exact string comparison)
- For structured data: field-by-field comparison with tolerance
- For free-text answers: LLM-as-judge evaluation (separate LLM call rates the output on relevance, accuracy, and tone)
- Track accuracy over time to detect prompt regressions

### 7.2 Confidence Scoring Tests

```python
class TestConfidenceScoring:
    """Verify confidence thresholds produce correct behavior."""

    @pytest.mark.parametrize("confidence,expected_action", [
        (0.95, "auto_fill"),           # High confidence -> auto-fill
        (0.85, "auto_fill_with_warn"), # Medium confidence -> fill with warning
        (0.65, "flag_for_review"),     # Low confidence -> pause for review
        (0.30, "skip"),                # Very low confidence -> skip
    ])
    def test_confidence_threshold_routing(self, confidence, expected_action):
        field = FormField(label="Salary", value="$120k", confidence=confidence)
        action = determine_field_action(field)
        assert action == expected_action

    def test_aggregate_confidence_below_threshold_triggers_review(self):
        """If average form confidence < 70%, trigger full form review."""
        fields = [
            FormField(label="Name", confidence=0.99),
            FormField(label="Email", confidence=0.99),
            FormField(label="Salary", confidence=0.40),
            FormField(label="Start Date", confidence=0.50),
        ]
        avg_confidence = sum(f.confidence for f in fields) / len(fields)
        assert avg_confidence < 0.70
        assert should_trigger_full_review(fields) is True
```

### 7.3 Model Routing Tests

```python
class TestModelRouting:
    """Verify correct LLM model selected per task type."""

    @pytest.mark.parametrize("task_type,expected_model", [
        ("form_analysis", "claude-sonnet-4-5"),      # Complex reasoning
        ("field_mapping", "gpt-4.1-mini"),            # Routine mapping
        ("confirmation_check", "gpt-4.1-nano"),       # Trivial yes/no
        ("resume_parsing", "claude-sonnet-4-5"),      # Complex extraction
        ("match_scoring", "gpt-4.1-mini"),            # Moderate reasoning
        ("screening_answer", "claude-sonnet-4-5"),    # Requires nuance
    ])
    def test_task_routes_to_correct_model(self, task_type, expected_model):
        router = LLMRouter(config=default_routing_config)
        model = router.select_model(task_type)
        assert model == expected_model

    def test_fallback_on_primary_failure(self):
        """If Claude API returns 5xx, fall back to GPT-4.1."""
        router = LLMRouter(config=default_routing_config)
        router.mock_response("claude-sonnet-4-5", status=503)
        result = router.complete("form_analysis", messages=[...])
        assert result.model_used == "gpt-4.1-mini"  # Fallback
```

### 7.4 Hallucination Detection Tests

Test for common LLM failure modes:

| Failure Mode | Test | Assertion |
|-------------|------|-----------|
| Invented work history | Parse resume with 2 jobs | Output has exactly 2 jobs, not 3+ |
| Wrong field mapping | Form has "Phone" field | Maps to phone, not email |
| Fabricated skills | Resume lists Python, Java | Output skills subset of resume skills |
| Incorrect dates | Resume says 2020-2023 | Output dates match (not 2019-2024) |
| Confidence inflation | Unknown field with no data | Confidence < 0.50 (not 0.90) |

### 7.5 Cost Tracking Tests

```python
class TestTokenUsageTracking:
    """Verify token usage and cost are accurately tracked."""

    def test_token_count_logged_per_request(self, mock_llm):
        mock_llm.set_response(input_tokens=500, output_tokens=200)
        router = LLMRouter()
        router.complete("form_analysis", messages=[...])

        log = router.get_usage_log()[-1]
        assert log["input_tokens"] == 500
        assert log["output_tokens"] == 200
        assert log["model"] == "claude-sonnet-4-5"
        assert log["cost_usd"] == pytest.approx(0.0049, abs=0.001)  # Based on pricing

    def test_budget_enforcement_blocks_over_limit(self):
        """User on free tier cannot exceed $1/day in LLM costs."""
        router = LLMRouter(daily_budget_usd=1.00)
        # Simulate $0.99 already spent
        router._spent_today = 0.99
        with pytest.raises(BudgetExceededError):
            router.complete("resume_parsing", messages=[...])
```

---

## 8. Performance Testing

### 8.1 Performance Targets (from PRD Section 8)

| Metric | Target | Test Method |
|--------|--------|-------------|
| Application completion time (LinkedIn) | < 3 min (p95) | Timed E2E test with mock page |
| Application completion time (Greenhouse/Lever) | < 5 min (p95) | Timed E2E test with mock page |
| API response time (non-automation) | < 500ms (p95) | k6 load test |
| API response time (task creation) | < 2s (p95) | k6 load test |
| WebSocket message latency | < 200ms | Integration test with timing |
| Resume parsing time | < 10s | Timed unit test |
| noVNC connection establishment | < 3s | Integration test with timing |
| Kill switch response time | < 2s | Timed E2E test |
| Onboarding completion | < 90s | Timed E2E test |
| Platform detection | < 500ms | Unit test with timing |

### 8.2 Load Testing (k6)

**Tool:** k6 (Grafana Labs) -- scriptable, developer-friendly, outputs to Prometheus/Grafana

**Scenarios:**

#### Scenario 1: Steady State (Normal Load)

```javascript
// k6-steady-state.js
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 concurrent users
    { duration: '10m', target: 50 },   // Hold at 50 for 10 minutes
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],   // p95 < 500ms
    http_req_failed: ['rate<0.01'],     // < 1% error rate
    ws_connecting: ['p(95)<1000'],      // WebSocket connects in < 1s
  },
};

export default function () {
  // Simulate: login -> create task -> poll status -> view history
  const token = login();
  const task = createTask(token, randomJobUrl());
  pollTaskStatus(token, task.id, { maxWait: '3m' });
  viewDashboard(token);
  sleep(randomInt(5, 15)); // Think time
}
```

#### Scenario 2: Burst (Autopilot Batch)

```javascript
// k6-burst.js - Simulate 10 users submitting 25-URL batches simultaneously
export const options = {
  scenarios: {
    batch_submit: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 1,
      maxDuration: '10m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // Task creation can be slower
    http_req_failed: ['rate<0.05'],      // < 5% error rate under burst
  },
};
```

#### Scenario 3: WebSocket Sustained Connections

```javascript
// k6-websocket.js - 200 concurrent WebSocket connections
export const options = {
  scenarios: {
    websocket_load: {
      executor: 'constant-vus',
      vus: 200,
      duration: '5m',
    },
  },
};

export default function () {
  const ws = connectWebSocket(taskId);
  // Measure message delivery latency
  ws.onMessage((msg) => {
    const latency = Date.now() - msg.serverTimestamp;
    wsLatency.add(latency);
  });
}
```

### 8.3 Browser Memory Profiling

**Tool:** Playwright + Chrome DevTools Protocol

```python
async def test_browser_memory_does_not_leak():
    """AdsPower profile memory should not grow unbounded during a session."""
    page = await launch_adspower_profile()
    initial_memory = await get_js_heap_size(page)

    # Simulate 10 consecutive applications
    for i in range(10):
        await navigate_to_mock_job(page)
        await fill_mock_form(page)
        await submit_mock_form(page)

    final_memory = await get_js_heap_size(page)
    memory_growth = final_memory - initial_memory

    # Memory should not grow more than 50MB over 10 applications
    assert memory_growth < 50 * 1024 * 1024, f"Memory grew by {memory_growth / 1024 / 1024:.1f}MB"
```

### 8.4 Queue Depth Testing

Test system behavior when the task queue backs up:

| Queue Depth | Expected Behavior |
|------------|-------------------|
| 0-10 | Normal processing, < 30s queue wait |
| 10-50 | Acceptable processing, estimated wait shown to user |
| 50-100 | Warning: "High demand -- your application may take longer" |
| 100+ | Rate limiting kicks in, new tasks rejected with 429 |

---

## 9. Security Testing

### 9.1 Authentication & Authorization

| Test | Method | Expected Result |
|------|--------|-----------------|
| Request without JWT | Send API request with no Authorization header | 401 Unauthorized |
| Expired JWT | Use token with `exp` in the past | 401 Unauthorized |
| Malformed JWT | Tamper with JWT payload | 401 Unauthorized |
| Wrong signing key | Sign JWT with different RS256 key | 401 Unauthorized |
| Valid JWT, wrong user_id in path | GET `/api/v1/tasks/{other_user_task_id}` | 404 Not Found (not 403) |
| Refresh token reuse | Use same refresh token twice | Second use invalidates both |
| PKCE verification | OAuth without code_verifier | 400 Bad Request |

### 9.2 Row-Level Security (RLS)

```python
class TestRLSSecurity:
    """Exhaustive RLS testing for all data tables."""

    TABLES_WITH_RLS = [
        "tasks", "resumes", "screening_answers", "consent_records",
        "application_results", "task_events", "browser_profiles",
    ]

    @pytest.mark.parametrize("table", TABLES_WITH_RLS)
    async def test_cross_user_read_blocked(self, table, user_a_session, user_b_data):
        """User A cannot SELECT User B's rows in any table."""
        rows = await user_a_session.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE user_id = :uid"),
            {"uid": user_b_data["user_id"]}
        )
        assert rows.scalar() == 0

    @pytest.mark.parametrize("table", TABLES_WITH_RLS)
    async def test_cross_user_update_blocked(self, table, user_a_session, user_b_data):
        """User A cannot UPDATE User B's rows."""
        result = await user_a_session.execute(
            text(f"UPDATE {table} SET updated_at = NOW() WHERE user_id = :uid"),
            {"uid": user_b_data["user_id"]}
        )
        assert result.rowcount == 0

    @pytest.mark.parametrize("table", TABLES_WITH_RLS)
    async def test_cross_user_delete_blocked(self, table, user_a_session, user_b_data):
        """User A cannot DELETE User B's rows."""
        result = await user_a_session.execute(
            text(f"DELETE FROM {table} WHERE user_id = :uid"),
            {"uid": user_b_data["user_id"]}
        )
        assert result.rowcount == 0
```

### 9.3 Input Validation

| Attack Vector | Input | Expected | Test |
|--------------|-------|----------|------|
| SQL injection in job URL | `'; DROP TABLE tasks; --` | 422 Validation Error | API test |
| XSS in job URL | `javascript:alert(1)` | 422 Validation Error | API test |
| XSS in Q&A answer | `<script>alert(1)</script>` | Stored as plain text, rendered escaped | Frontend test |
| Path traversal in resume upload | `../../etc/passwd` filename | Filename sanitized | API test |
| Oversized resume | 50MB PDF | 413 Payload Too Large | API test |
| SSRF via job URL | `http://169.254.169.254/...` | URL validation rejects private IPs | API test |
| JWT payload tampering | Change `user_id` in JWT body | Signature validation fails | API test |
| Prototype pollution | `{"__proto__": {"admin": true}}` | Ignored by Pydantic | API test |

### 9.4 Rate Limiting Verification

```python
class TestRateLimiting:
    async def test_api_rate_limit_enforced(self, client, valid_token):
        """100 requests/min per user, 101st returns 429."""
        for i in range(100):
            resp = await client.get("/api/v1/tasks", headers=auth(valid_token))
            assert resp.status_code == 200

        resp = await client.get("/api/v1/tasks", headers=auth(valid_token))
        assert resp.status_code == 429
        assert "Retry-After" in resp.headers

    async def test_platform_rate_limit_linkedin(self, client, valid_token):
        """LinkedIn capped at 25 applications/day in Copilot mode."""
        for i in range(25):
            resp = await client.post("/api/v1/tasks", json={
                "job_url": f"https://linkedin.com/jobs/view/{1000+i}",
                "mode": "copilot"
            }, headers=auth(valid_token))
            assert resp.status_code == 202

        resp = await client.post("/api/v1/tasks", json={
            "job_url": "https://linkedin.com/jobs/view/9999",
            "mode": "copilot"
        }, headers=auth(valid_token))
        assert resp.status_code == 429
        assert "daily LinkedIn limit" in resp.json()["detail"].lower()
```

### 9.5 Credential Security

| Test | Assertion |
|------|-----------|
| Proxy passwords in DB | Encrypted with AES-256 (not plaintext) |
| PII in application logs | Grep all log files for email/phone patterns -> 0 matches |
| PII in LLM prompts | Audit prompt templates for unnecessary PII inclusion |
| Secrets in frontend bundle | `grep -r "API_KEY\|SECRET\|PASSWORD" dist/` -> 0 matches |
| ENV vars in Docker image | `docker history` shows no secret build args |
| Screenshot PII acknowledgment | Privacy policy section on screenshots exists |

### 9.6 GDPR Compliance Tests

```python
class TestGDPREndpoints:
    async def test_data_export(self, client, user_token, seeded_user_data):
        """GDPR Article 20: User can export all their data."""
        resp = await client.get("/api/v1/users/export", headers=auth(user_token))
        assert resp.status_code == 200
        data = resp.json()
        assert "profile" in data
        assert "applications" in data
        assert "screening_answers" in data
        assert "consent_records" in data
        assert "resumes" in data

    async def test_account_deletion(self, client, user_token, seeded_user_data):
        """GDPR Article 17: User can delete all their data."""
        resp = await client.delete("/api/v1/users/me", headers=auth(user_token))
        assert resp.status_code == 200

        # Verify all data deleted
        for table in ["tasks", "resumes", "screening_answers", "consent_records"]:
            count = await count_rows(table, user_id=seeded_user_data["user_id"])
            assert count == 0

    async def test_consent_record_immutability(self, db_session, user):
        """Consent records cannot be modified or deleted."""
        consent = await create_consent(db_session, user_id=user.id, type="copilot_disclaimer")

        with pytest.raises(Exception):  # DB constraint violation
            await db_session.execute(
                text("UPDATE consent_records SET version = '2.0' WHERE id = :id"),
                {"id": consent.id}
            )

        with pytest.raises(Exception):
            await db_session.execute(
                text("DELETE FROM consent_records WHERE id = :id"),
                {"id": consent.id}
            )
```

---

## 10. Visual Regression Testing

### 10.1 Strategy

**Tool:** Playwright screenshot comparison or Chromatic (Storybook-based)

**What to capture:**
- Every page in all states (empty, loading, populated, error)
- Every modal (consent forms, VNC viewer, error dialogs)
- Responsive breakpoints (mobile 375px, tablet 768px, desktop 1440px)
- Dark mode + light mode variants
- Copilot (blue) vs Autopilot (purple) mode indicators

### 10.2 Key Visual Tests

| Page/Component | States | Total Snapshots |
|----------------|--------|-----------------|
| Login page | Default, loading, error | 3 |
| Onboarding (3 steps) | Each step | 3 |
| Apply page | Empty, URL entered, job preview, progress, complete, error | 6 |
| Dashboard | Empty, 1 app, 50 apps, filters applied | 4 |
| Settings | Profile, Preferences, Automation (locked AP), Account | 4 |
| VNC modal | Active, countdown, timeout | 3 |
| Kill switch | Active state, post-stop | 2 |
| Consent form | Empty, partially filled, complete | 3 |
| **Total** | | **28 base x 2 (light/dark) = 56** |

### 10.3 Threshold Configuration

- **Pixel diff threshold:** 0.1% (allows anti-aliasing differences)
- **Review required:** Any diff > 0.1% blocks PR merge until approved
- **Snapshot update:** `npx playwright test --update-snapshots` (requires manual approval in PR review)

---

## 11. CI/CD Pipeline Design

### 11.1 Pipeline Stages

```
PR Created / Push to Branch
         |
         v
  [Stage 1: Static Analysis]  (~1 min, parallel)
    |- ESLint (frontend)
    |- TypeScript strict (tsc --noEmit)
    |- Ruff (Python linter)
    |- mypy (Python type checker)
    |- Prettier check (formatting)
    |- Dependency audit (npm audit, pip-audit)
         |
         v
  [Stage 2: Unit Tests]  (~2 min, parallel by component)
    |- Frontend unit tests (Vitest, ~500 tests)
    |- Backend unit tests (pytest, ~300 tests)
    |- Core unit tests (pytest, ~200 tests)
         |
         v
  [Stage 3: Integration Tests]  (~5 min, parallel groups)
    |- DB integration (testcontainers + PostgreSQL)
    |- API integration (FastAPI + test DB)
    |- WebSocket integration (Redis + WS client)
    |- Worker integration (mock Stagehand + mock pages)
         |
         v
  [Stage 4: E2E Tests]  (~8 min, parallel shards)
    |- Shard 1: Auth + Onboarding flows (5 tests)
    |- Shard 2: Apply + Progress flows (5 tests)
    |- Shard 3: Dashboard + Settings flows (5 tests)
    |- Shard 4: Error recovery + Kill switch (5 tests)
         |
         v
  [Stage 5: Build + Security Scan]  (~3 min)
    |- Frontend production build (vite build)
    |- Backend Docker image build
    |- OWASP dependency check
    |- Container vulnerability scan (Trivy)
         |
         v
  [Stage 6: Deploy Preview]  (~2 min)
    |- Deploy to ephemeral preview environment
    |- Comment PR with preview URL
         |
         v
  [Manual: Visual QA]
    |- Screenshot review (if visual diffs detected)
    |- Manual testing of new UI (for reviewer)
```

### 11.2 GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      matrix:
        check: [eslint, tsc, ruff, mypy, prettier, audit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip }
      - run: npm ci && pip install -r requirements-dev.txt
      - run: |
          case "${{ matrix.check }}" in
            eslint)    npx eslint src/ --max-warnings 0 ;;
            tsc)       npx tsc --noEmit ;;
            ruff)      ruff check backend/ ;;
            mypy)      mypy backend/ --strict ;;
            prettier)  npx prettier --check "src/**/*.{ts,tsx}" ;;
            audit)     npm audit --audit-level=high && pip-audit ;;
          esac

  unit-tests:
    needs: static-analysis
    runs-on: ubuntu-latest
    timeout-minutes: 10
    strategy:
      matrix:
        component: [frontend, backend, core]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        if: matrix.component == 'frontend'
        with: { node-version: 20, cache: npm }
      - uses: actions/setup-python@v5
        if: matrix.component != 'frontend'
        with: { python-version: "3.12", cache: pip }
      - run: |
          case "${{ matrix.component }}" in
            frontend)  npm ci && npx vitest run --coverage ;;
            backend)   pip install -r requirements-dev.txt && pytest tests/unit/backend/ -v --cov ;;
            core)      pip install -r requirements-dev.txt && pytest tests/unit/core/ -v --cov ;;
          esac
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-${{ matrix.component }}
          path: coverage/

  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    timeout-minutes: 15
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: wekruit_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip }
      - run: pip install -r requirements-dev.txt
      - run: alembic upgrade head
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/wekruit_test
      - run: pytest tests/integration/ -v --timeout=60
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/wekruit_test
          REDIS_URL: redis://localhost:6379

  e2e-tests:
    needs: integration-tests
    runs-on: ubuntu-latest
    timeout-minutes: 20
    strategy:
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci && npx playwright install --with-deps chromium
      - run: npx playwright test --shard=${{ matrix.shard }}/4
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-traces-${{ matrix.shard }}
          path: test-results/

  build-and-scan:
    needs: e2e-tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: docker build -t wekruit-backend:${{ github.sha }} .
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: wekruit-backend:${{ github.sha }}
          severity: CRITICAL,HIGH
          exit-code: 1
```

### 11.3 Pipeline Timing Budget

| Stage | Target | Parallel? |
|-------|--------|-----------|
| Static analysis | < 2 min | Yes (6-way matrix) |
| Unit tests | < 3 min | Yes (3-way matrix) |
| Integration tests | < 8 min | Partially |
| E2E tests | < 10 min | Yes (4-way sharding) |
| Build + scan | < 5 min | Sequential |
| **Total wall-clock** | **< 20 min** | |

### 11.4 Merge Requirements

- All CI stages green
- At least 1 approval from a code reviewer
- No unresolved "High" or "Critical" security findings
- Visual regression snapshots reviewed (if changed)
- Coverage does not decrease (enforced via coverage report comparison)

---

## 12. Test Data Strategy

### 12.1 Fixtures (Static Test Data)

```
/test-fixtures/
  /resumes/
    software_engineer_2yoe.pdf
    software_engineer_10yoe.pdf
    marketing_manager.pdf
    fresh_graduate.pdf
    career_changer.pdf
    non_latin_name.pdf                # Unicode edge case
    corrupt_pdf.pdf                   # For error handling tests
    oversized_50mb.pdf                # For size limit tests
  /parsed-resumes/
    software_engineer_2yoe.json       # Expected parse output
    software_engineer_10yoe.json
    ...
  /job-urls/
    valid_linkedin_urls.json          # 50 valid LinkedIn URLs
    valid_greenhouse_urls.json
    valid_lever_urls.json
    invalid_urls.json                 # Malformed, unsupported platforms
  /qa-bank/
    standard_answers.json             # 25 common Q&A pairs
    edge_case_answers.json            # Unusual questions
  /llm-responses/
    form_analysis_linkedin.json       # Recorded LLM response
    form_analysis_greenhouse.json
    resume_parse_response.json
    match_score_response.json
  /mock-ats-pages/
    (HTML files as described in Section 6.1)
```

### 12.2 Factory Pattern (Dynamic Test Data)

```python
# tests/factories.py
import factory
from factory.alchemy import SQLAlchemyModelFactory

class UserFactory(SQLAlchemyModelFactory):
    class Meta:
        model = User
        sqlalchemy_session_persistence = "commit"

    email = factory.Sequence(lambda n: f"testuser{n}@example.com")
    name = factory.Faker("name")
    google_id = factory.Sequence(lambda n: f"google-{n}")
    created_at = factory.LazyFunction(datetime.utcnow)

class ResumeFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Resume

    user = factory.SubFactory(UserFactory)
    filename = factory.Faker("file_name", extension="pdf")
    parsed_data = factory.LazyAttribute(lambda _: {
        "name": "Test User",
        "email": "test@example.com",
        "phone": "(555) 000-0000",
        "skills": ["Python", "JavaScript"],
        "experience": [{"company": "Acme Corp", "title": "Engineer", "years": 3}],
    })

class TaskFactory(SQLAlchemyModelFactory):
    class Meta:
        model = Task

    user = factory.SubFactory(UserFactory)
    job_url = factory.Sequence(lambda n: f"https://linkedin.com/jobs/view/{10000+n}")
    platform = "linkedin"
    status = "CREATED"
    mode = "copilot"

class ApplicationResultFactory(SQLAlchemyModelFactory):
    class Meta:
        model = ApplicationResult

    task = factory.SubFactory(TaskFactory)
    status = "completed"
    job_title = factory.Faker("job")
    company = factory.Faker("company")
    submitted_at = factory.LazyFunction(datetime.utcnow)
    confidence_avg = factory.Faker("pyfloat", min_value=0.7, max_value=1.0)
```

### 12.3 Seed Scripts

```python
# scripts/seed_dev_db.py
"""Populate development database with realistic test data."""

async def seed():
    # Create test users
    user_copilot = await UserFactory.create(email="copilot@test.com", name="Alice Copilot")
    user_autopilot = await UserFactory.create(email="autopilot@test.com", name="Bob Autopilot")
    user_empty = await UserFactory.create(email="empty@test.com", name="Charlie Empty")

    # Alice: 5 completed copilot applications (ready for autopilot unlock)
    resume_a = await ResumeFactory.create(user=user_copilot)
    for i in range(5):
        task = await TaskFactory.create(user=user_copilot, status="COMPLETED", mode="copilot")
        await ApplicationResultFactory.create(task=task, status="completed")

    # Bob: 10 completed (5 copilot + 5 autopilot), 2 failed
    resume_b = await ResumeFactory.create(user=user_autopilot)
    for i in range(5):
        task = await TaskFactory.create(user=user_autopilot, status="COMPLETED", mode="copilot")
        await ApplicationResultFactory.create(task=task)
    for i in range(5):
        task = await TaskFactory.create(user=user_autopilot, status="COMPLETED", mode="autopilot")
        await ApplicationResultFactory.create(task=task)
    for i in range(2):
        task = await TaskFactory.create(user=user_autopilot, status="FAILED", mode="autopilot")

    # Consent records
    await create_consent(user_copilot.id, "copilot_disclaimer", "1.0")
    await create_consent(user_autopilot.id, "copilot_disclaimer", "1.0")
    await create_consent(user_autopilot.id, "autopilot_consent", "1.0")

    # Q&A bank for Alice
    await seed_standard_qa_bank(user_copilot.id)

    print(f"Seeded: 3 users, 12 tasks, 10 results, 3 consent records")
```

### 12.4 Mock Services

| Service | Mock Implementation | Used In |
|---------|-------------------|---------|
| **LLM (LiteLLM)** | VCR-style response recording/replay | Unit + Integration |
| **AdsPower API** | HTTP mock server returning preset profile/CDP URLs | Integration |
| **Stagehand** | Configurable mock client (Section 6.3) | Unit + Integration |
| **Magnitude** | Stub that always succeeds (for fallback testing) | Integration |
| **noVNC/websockify** | Mock WebSocket that sends test frames | Integration |
| **Novu** | In-memory notification store | Integration |
| **S3 (MinIO)** | MinIO container in CI | Integration |
| **Google OAuth** | Mock OAuth server returning preset tokens | E2E |
| **Proxy health check** | Always-healthy mock | Unit |

---

## 13. Quality Gate Mapping

The PRD defines 9 quality gates for v1.0 launch (Section 9.4) and the updated roadmap adds Autopilot quality gates. Each gate maps to specific automated tests.

### 13.1 Copilot Quality Gates (v1.0 Launch)

| # | Quality Gate | Target | Test Type | Automated Test |
|---|-------------|--------|-----------|----------------|
| QG1 | Application success rate | >= 80% across 100+ apps | Performance + Smoke | `test_application_success_rate.py` -- run 100 mock applications, assert >= 80 succeed |
| QG2 | Average application time (LinkedIn) | < 3 minutes | Performance | `test_application_timing.py` -- timed mock LinkedIn flow, p95 < 180s |
| QG3 | Form filling accuracy | >= 95% | Unit + Integration | `test_form_filling_accuracy.py` -- 200 field scenarios, >= 190 correct |
| QG4 | CAPTCHA detection rate | >= 95% | Unit + Integration | `test_captcha_detection.py` -- 50 mock CAPTCHA variants, >= 48 detected (PRD says >= 95%, Autopilot raises to >= 99%) |
| QG5 | Crash recovery success | >= 95% | Integration | `test_crash_recovery.py` -- simulate crashes at every workflow step, >= 95% resume successfully |
| QG6 | Zero PII leaks in logs | 0 incidents | Security | `test_pii_in_logs.py` -- regex scan all log output for email/phone/SSN patterns |
| QG7 | All security tests pass | 0 high/critical vulns | Security | Full security test suite (Section 9) green |
| QG8 | p95 API latency | < 500ms | Performance (k6) | k6 steady-state scenario, threshold assertion |
| QG9 | WebSocket update latency | < 200ms | Integration | `test_websocket_latency.py` -- 1000 messages, p95 < 200ms |

### 13.2 Autopilot Quality Gates (Phase 4-5)

| # | Quality Gate | Target | Test Type | Automated Test |
|---|-------------|--------|-----------|----------------|
| QG-AP1 | Pre-submit field accuracy | >= 98% | Unit + Integration | Higher threshold than Copilot (since no human review) |
| QG-AP2 | Circuit breaker triggers | On 3 consecutive failures | Unit | `test_circuit_breaker.py` -- 3 failures -> open state |
| QG-AP3 | Kill switch response | < 2 seconds | E2E | `test_kill_switch_timing.py` -- measure click-to-cancel latency |
| QG-AP4 | Consent versioning | Re-consent on version change | Integration | `test_consent_versioning.py` -- old consent invalidated on version bump |
| QG-AP5 | GDPR Article 22 audit trail | Every automated decision logged | Integration | `test_audit_trail_completeness.py` -- verify every field has model + reasoning |
| QG-AP6 | Daily rate limits enforced | LinkedIn 25/day, total varies by tier | Integration | `test_daily_rate_limits.py` |

### 13.3 Quality Gate CI Integration

Quality gate tests run in a dedicated weekly CI job (not on every PR, since they require longer execution):

```yaml
# .github/workflows/quality-gates.yml
name: Quality Gate Verification

on:
  schedule:
    - cron: '0 6 * * 1'  # Every Monday at 6 AM UTC
  workflow_dispatch:       # Manual trigger

jobs:
  quality-gates:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker-compose.test.yml up -d
      - run: python -m pytest tests/quality_gates/ -v --tb=short --junitxml=quality-gates.xml
      - run: python scripts/quality_gate_report.py quality-gates.xml
      # Outputs a summary table and posts to Slack
```

---

## 14. Test Tooling Recommendations

### 14.1 Tooling Matrix

| Category | Tool | Purpose | License |
|----------|------|---------|---------|
| **Frontend Unit** | Vitest | Component + logic tests | MIT |
| **Frontend Component** | React Testing Library | DOM interaction testing | MIT |
| **Frontend Visual** | Playwright Screenshots | Visual regression | Apache 2.0 |
| **Frontend Storybook** | Storybook 8 | Component catalog + visual tests | MIT |
| **Backend Unit** | pytest + pytest-asyncio | Async Python tests | MIT |
| **Backend Coverage** | pytest-cov | Coverage reporting | MIT |
| **Backend Fixtures** | factory_boy | Test data generation | MIT |
| **Database** | testcontainers-python | PostgreSQL containers in CI | Apache 2.0 |
| **E2E** | Playwright (TypeScript) | Full user flow tests | Apache 2.0 |
| **Performance** | k6 | Load testing | AGPL-3.0 (SaaS-safe) |
| **Security Scanning** | Trivy | Container + dependency vulns | Apache 2.0 |
| **Security Testing** | OWASP ZAP | DAST scanning | Apache 2.0 |
| **LLM Response Mocking** | vcrpy / responses | Record/replay HTTP | MIT |
| **API Mocking (Frontend)** | MSW (Mock Service Worker) | Browser-level API mocking | MIT |
| **CI/CD** | GitHub Actions | Pipeline orchestration | N/A |
| **Monitoring** | Sentry + Grafana | Error tracking + dashboards | Various |

### 14.2 Development Environment Testing

Every developer should be able to run the full test suite locally:

```bash
# Quick unit tests (< 30 seconds)
npm run test              # Frontend (Vitest)
pytest tests/unit/ -x     # Backend (pytest, stop on first failure)

# Integration tests (requires Docker)
docker compose -f docker-compose.test.yml up -d
pytest tests/integration/ -v

# E2E tests (requires running app)
npm run dev &             # Start frontend
uvicorn app.main:app &    # Start backend
npx playwright test       # Run E2E suite

# Full CI simulation
make ci                   # Runs all stages sequentially
```

---

## 15. Phase-Aligned Test Plan

### Phase 0 (Weeks 1-2): Foundation

| Test | Type | Owned By | Priority |
|------|------|----------|----------|
| Auth store tests | Unit | Frontend | P0 |
| OAuth flow test | Integration | Backend | P0 |
| Database migration test | Integration | Backend | P0 |
| AdsPower client tests | Unit | Core | P0 |
| CDP connection test | Integration | Core | P0 |
| LLM router model selection | Unit | Core | P0 |
| Docker compose smoke test | E2E | Infra | P0 |
| CI pipeline green | Infra | Infra | P0 |

### Phase 1 (Weeks 3-5): Copilot Core

| Test | Type | Owned By | Priority |
|------|------|----------|----------|
| Resume upload/parse tests | Unit + Integration | Backend + Core | P0 |
| Platform detection tests | Unit | Frontend | P0 |
| Form analyzer golden set | Unit | Core | P0 |
| Form filler accuracy (50 fields) | Integration | Core | P0 |
| Task creation + workflow | Integration | Backend | P0 |
| WebSocket progress delivery | Integration | Backend | P0 |
| Apply page component tests | Unit | Frontend | P0 |
| Progress panel component tests | Unit | Frontend | P0 |
| LinkedIn mock page tests (20 scenarios) | Integration | Core | P0 |

### Phase 2 (Weeks 6-8): Dashboard + HITL

| Test | Type | Owned By | Priority |
|------|------|----------|----------|
| Dashboard component tests | Unit | Frontend | P0 |
| CAPTCHA detection tests (all types) | Unit + Integration | Core | P0 |
| noVNC viewer tests | Unit | Frontend | P0 |
| Kill switch timing test | Integration + E2E | Frontend + Backend | P0 |
| Error recovery scenarios | Integration | Core + Backend | P0 |
| Novu notification delivery | Integration | Backend | P1 |
| Settings page tests | Unit | Frontend | P1 |
| Rate limiting tests | Integration | Backend | P0 |

### Phase 3 (Weeks 9-10): QA + Beta

| Test | Type | Owned By | Priority |
|------|------|----------|----------|
| Full E2E suite (20 flows) | E2E | QA | P0 |
| Security audit (OWASP Top 10) | Security | Backend + Infra | P0 |
| RLS exhaustive tests | Security | Backend | P0 |
| Performance baseline (k6) | Performance | Infra | P0 |
| Visual regression baseline | Visual | Frontend | P1 |
| Quality gates QG1-QG9 | Quality | All | P0 |
| PII leak scan | Security | All | P0 |
| 50+ mock LinkedIn runs | Performance | Core | P0 |

### Phase 4-5 (Weeks 11-18): Autopilot

| Test | Type | Owned By | Priority |
|------|------|----------|----------|
| Circuit breaker tests | Unit | Backend | P0 |
| Autopilot consent flow E2E | E2E | Frontend + Backend | P0 |
| Progressive trust gate | Integration | Backend | P0 |
| Quality gate enforcement (AP) | Integration | Backend | P0 |
| Batch processing tests | Integration + E2E | Backend + Core | P0 |
| GDPR audit trail completeness | Integration | Backend | P0 |
| Mode switching tests | E2E | Frontend | P0 |
| Autopilot quality gates QG-AP1-AP6 | Quality | All | P0 |

---

## Appendix: Example Test Code

### Example 1: Form Filling Accuracy Test (Critical -- Integration)

This test validates that the form analyzer + filler correctly fills a mock LinkedIn Easy Apply form.

```python
# tests/integration/test_form_filling_accuracy.py
"""
Form Filling Accuracy Tests
============================
Validates the core value proposition: given a user profile and a mock ATS form,
the system correctly fills all fields with the right values.

Uses mock ATS pages served locally. No real LinkedIn/Greenhouse/Lever/Workday.
"""

import pytest
from playwright.async_api import async_playwright, Page
from pathlib import Path

MOCK_PAGES_DIR = Path(__file__).parent.parent / "fixtures" / "mock-ats-pages"

# Test user profile used for all form filling tests
TEST_PROFILE = {
    "first_name": "Alice",
    "last_name": "Johnson",
    "email": "alice.johnson@example.com",
    "phone": "(555) 867-5309",
    "location": "San Francisco, CA",
    "linkedin_url": "https://linkedin.com/in/alicejohnson",
    "years_experience": 7,
    "work_authorization": True,
    "requires_sponsorship": False,
    "expected_salary": "$150,000",
    "start_date": "2 weeks notice",
    "willing_to_relocate": True,
}

TEST_QA_BANK = {
    "Are you authorized to work in the United States?": "Yes",
    "Will you now or in the future require sponsorship?": "No",
    "How many years of experience do you have with Python?": "7",
    "What is your expected salary range?": "$140,000 - $160,000",
    "When can you start?": "2 weeks after accepting an offer",
}


@pytest.fixture
async def browser_page():
    """Launch a Playwright browser for form filling tests."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        yield page
        await browser.close()


@pytest.fixture
def form_analyzer():
    """Create a FormAnalyzer with mocked LLM responses."""
    from core.form_analyzer import FormAnalyzer
    from tests.mocks.llm import MockLLMRouter

    router = MockLLMRouter(responses_file="fixtures/llm-responses/form_analysis_linkedin.json")
    return FormAnalyzer(llm_router=router)


@pytest.fixture
def form_filler():
    """Create a FormFiller with human-like delays disabled for speed."""
    from core.form_filler import FormFiller
    return FormFiller(delay_range=(0, 0))  # No delays in tests


class TestLinkedInEasyApplyFormFilling:
    """Test form filling accuracy against mock LinkedIn Easy Apply pages."""

    async def test_single_page_easy_apply_all_fields_correct(
        self, browser_page: Page, form_analyzer, form_filler
    ):
        """Happy path: single-page Easy Apply with standard fields."""
        # 1. Load mock page
        await browser_page.goto(
            f"file://{MOCK_PAGES_DIR}/linkedin/easy-apply-single-page.html"
        )

        # 2. Analyze form
        dom_snapshot = await browser_page.content()
        field_mappings = await form_analyzer.analyze(
            dom_snapshot=dom_snapshot,
            user_profile=TEST_PROFILE,
            qa_bank=TEST_QA_BANK,
        )

        # 3. Fill form
        fill_results = await form_filler.fill(browser_page, field_mappings)

        # 4. Extract filled values from the page
        filled_values = await browser_page.evaluate("""() => {
            const inputs = document.querySelectorAll('input, select, textarea');
            const values = {};
            inputs.forEach(input => {
                if (input.type === 'radio' || input.type === 'checkbox') {
                    if (input.checked) values[input.name] = input.value;
                } else {
                    values[input.name || input.id] = input.value;
                }
            });
            return values;
        }""")

        # 5. Assert every field is correct
        assert filled_values["firstName"] == "Alice"
        assert filled_values["lastName"] == "Johnson"
        assert filled_values["email"] == "alice.johnson@example.com"
        assert filled_values["phone"] == "(555) 867-5309"
        assert filled_values["linkedin"] == "https://linkedin.com/in/alicejohnson"

        # 6. Assert confidence scores are reasonable
        for mapping in field_mappings:
            if mapping.source == "user_profile":
                assert mapping.confidence >= 0.90, (
                    f"Profile field '{mapping.field_label}' should have high confidence, "
                    f"got {mapping.confidence}"
                )

        # 7. Assert all fields were filled (no misses)
        assert all(r.success for r in fill_results), (
            f"Failed fields: {[r.field_label for r in fill_results if not r.success]}"
        )

    async def test_multi_step_easy_apply_navigation(
        self, browser_page: Page, form_analyzer, form_filler
    ):
        """Multi-step Easy Apply: 3 modal pages with Next buttons."""
        await browser_page.goto(
            f"file://{MOCK_PAGES_DIR}/linkedin/easy-apply-multi-step.html"
        )

        steps_completed = 0
        total_fields_filled = 0

        # Process each step of the multi-step form
        for step in range(3):
            dom_snapshot = await browser_page.content()
            field_mappings = await form_analyzer.analyze(
                dom_snapshot=dom_snapshot,
                user_profile=TEST_PROFILE,
                qa_bank=TEST_QA_BANK,
            )
            fill_results = await form_filler.fill(browser_page, field_mappings)

            total_fields_filled += len(fill_results)
            steps_completed += 1

            # Click "Next" (or "Submit" on last step)
            next_button = await browser_page.query_selector(
                'button[aria-label="Continue to next step"], '
                'button[aria-label="Submit application"]'
            )
            if next_button:
                await next_button.click()
                await browser_page.wait_for_load_state("networkidle")

        assert steps_completed == 3
        assert total_fields_filled >= 8  # Minimum expected fields across all steps

    async def test_screening_questions_from_qa_bank(
        self, browser_page: Page, form_analyzer, form_filler
    ):
        """Screening questions matched from Q&A bank, not hallucinated."""
        await browser_page.goto(
            f"file://{MOCK_PAGES_DIR}/linkedin/easy-apply-with-custom-questions.html"
        )

        dom_snapshot = await browser_page.content()
        field_mappings = await form_analyzer.analyze(
            dom_snapshot=dom_snapshot,
            user_profile=TEST_PROFILE,
            qa_bank=TEST_QA_BANK,
        )

        # Verify Q&A bank answers are used (not LLM-generated)
        qa_fields = [m for m in field_mappings if m.source == "qa_bank"]
        assert len(qa_fields) >= 2, "Expected at least 2 fields sourced from Q&A bank"

        for field in qa_fields:
            assert field.confidence >= 0.85, (
                f"Q&A bank field '{field.field_label}' should have high confidence"
            )

    @pytest.mark.parametrize("field_name,expected_value", [
        ("firstName", "Alice"),
        ("lastName", "Johnson"),
        ("email", "alice.johnson@example.com"),
        ("phone", "(555) 867-5309"),
    ])
    async def test_individual_field_accuracy(
        self, browser_page: Page, form_analyzer, form_filler,
        field_name: str, expected_value: str
    ):
        """Parameterized test for individual field accuracy."""
        await browser_page.goto(
            f"file://{MOCK_PAGES_DIR}/linkedin/easy-apply-single-page.html"
        )

        dom_snapshot = await browser_page.content()
        field_mappings = await form_analyzer.analyze(
            dom_snapshot=dom_snapshot,
            user_profile=TEST_PROFILE,
            qa_bank=TEST_QA_BANK,
        )
        await form_filler.fill(browser_page, field_mappings)

        actual_value = await browser_page.input_value(f'[name="{field_name}"], #{field_name}')
        assert actual_value == expected_value, (
            f"Field '{field_name}': expected '{expected_value}', got '{actual_value}'"
        )
```

### Example 2: XState Workflow State Machine Test (Critical -- Unit)

This test validates every state transition in the application workflow state machine.

```python
# tests/unit/core/test_application_state_machine.py
"""
Application Workflow State Machine Tests
=========================================
Validates the XState-modeled state machine that governs the lifecycle
of every job application. Tests every valid transition, guard condition,
and error path.

State diagram:
  idle -> initializing -> loading_page -> analyzing_form -> filling_form
    -> uploading_files -> checking_captcha -> [waiting_for_human]
    -> reviewing (Copilot) -> submitting -> verifying -> completed/failed
"""

import pytest
from core.state_machine import ApplicationStateMachine, State, Event


class TestHappyPathTransitions:
    """Test the golden path: every step succeeds, no CAPTCHA, Copilot mode."""

    def test_full_copilot_happy_path(self):
        """Complete Copilot flow: idle -> completed."""
        sm = ApplicationStateMachine(mode="copilot")
        assert sm.current_state == State.IDLE

        sm.send(Event.START)
        assert sm.current_state == State.INITIALIZING

        sm.send(Event.BROWSER_READY)
        assert sm.current_state == State.LOADING_PAGE

        sm.send(Event.PAGE_LOADED)
        assert sm.current_state == State.ANALYZING_FORM

        sm.send(Event.ANALYSIS_COMPLETE)
        assert sm.current_state == State.FILLING_FORM

        sm.send(Event.FORM_FILLED)
        assert sm.current_state == State.UPLOADING_FILES

        sm.send(Event.FILES_UPLOADED)
        assert sm.current_state == State.CHECKING_CAPTCHA

        sm.send(Event.NO_CAPTCHA)
        assert sm.current_state == State.REVIEWING  # Copilot pauses here

        sm.send(Event.USER_APPROVED)
        assert sm.current_state == State.SUBMITTING

        sm.send(Event.SUBMITTED)
        assert sm.current_state == State.VERIFYING

        sm.send(Event.VERIFIED)
        assert sm.current_state == State.COMPLETED

    def test_full_autopilot_happy_path(self):
        """Autopilot flow: skips REVIEWING state."""
        sm = ApplicationStateMachine(mode="autopilot")
        assert sm.current_state == State.IDLE

        sm.send(Event.START)
        sm.send(Event.BROWSER_READY)
        sm.send(Event.PAGE_LOADED)
        sm.send(Event.ANALYSIS_COMPLETE)
        sm.send(Event.FORM_FILLED)
        sm.send(Event.FILES_UPLOADED)
        sm.send(Event.NO_CAPTCHA)
        # In autopilot, goes directly to SUBMITTING (no review)
        assert sm.current_state == State.SUBMITTING

        sm.send(Event.SUBMITTED)
        sm.send(Event.VERIFIED)
        assert sm.current_state == State.COMPLETED


class TestCAPTCHAPath:
    """Test CAPTCHA detection and human takeover flow."""

    def test_captcha_detected_pauses_for_human(self):
        sm = ApplicationStateMachine(mode="copilot")
        sm.send(Event.START)
        sm.send(Event.BROWSER_READY)
        sm.send(Event.PAGE_LOADED)
        sm.send(Event.ANALYSIS_COMPLETE)
        sm.send(Event.FORM_FILLED)
        sm.send(Event.FILES_UPLOADED)
        sm.send(Event.CAPTCHA_DETECTED)
        assert sm.current_state == State.WAITING_FOR_HUMAN

    def test_human_resolves_captcha_resumes_flow(self):
        sm = ApplicationStateMachine(mode="copilot")
        # Progress to CAPTCHA state
        for event in [Event.START, Event.BROWSER_READY, Event.PAGE_LOADED,
                      Event.ANALYSIS_COMPLETE, Event.FORM_FILLED,
                      Event.FILES_UPLOADED, Event.CAPTCHA_DETECTED]:
            sm.send(event)
        assert sm.current_state == State.WAITING_FOR_HUMAN

        # Human resolves CAPTCHA
        sm.send(Event.HUMAN_RESOLVED)
        assert sm.current_state == State.REVIEWING  # Back to review (Copilot)

    def test_captcha_timeout_fails_application(self):
        sm = ApplicationStateMachine(mode="copilot")
        for event in [Event.START, Event.BROWSER_READY, Event.PAGE_LOADED,
                      Event.ANALYSIS_COMPLETE, Event.FORM_FILLED,
                      Event.FILES_UPLOADED, Event.CAPTCHA_DETECTED]:
            sm.send(event)

        sm.send(Event.TIMEOUT)
        assert sm.current_state == State.FAILED
        assert sm.failure_reason == "captcha_timeout"


class TestRetryAndRecovery:
    """Test retry logic and crash recovery."""

    def test_retry_on_form_fill_failure(self):
        """Form fill failure with attempts remaining triggers retry."""
        sm = ApplicationStateMachine(mode="copilot", max_retries=3)
        for event in [Event.START, Event.BROWSER_READY, Event.PAGE_LOADED,
                      Event.ANALYSIS_COMPLETE]:
            sm.send(event)
        assert sm.current_state == State.FILLING_FORM

        # First failure: retry
        sm.send(Event.ERROR)
        assert sm.current_state == State.FILLING_FORM  # Retrying
        assert sm.attempt_count == 2

    def test_max_retries_exceeded_fails(self):
        """After max retries, application fails."""
        sm = ApplicationStateMachine(mode="copilot", max_retries=3)
        for event in [Event.START, Event.BROWSER_READY, Event.PAGE_LOADED,
                      Event.ANALYSIS_COMPLETE]:
            sm.send(event)

        # Exhaust retries
        sm.send(Event.ERROR)  # attempt 2
        sm.send(Event.ERROR)  # attempt 3
        sm.send(Event.ERROR)  # attempt 4 -> max exceeded
        assert sm.current_state == State.FAILED
        assert sm.failure_reason == "max_retries_exceeded"

    def test_cancel_from_any_active_state(self):
        """CANCEL event transitions to CANCELLED from any active state."""
        for target_state in [State.INITIALIZING, State.LOADING_PAGE,
                             State.ANALYZING_FORM, State.FILLING_FORM,
                             State.SUBMITTING, State.REVIEWING]:
            sm = ApplicationStateMachine(mode="copilot")
            sm._force_state(target_state)  # Test helper
            sm.send(Event.CANCEL)
            assert sm.current_state == State.CANCELLED, (
                f"CANCEL from {target_state} should reach CANCELLED"
            )


class TestGuardConditions:
    """Test guard conditions that control state transitions."""

    def test_shouldRetry_guard_true_when_attempts_remaining(self):
        sm = ApplicationStateMachine(mode="copilot", max_retries=3)
        sm._attempt_count = 1
        assert sm._should_retry() is True

    def test_shouldRetry_guard_false_when_max_reached(self):
        sm = ApplicationStateMachine(mode="copilot", max_retries=3)
        sm._attempt_count = 3
        assert sm._should_retry() is False

    def test_hasCAPTCHA_guard_routes_to_human(self):
        sm = ApplicationStateMachine(mode="copilot")
        sm._captcha_detected = True
        assert sm._has_captcha() is True

    def test_isAutopilot_guard_skips_review(self):
        sm = ApplicationStateMachine(mode="autopilot")
        assert sm._is_autopilot() is True
        # In autopilot, NO_CAPTCHA should go to SUBMITTING, not REVIEWING

    def test_confidenceAboveThreshold_guard(self):
        sm = ApplicationStateMachine(mode="autopilot", confidence_threshold=0.90)
        sm._average_confidence = 0.95
        assert sm._confidence_above_threshold() is True

        sm._average_confidence = 0.85
        assert sm._confidence_above_threshold() is False


class TestInvalidTransitions:
    """Test that invalid events are rejected or ignored."""

    def test_cannot_submit_from_idle(self):
        sm = ApplicationStateMachine(mode="copilot")
        with pytest.raises(InvalidTransitionError):
            sm.send(Event.SUBMITTED)

    def test_cannot_approve_in_autopilot_mode(self):
        """USER_APPROVED event is invalid in autopilot (no review step)."""
        sm = ApplicationStateMachine(mode="autopilot")
        for event in [Event.START, Event.BROWSER_READY, Event.PAGE_LOADED,
                      Event.ANALYSIS_COMPLETE, Event.FORM_FILLED,
                      Event.FILES_UPLOADED, Event.NO_CAPTCHA]:
            sm.send(event)
        # In autopilot, we are already at SUBMITTING, not REVIEWING
        assert sm.current_state == State.SUBMITTING
        # USER_APPROVED is not valid here
        with pytest.raises(InvalidTransitionError):
            sm.send(Event.USER_APPROVED)
```

### Example 3: WebSocket Real-Time Progress E2E Test (Critical -- E2E)

This test validates the full user-visible flow from starting an application to seeing real-time progress updates in the browser.

```typescript
// tests/e2e/apply-flow.spec.ts
/**
 * E2E Test: Application Progress Flow
 * =====================================
 * Tests the complete apply flow from pasting a URL to seeing
 * real-time progress updates and final completion.
 *
 * WebSocket messages are mocked to ensure deterministic behavior.
 * The backend API is real (test instance) but the browser worker
 * is mocked -- we simulate its events via the WebSocket.
 */

import { test, expect, Page } from '@playwright/test';

// Mock WebSocket messages that simulate a successful application
const MOCK_WS_EVENTS = [
  { delay: 500,  data: { type: 'state_change', state: 'INITIALIZING', percent: 5 } },
  { delay: 1000, data: { type: 'state_change', state: 'LOADING_PAGE', percent: 15 } },
  { delay: 1500, data: { type: 'state_change', state: 'ANALYZING_FORM', percent: 25 } },
  { delay: 2000, data: { type: 'state_change', state: 'FILLING_FORM', percent: 40, step: 'Filling First Name...' } },
  { delay: 2200, data: { type: 'progress', percent: 45, step: 'Filling Last Name...' } },
  { delay: 2400, data: { type: 'progress', percent: 50, step: 'Filling Email...' } },
  { delay: 2600, data: { type: 'progress', percent: 55, step: 'Filling Phone...' } },
  { delay: 3000, data: { type: 'state_change', state: 'UPLOADING_FILES', percent: 65, step: 'Uploading resume...' } },
  { delay: 3500, data: { type: 'state_change', state: 'CHECKING_CAPTCHA', percent: 75 } },
  { delay: 3700, data: { type: 'state_change', state: 'SUBMITTING', percent: 85 } },
  { delay: 4000, data: { type: 'state_change', state: 'VERIFYING', percent: 95 } },
  { delay: 4500, data: { type: 'state_change', state: 'COMPLETED', percent: 100, result: {
    job_title: 'Senior Software Engineer',
    company: 'Acme Corp',
    screenshot_url: '/screenshots/mock-confirmation.png',
    confirmation_id: 'APP-12345',
  }}},
];

test.describe('Application Progress Flow', () => {

  test.beforeEach(async ({ page }) => {
    // Login with test user (mock OAuth)
    await page.goto('/login');
    await page.click('[data-testid="google-login-button"]');
    // Mock OAuth redirects back with test token
    await page.waitForURL('/dashboard');
  });

  test('happy path: paste URL -> progress -> completion', async ({ page }) => {
    // Mock the WebSocket connection
    await page.routeWebSocket(/\/ws\/tasks\//, (ws) => {
      // Send mock events on a schedule
      for (const event of MOCK_WS_EVENTS) {
        setTimeout(() => {
          ws.send(JSON.stringify(event.data));
        }, event.delay);
      }
    });

    // Mock the task creation API
    await page.route('**/api/v1/tasks', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            task_id: 'test-task-001',
            status: 'CREATED',
            ws_url: '/ws/tasks/test-task-001',
          }),
        });
      }
    });

    // Navigate to apply page
    await page.goto('/apply');

    // Paste a job URL
    const urlInput = page.getByTestId('job-url-input');
    await urlInput.fill('https://www.linkedin.com/jobs/view/1234567890');

    // Verify platform detection badge appears
    const platformBadge = page.getByTestId('platform-badge');
    await expect(platformBadge).toBeVisible();
    await expect(platformBadge).toHaveText(/LinkedIn.*Easy Apply/);

    // Click "Start Application"
    const startButton = page.getByTestId('start-application-button');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // Verify progress panel appears
    const progressPanel = page.getByTestId('progress-panel');
    await expect(progressPanel).toBeVisible();

    // Verify progress bar advances
    const progressBar = page.getByTestId('progress-bar');

    // Wait for "Filling Form" state
    await expect(page.getByText('Filling First Name...')).toBeVisible({ timeout: 5000 });
    const progressValue = await progressBar.getAttribute('aria-valuenow');
    expect(Number(progressValue)).toBeGreaterThanOrEqual(40);

    // Wait for completion
    await expect(page.getByText('Application submitted')).toBeVisible({ timeout: 10000 });

    // Verify completion card
    const completionCard = page.getByTestId('completion-card');
    await expect(completionCard).toBeVisible();
    await expect(completionCard).toContainText('Senior Software Engineer');
    await expect(completionCard).toContainText('Acme Corp');

    // Verify confirmation screenshot link
    const screenshotLink = page.getByTestId('confirmation-screenshot');
    await expect(screenshotLink).toBeVisible();

    // Verify progress bar shows 100%
    await expect(progressBar).toHaveAttribute('aria-valuenow', '100');
  });

  test('CAPTCHA intervention: progress pauses, VNC opens, resumes', async ({ page }) => {
    const CAPTCHA_WS_EVENTS = [
      { delay: 500,  data: { type: 'state_change', state: 'INITIALIZING', percent: 5 } },
      { delay: 1000, data: { type: 'state_change', state: 'LOADING_PAGE', percent: 15 } },
      { delay: 1500, data: { type: 'state_change', state: 'FILLING_FORM', percent: 40 } },
      { delay: 2000, data: { type: 'state_change', state: 'CHECKING_CAPTCHA', percent: 70 } },
      // CAPTCHA detected! Human needed.
      { delay: 2500, data: {
        type: 'human_needed',
        reason: 'captcha_detected',
        captcha_type: 'recaptcha_v2',
        vnc_url: 'wss://mock-vnc.example.com/session/test-123',
        timeout_seconds: 300,
      }},
    ];

    // Events after CAPTCHA resolved
    const POST_CAPTCHA_EVENTS = [
      { delay: 0,    data: { type: 'state_change', state: 'SUBMITTING', percent: 85 } },
      { delay: 500,  data: { type: 'state_change', state: 'VERIFYING', percent: 95 } },
      { delay: 1000, data: { type: 'state_change', state: 'COMPLETED', percent: 100, result: {
        job_title: 'Senior Software Engineer',
        company: 'Acme Corp',
      }}},
    ];

    let sendPostCaptchaEvents: () => void;

    await page.routeWebSocket(/\/ws\/tasks\//, (ws) => {
      for (const event of CAPTCHA_WS_EVENTS) {
        setTimeout(() => ws.send(JSON.stringify(event.data)), event.delay);
      }

      // Set up handler for "Resume Automation" message from client
      ws.onMessage((msg: string) => {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'takeover_complete') {
          // Send post-CAPTCHA events
          for (const event of POST_CAPTCHA_EVENTS) {
            setTimeout(() => ws.send(JSON.stringify(event.data)), event.delay);
          }
        }
      });
    });

    // Mock task creation
    await page.route('**/api/v1/tasks', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ task_id: 'test-task-002', status: 'CREATED' }),
        });
      }
    });

    await page.goto('/apply');
    await page.getByTestId('job-url-input').fill('https://www.linkedin.com/jobs/view/999');
    await page.getByTestId('start-application-button').click();

    // Wait for CAPTCHA modal to appear
    const vncModal = page.getByTestId('vnc-modal');
    await expect(vncModal).toBeVisible({ timeout: 5000 });

    // Verify CAPTCHA info is shown
    await expect(vncModal).toContainText('CAPTCHA detected');

    // Verify countdown timer is visible
    const countdown = page.getByTestId('captcha-countdown');
    await expect(countdown).toBeVisible();

    // Click "Resume Automation"
    const resumeButton = page.getByTestId('resume-automation-button');
    await resumeButton.click();

    // VNC modal should close
    await expect(vncModal).not.toBeVisible({ timeout: 3000 });

    // Application should complete
    await expect(page.getByText('Application submitted')).toBeVisible({ timeout: 10000 });
  });

  test('kill switch stops all automation within 2 seconds', async ({ page }) => {
    // Start an application (same mock setup as happy path)
    await page.routeWebSocket(/\/ws\/tasks\//, (ws) => {
      // Send events that keep the application "in progress" for a long time
      setTimeout(() => ws.send(JSON.stringify({
        type: 'state_change', state: 'FILLING_FORM', percent: 40,
      })), 500);
    });

    await page.route('**/api/v1/tasks', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({ task_id: 'test-task-003', status: 'CREATED' }),
        });
      }
    });

    // Mock the kill switch API
    let killSwitchCalledAt: number | null = null;
    await page.route('**/api/v1/tasks/active', async (route) => {
      if (route.request().method() === 'DELETE') {
        killSwitchCalledAt = Date.now();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ cancelled_count: 1 }),
        });
      }
    });

    await page.goto('/apply');
    await page.getByTestId('job-url-input').fill('https://www.linkedin.com/jobs/view/888');
    await page.getByTestId('start-application-button').click();

    // Wait for progress to show
    await expect(page.getByTestId('progress-panel')).toBeVisible({ timeout: 3000 });

    // Verify kill switch button is visible
    const killSwitch = page.getByTestId('kill-switch-button');
    await expect(killSwitch).toBeVisible();

    // Click kill switch and measure response time
    const clickTime = Date.now();
    await killSwitch.click();

    // Verify confirmation toast appears within 2 seconds
    const toast = page.getByText(/All automation stopped/);
    await expect(toast).toBeVisible({ timeout: 2000 });

    // Verify API was called
    expect(killSwitchCalledAt).not.toBeNull();
    const responseTime = killSwitchCalledAt! - clickTime;
    expect(responseTime).toBeLessThan(2000);

    // Verify keyboard shortcut also works
    await page.goto('/apply');
    await page.getByTestId('job-url-input').fill('https://www.linkedin.com/jobs/view/777');
    await page.getByTestId('start-application-button').click();
    await expect(page.getByTestId('progress-panel')).toBeVisible({ timeout: 3000 });

    // Ctrl+Shift+K
    await page.keyboard.press('Control+Shift+KeyK');
    await expect(page.getByText(/All automation stopped/)).toBeVisible({ timeout: 2000 });
  });
});
```

---

## Summary

This testing strategy provides comprehensive coverage across all system components:

- **875+ automated tests** across unit, integration, and E2E layers
- **50+ mock ATS page scenarios** for browser automation testing without legal risk
- **9 quality gates** mapped to specific automated tests with measurable thresholds
- **Security testing** covering OWASP Top 10, RLS, input validation, and GDPR compliance
- **Performance baselines** with k6 load testing and WebSocket latency verification
- **CI pipeline under 20 minutes** with parallel execution and progressive gating
- **Phase-aligned delivery** so test coverage grows with each sprint

The highest-risk area -- browser automation and form filling -- receives the most investment through mock ATS pages, Stagehand fallback testing, and a 200-field accuracy test suite. The second highest-risk area -- the orchestration state machine -- is exhaustively tested with every valid and invalid state transition.

Every test can run without hitting a real job platform, a real LLM API (in CI), or a real payment processor. This ensures tests are fast, reliable, and safe.
