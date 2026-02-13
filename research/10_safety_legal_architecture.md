# Job Application Automation System: Safety, Legal, UX & Integration Architecture

## Comprehensive Research Document

---

# PART A: SAFETY, LEGAL & UX CONSIDERATIONS

---

## 1. Terms of Service Risk Analysis

### 1.1 LinkedIn Terms of Service

LinkedIn's User Agreement explicitly prohibits:
> "Using bots or other automated methods to access the Services, add or download contacts, send or redirect messages, create, comment on, like, share, or re-share posts, or otherwise drive inauthentic engagement."

**Enforcement reality (2024-2026):**
- In 2024, LinkedIn tightened enforcement with stricter weekly invitation limits (~100/week) and improved detection of browser-based extensions.
- 2025-2026 marks a turning point with dramatically ramped-up enforcement driven by user experience protection, spam combat, and revenue protection.
- 23% of automation users experience restrictions within 90 days when using browser extensions at maximum volume. Cloud-based tools with dedicated IPs and proper warm-up reduce this to 5-10%.

**Companies that got caught:**

| Company | What Happened | Outcome |
|---------|--------------|---------|
| **hiQ Labs** | Scraped public profiles using bots + fake accounts | $500K judgment, permanent injunction, 6 years of litigation |
| **Proxycurl** | Created hundreds of thousands of fake accounts, scraped millions of profiles | Federal lawsuit (Jan 2025), forced permanent data deletion, shut down July 2025 |
| **Chrome Extension developers** | LinkedIn sends cease-and-desist letters to Chrome extension authors | Various - forced removal from Chrome Web Store |

**Key takeaway:** LinkedIn is increasingly aggressive. The Proxycurl case (2025) is the most recent and alarming - they shut down entirely under legal pressure despite generating significant revenue.

### 1.2 Greenhouse / Lever / Workday ToS

**Greenhouse:** Their user agreement explicitly prohibits: "use automated means, including spiders, robots, crawlers, or similar means or processes to access or use the Services." This is a clear, enforceable restriction.

**Lever:** No publicly available specific anti-automation clause found in search results, but standard enterprise SaaS ToS typically include similar language.

**Workday:** Workday's dynamic interface with frequent updates makes automation inherently fragile. Their platform uses shadow DOM elements, dynamic selectors, and frequent UI changes. While specific ToS anti-bot language was not found in searches, Workday's technical architecture itself acts as an anti-automation barrier.

**Risk Assessment:**

| Platform | ToS Risk | Technical Risk | Enforcement Risk |
|----------|----------|---------------|-----------------|
| LinkedIn | **HIGH** - Explicit prohibition, active litigation | **MEDIUM** - Detectable via behavioral analysis | **HIGH** - Active enforcement, lawsuits |
| Greenhouse | **HIGH** - Explicit prohibition | **LOW** - Standard web forms | **MEDIUM** - Less aggressive than LinkedIn |
| Lever | **MEDIUM** - Likely prohibited | **LOW** - Standard web forms | **LOW** - Smaller company, less enforcement |
| Workday | **MEDIUM** - Likely prohibited | **HIGH** - Complex dynamic interface | **LOW** - Focus is on employer-side, not applicant-side |

### 1.3 Legal Precedent: hiQ Labs v. LinkedIn (9th Circuit)

**Case history:**
1. **District Court (2017):** Granted injunction preventing LinkedIn from blocking hiQ's scraping of public profiles.
2. **9th Circuit (2019):** Affirmed - scraping publicly accessible data likely does not violate CFAA.
3. **Supreme Court (2021):** Vacated and remanded in light of Van Buren v. United States.
4. **9th Circuit (2022):** Reaffirmed on remand - CFAA does not prohibit scraping public data.
5. **Settlement (Dec 2022):** $500K judgment against hiQ based on breach of contract, CFAA violations (specifically for using **fake accounts**), California computer access laws, and common law torts.

**What it established:**
- Scraping **publicly available** data does not violate the CFAA.
- However, using **fake accounts** to access data crosses the line.
- ToS violations alone are unlikely to constitute CFAA violations.
- LinkedIn CAN enforce restrictions through breach of contract claims (not criminal CFAA).
- The distinction between public data access and authenticated access remains critical.

### 1.4 CFAA and Van Buren v. United States

**Van Buren ruling (June 2021, 6-3 decision):**
The Supreme Court held that "exceeds authorized access" under CFAA means accessing computer areas that are completely "off-limits" - not merely using authorized access for unauthorized purposes.

**Key implications for our system:**
- A user with a legitimate LinkedIn account who uses automation does NOT violate CFAA by automating actions they could manually perform.
- The CFAA criminalizes **accessing computers without authorization**, not **using authorized access in ways the ToS prohibits**.
- The DOJ has stated it will not take the position that a mere contractual violation causes authorization to be automatically withdrawn.
- However, if LinkedIn sends a cease-and-desist or implements technical blocks, continued access may cross the CFAA line.

**Bottom line:** Our users applying to jobs using their own authenticated accounts is extremely unlikely to be a CFAA violation. The risk is contractual (ToS breach), not criminal.

### 1.5 Legal Difference: "User Uses a Tool" vs. "Bot Applies on Behalf of User"

This distinction is evolving rapidly under agentic AI law:

**"User uses a tool" (Autofill model - Simplify.jobs approach):**
- User triggers each action
- User reviews before submission
- User maintains control
- Tool is an assistive technology (like a screen reader or form filler)
- **Lower legal risk** - analogous to using a password manager or accessibility tool

**"Bot applies on behalf of user" (Fully autonomous model - LazyApply approach):**
- Bot independently decides what to apply to
- Bot submits without per-action user review
- Bot acts as an "electronic agent" under UETA
- **Higher legal risk** - the user may be bound by the bot's actions under apparent authority doctrine
- Under UETA Section 10, when an "electronic agent" forms a contract, the principal (user) IS bound by the actions of their agent

**Legal framework (Proskauer, Stanford CodeX, DLA Piper 2025 analysis):**
- Under UETA, automated transactions by electronic agents ARE legally binding.
- The deployer/user bears liability for the AI agent's actions unless proper disclaimers and guardrails exist.
- "Human in the loop" confirming transactions significantly reduces liability exposure.
- Contractual arrangements should clarify liability allocation between developer and user.

**Recommendation: Adopt the "assisted" model** - user triggers, AI fills, user reviews, user submits. This positions our tool as assistive technology rather than autonomous agent, dramatically reducing both legal and platform risk.

---

## 2. Account Safety Measures

### 2.1 Warm-Up Strategy

Never jump to automation immediately. Follow a graduated ramp-up:

| Week | Connection Requests/Day | Profile Views/Day | Likes/Day | Other Activity |
|------|------------------------|-------------------|-----------|----------------|
| 1 | 0 (manual browsing only) | 10-15 | 5-10 | Browse feed, join groups |
| 2 | 5-8 (with personal notes) | 15-20 | 10-15 | Comment on posts |
| 3 | 10-15 | 20-30 | 15-20 | Share content |
| 4+ | 15-20 (steady state) | 30-50 | 20-30 | Maintain normal activity |

**Pre-automation checklist:**
- Profile is complete (photo, headline, summary, experience)
- Account is at least 30 days old
- Has organic activity history (posts, comments, connections)
- SSI (Social Selling Index) score is established
- Email is verified, phone is verified

### 2.2 Rate Limiting Patterns That Mimic Human Behavior

**NOT just random delays** - humans have predictable patterns:

```
Realistic Daily Pattern:
- Morning burst (9-11 AM): 40% of daily activity
- Lunch lull (12-1 PM): 5% of daily activity
- Afternoon steady (2-5 PM): 35% of daily activity
- Evening tail (6-8 PM): 15% of daily activity
- Night: 5% of activity (occasional mobile check)
```

**Implementation principles:**
- Use flexible ranges (min/max) for all delays, randomized per action
- Add "thinking time" before form fills (2-5 seconds, normally distributed)
- Vary mouse movement patterns (don't teleport to elements)
- Include "distraction behaviors" - scroll past the target, come back, read adjacent content
- Session duration should vary (15-45 minutes, not exactly 30)
- Include genuine activity between automated actions (read feed, view a profile organically)

**Current codebase alignment:** The existing `usageLimitsConfig.ts` already enforces:
- 20 connections/day (conservative vs LinkedIn's 100/week)
- 5-second minimum between actions
- 10 actions/minute maximum
- Suspicious activity detection

### 2.3 Account Age & Maturity Requirements

| Account Age | Risk Level | Recommended Limits |
|-------------|-----------|-------------------|
| < 7 days | **CRITICAL** - Do not automate | Manual only |
| 7-30 days | **HIGH** - Very light automation | 5 connections/day max |
| 30-90 days | **MEDIUM** - Gradual ramp-up | 10-15 connections/day |
| 90+ days with activity | **LOW** - Full limits apply | 20 connections/day |
| Premium/Sales Nav | **LOWER** - Higher thresholds | 25-30 connections/day |

### 2.4 Session Management

**Cookie persistence:**
- Store session cookies in the browser profile (AdsPower handles this per-profile)
- Don't clear cookies between sessions - LinkedIn tracks session continuity
- Maintain consistent User-Agent across sessions

**IP consistency:**
- Use sticky residential proxies (same IP for session duration: 10-30 minutes)
- Maintain geographic consistency (don't jump between countries)
- Match IP location to profile's stated location when possible

**Device fingerprint consistency:**
- Consistent screen resolution, timezone, language
- Consistent WebGL renderer, canvas fingerprint
- AdsPower provides hardware-level fingerprint isolation per profile

### 2.5 Signals That Trigger LinkedIn Restrictions

**Behavioral signals:**
- Velocity: 50+ profiles viewed in one minute, 100+ connection requests in an hour
- Pattern: Identical message templates sent to many users
- Accept rate: High "ignore" rate on connection requests
- Sudden spikes: Going from 0 to 50 actions/day overnight
- Bot-like timing: Perfectly regular intervals between actions

**Technical signals:**
- Inconsistent IP addresses across sessions
- CDP (Chrome DevTools Protocol) detection (Cloudflare integration)
- Headless browser detection markers
- Multiple accounts from same IP
- Known automation tool signatures (DOM modifications, injected scripts)

**Content signals:**
- Generic, non-personalized connection messages
- Sending messages that get reported as spam
- Profile views without subsequent meaningful interaction

### 2.6 Recovery Strategies for Soft Restrictions

**Tier 1 (Temporary - resolves in 1-24 hours):**
- Immediately stop all automation
- Complete any CAPTCHA challenges
- Verify identity if prompted
- Wait 24-48 hours before ANY activity

**Tier 2 (Moderate - 3-14 days):**
- Stop all automation entirely
- Submit appeal through LinkedIn Help Center (Account Restricted section)
- Provide government ID verification if requested
- Resume with strictly manual activity for 2-4 weeks before re-enabling any automation
- Use multiple appeal channels (appeal form + Twitter/X @LinkedInHelp + email)
  - Multi-channel appeals increase success rate by 340%

**Tier 3 (Permanent ban - < 15% recovery rate):**
- Professional appeal with detailed explanation
- Do NOT create a new account (LinkedIn detects this)
- Consult legal counsel if account has significant business value
- Consider this account lost for automation purposes

**Auto-detection and pause (CRITICAL for our system):**
- If CAPTCHA appears: immediately pause automation, notify user
- If login page appears unexpectedly: session expired, STOP
- If connection requests start failing at >50% rate: STOP
- If "You've reached the weekly limit" message: STOP for 7 days
- If restriction notice appears: STOP permanently until user manually clears

---

## 3. User Consent & Transparency UX

### 3.1 Consent Model Comparison

| Model | Description | Risk | User Experience | Recommendation |
|-------|-------------|------|----------------|----------------|
| **Per-action approval** | User approves each application | Lowest | Tedious but safest | Use for first 5-10 applications |
| **Batch approval** | User reviews queue, approves batch | Low | Good balance | Default mode after trust built |
| **Auto with review** | AI fills, pauses for user review before submit | Low-Medium | Efficient | Recommended for power users |
| **Fully autonomous** | Bot applies without user review | Highest | Hands-off | NOT recommended (legal + quality risk) |

**Recommendation:** Start with "auto with review" as default, with option to escalate to per-action or downgrade to batch. Never offer fully autonomous without explicit opt-in and additional legal disclaimers.

### 3.2 Confidence Dashboard Design

Display for each application:
```
[Job Title at Company]                          [Confidence: 87%]

Resume Match: ████████░░ 82%    |  Skills: ██████████ 95%
Experience:   ███████░░░ 75%    |  Location: ██████████ 100%

AI Decisions Made:
  ✓ Selected "5-7 years" for experience question    [Override ▼]
  ✓ Salary expectation: "$120k-$140k"               [Override ▼]
  ⚠ EEO: Declined to answer (3 questions)           [Override ▼]
  ✓ Cover letter: Auto-generated                    [View/Edit]

[Review Full Application]  [Approve & Submit]  [Skip]
```

### 3.3 Pre-Submission Review

Before any submission, display:
- **Summary card**: Position, company, location, salary range
- **What will be submitted**: Resume version, cover letter preview, all form answers
- **AI-generated answers**: Highlighted with confidence scores
- **Warnings**: Low confidence answers, missing fields, potential mismatches
- **Screenshot preview**: What the filled form looks like (rendered)

### 3.4 Audit Trail Requirements

Every action must be logged with:
```typescript
interface AuditEntry {
  id: string;                    // UUID
  timestamp: Date;               // ISO 8601
  userId: string;                // User who initiated
  actionType: 'navigate' | 'fill' | 'click' | 'submit' | 'screenshot' | 'error';
  platform: string;              // 'linkedin' | 'greenhouse' | etc.
  jobUrl: string;                // The job posting URL
  details: {
    field?: string;              // Form field name
    valueProvided?: string;      // What was filled (redacted for PII)
    aiDecision?: string;         // What the AI decided
    userOverride?: boolean;      // Did user change the AI decision?
    confidence?: number;         // AI confidence score
  };
  screenshot?: string;           // S3 URL to screenshot (encrypted)
  sessionId: string;             // Links all actions in one application
}
```

**Retention policy:** 90 days by default, user can request deletion at any time (GDPR Article 17).

### 3.5 Kill Switch

**Implementation requirements:**
- Single-click stop button always visible in extension UI
- Keyboard shortcut (e.g., Ctrl+Shift+K) to immediately halt
- If kill switch is triggered:
  - All running automation tasks stop within 2 seconds
  - No pending form submissions are sent
  - Current browser state is preserved (screenshot taken)
  - User is notified: "All automation stopped. No data was submitted."
  - All queued tasks are cancelled
- Kill switch state persists across page reloads

### 3.6 Data Handling Disclosure

Clear, plain-language explanation:

```
What data we collect:
- Your resume content (to fill applications)
- Job URLs you apply to
- Form answers (to learn your preferences)
- Screenshots of applications (for your audit trail)

How we use it:
- To fill job application forms on your behalf
- To improve form-filling accuracy over time
- Resume text is sent to AI (OpenAI/Anthropic) for analysis
  → AI providers do NOT train on API data by default
  → Data is processed and not retained beyond the request

What we DON'T do:
- Sell your data to anyone
- Share your resume with employers you didn't apply to
- Store your LinkedIn password (we use session cookies only)
- Keep data longer than 90 days (you can delete anytime)
```

### 3.7 Legal Disclaimer

**Current implementation** (in `LegalDisclaimerModal.tsx` and `usageLimitsConfig.ts`) covers:
- LinkedIn limits acknowledgment
- Responsible use agreement
- Risk of account restrictions
- Link to LinkedIn User Agreement

**Recommended enhancements:**
1. **Versioned consent** - already implemented (`version: 'v1.0'`)
2. Add explicit acknowledgment that: "This tool automates actions on platforms whose Terms of Service may prohibit automation. You accept responsibility for your account."
3. Add: "We are not liable for account restrictions, data loss, or missed job applications resulting from platform changes or detection."
4. Require re-consent when disclaimer version changes (already implemented in `hasAcceptedDisclaimer`)
5. Record consent with timestamp, IP, and user agent for legal defensibility

### 3.8 Competitor Approaches

**Simplify.jobs (Gold standard for consent):**
- User always reviews before submission
- "Perfect for control freaks" - users see every single application before it goes out
- Privacy-first: no data shared without consent, no data selling
- Autofills but never auto-submits without user clicking "Submit"

**LazyApply (Cautionary tale):**
- "Spray-and-pray" approach - applies to everything
- Criticized as a "blunt instrument" applying to irrelevant roles
- Carries significant account risk (LinkedIn flags aggressive behavior)
- Speed triggers security flags leading to bans
- Users report applying to jobs they're completely unqualified for

**Our positioning should be:** Simplify-level control with smarter AI assistance. Never the LazyApply "fire and forget" approach.

---

## 4. Data Privacy & Security

### 4.1 Resume Data

| Aspect | Requirement | Implementation |
|--------|------------|----------------|
| Storage at rest | AES-256 encryption | Encrypted in database, key managed by KMS |
| Storage in transit | TLS 1.3 | HTTPS for all API calls |
| Access control | Role-based access, principle of least privilege | Only the owning user can access their resume |
| Retention | Max 90 days, user-deletable | Auto-cleanup job + manual delete endpoint |
| Backup encryption | Same as primary | Encrypted backups with separate key |

### 4.2 Platform Credentials

**Session cookies (RECOMMENDED) vs. stored passwords:**

| Approach | Security | Convenience | Risk |
|----------|----------|-------------|------|
| **Session cookies** | Moderate - tokens expire | User must re-auth periodically | Cookie theft = temporary access |
| **Stored passwords** | LOW - catastrophic breach risk | High - never re-auth | Password breach = full account takeover |
| **OAuth tokens** | HIGH - scoped, revocable | High - one-time auth | Limited scope reduces blast radius |

**Recommendation:** Session cookies only. Never store passwords. If cookies expire, prompt user to re-authenticate. Store cookies encrypted with per-user encryption keys.

### 4.3 Form Data Retention

**After submission:**
- Keep: Job URL, company name, position title, submission timestamp, success/failure status
- Delete after 90 days: Specific form answers, cover letter content, custom question responses
- Delete immediately: Any data the user marks as "don't save"
- Never persist: Salary expectations, EEO/demographic data, disability status, veteran status

### 4.4 Screenshots

- Contain PII (name, email, phone, address visible in forms)
- **Encryption:** AES-256 at rest, TLS in transit
- **Access:** Only the owning user + system admin (with audit log)
- **Retention:** 30 days default (configurable by user, max 90 days)
- **Storage:** Separate encrypted bucket, not in main database
- **Deletion:** Automatic cleanup after retention period; immediate on user request

### 4.5 LLM Data Processing

**OpenAI API:**
- API data is NOT used for model training by default
- Data Processing Addendum (DPA) available for GDPR compliance
- 30-day data retention for abuse monitoring, then deleted
- Enterprise tier: zero retention option available

**Anthropic API:**
- API and enterprise data explicitly excluded from training
- DPA automatically incorporated into Commercial Terms of Service
- Consumer chat changes (2025) do NOT affect API users
- Compliance API available for enterprise access controls

**Recommendation:**
- Use API tier (not consumer chat) for all LLM calls
- Sign DPA with both providers
- Implement request/response logging on our side (encrypted)
- Never send raw credentials or session tokens to LLM
- Strip PII from prompts where possible (use placeholders, inject at submission time)

### 4.6 GDPR Compliance

| GDPR Right | Implementation |
|------------|----------------|
| **Right to access** (Art. 15) | Dashboard showing all stored data |
| **Right to rectification** (Art. 16) | Edit any stored personal data |
| **Right to deletion** (Art. 17) | "Delete all my data" button, processed within 72 hours |
| **Right to portability** (Art. 20) | Export all data as JSON/CSV |
| **Consent management** (Art. 7) | Granular opt-in for each data use, easy withdrawal |
| **Data minimization** (Art. 5) | Only collect what's needed for form filling |
| **Purpose limitation** (Art. 5) | Data used only for stated purpose (job applications) |
| **DPIA required** (Art. 35) | Yes - automated processing of personal data at scale |

### 4.7 SOC 2 Considerations (Enterprise)

For enterprise customers, SOC 2 Type II would require:

**Security:**
- Encryption at rest and in transit (AES-256, TLS 1.3)
- Multi-factor authentication
- Role-based access control
- Penetration testing (annual)
- Vulnerability scanning (continuous)

**Availability:**
- 99.9% uptime SLA
- Disaster recovery plan
- Automated failover
- Incident response procedures

**Confidentiality:**
- Data classification scheme
- Access logging and monitoring
- Third-party vendor risk assessments (OpenAI, Anthropic, AdsPower)
- Employee background checks

**Processing Integrity:**
- Quality assurance for AI outputs
- Error handling and correction procedures
- Monitoring for data accuracy

**Timeline:** SOC 2 Type I: ~6 months. SOC 2 Type II: 12-18 months from start. Consider using Vanta or Drata for automation.

---

## 5. Anti-Abuse Measures

### 5.1 Rate Limiting Per User

```
Tier System:
- Free tier: 5 applications/day, 25/week
- Pro tier: 20 applications/day, 100/week
- Enterprise: Configurable, with manager approval workflow

Global limits (regardless of tier):
- Max 3 applications to same company in 24 hours
- Max 1 application to same job posting (duplicate detection)
- Minimum 2-minute gap between application submissions
- Daily limit resets at midnight in user's timezone
```

### 5.2 Quality Gates

Before submission, validate:
- [ ] Resume matches job requirements (>50% keyword overlap)
- [ ] Location is compatible (remote, or within stated range)
- [ ] Experience level matches (not a senior role for junior candidate, or vice versa)
- [ ] All required fields are filled
- [ ] No obvious errors (name in email field, email in phone field)
- [ ] Cover letter (if generated) is coherent and relevant
- [ ] No profanity or inappropriate content in any field
- [ ] Salary expectation (if provided) is within reasonable range for role

**If quality score < 60%:** Block submission, show user what's wrong, require manual override.

### 5.3 Ban Detection and Auto-Pause

```
Detection signals → Immediate action:

CAPTCHA appears                    → Pause + notify user
"Account restricted" page          → STOP all automation + alert
Login page (unexpected)            → Session expired, STOP + notify
Connection request rate >50% fail  → Reduce rate by 75%
"Weekly limit reached" message     → STOP for 7 days
HTTP 429 (rate limited)            → Exponential backoff (1min → 2min → 4min → stop)
Form submit gets error 3x          → STOP this application, try next
IP blocked                         → Rotate proxy, retry once, then stop
```

### 5.4 Application Quality Scoring

Score each application attempt:

| Factor | Weight | Scoring |
|--------|--------|---------|
| All fields filled correctly | 30% | Binary: 0 or 30 |
| Resume-job match | 25% | 0-25 based on keyword/skill overlap |
| No AI hallucinations | 20% | Verified answers match user profile |
| Successful submission | 15% | Confirmation page detected |
| Time to complete | 10% | Reasonable time (not suspiciously fast) |

**Track rolling averages:** If quality score drops below 70% over 5 applications, alert user and suggest profile updates.

### 5.5 User Behavior Monitoring

**Red flags to detect:**
- Multiple resumes with different names/identities
- Applying to contradictory roles (CEO and intern at same company)
- Geographic impossibilities (applying to in-person jobs across 10 countries)
- Fake email patterns (random strings @tempmail providers)
- Extremely high volume with no engagement (applying without ever reviewing)

**Action on red flags:**
- Flag account for manual review
- Reduce rate limits automatically
- Require additional identity verification
- In extreme cases, suspend account pending review

---

# PART B: INTEGRATION ARCHITECTURE

---

## 1. End-to-End Data Flow

### Complete Flow with Component Mapping

```
STEP 1: User Input
  Component: Frontend (React Extension / Web App)
  Input: Job URL + resume + preferences
  Output: API request payload
  Failure: Validation error → Show inline errors
  Recovery: User corrects and resubmits

STEP 2: API Receives Request
  Component: FastAPI / Django REST endpoint
  Input: Authenticated request with job URL, resume ID, preferences
  Output: Task ID + initial status
  Failure: Auth failure → 401; Validation → 400; Server error → 500
  Recovery: Client retries with exponential backoff (max 3 attempts)

STEP 3: Task Created in DB
  Component: PostgreSQL / Firestore
  Input: Task metadata (user_id, job_url, resume_id, status='pending')
  Output: task_id (UUID)
  Failure: DB connection error → retry with circuit breaker
  Recovery: Idempotency key prevents duplicate tasks

STEP 4: Enqueued in Task Queue
  Component: Celery + Redis/RabbitMQ broker
  Input: Task message {task_id, user_id, job_url, resume_id, preferences}
  Output: Queue confirmation
  Failure: Broker down → API returns 503, client retries
  Recovery: Message persistence (acks_late=True), DLQ for failed messages

STEP 5: Worker Picks Up Task
  Component: Celery Worker (dedicated queue for browser tasks)
  Input: Task message from queue
  Output: Task execution begins, status → 'processing'
  Failure: Worker crash → task requeued (acks_late)
  Recovery: New worker picks up task from checkpoint

STEP 6: AdsPower Profile Selected/Created
  Component: AdsPower Local API (http://localhost:50325)
  Input: POST /api/v1/user/create or GET /api/v1/user/list
  Output: Profile ID + proxy configuration
  Failure: AdsPower not running → retry 3x, then fail task
  Recovery: Use fallback profile pool; alert ops team

STEP 7: Proxy Bound
  Component: Proxy provider API (via AdsPower config)
  Input: Proxy type, country, sticky session preference
  Output: Proxy IP:Port:User:Pass bound to profile
  Failure: Proxy provider error → rotate to backup provider
  Recovery: Pool of 3+ proxy providers, automatic failover

STEP 8: Browser Launched via AdsPower API
  Component: AdsPower Local API
  Input: POST /api/v1/browser/start?user_id={profile_id}
  Output: {ws: {puppeteer: "ws://...", selenium: "..."}, debug_port: "..."}
  Failure: Browser won't start → clear cache, retry with new profile
  Recovery: Max 3 attempts, then fail with diagnostic info

STEP 9: CDP WebSocket URL Obtained
  Component: AdsPower response parsing
  Input: Browser start response
  Output: ws://127.0.0.1:{port}/devtools/browser/{id}
  Failure: Port conflict or connection refused
  Recovery: Wait and retry, or start browser on different port

STEP 10: Browser-Use Agent Connected via CDP
  Component: browser-use library (Python async)
  Input: CDP WebSocket URL + task description
  Output: Active BrowserSession with event bus
  Failure: WebSocket connection drops → reconnect
  Recovery: Exponential backoff reconnection (max 5 attempts)

STEP 11: Agent Navigates to Job URL
  Component: browser-use Agent → Navigation action
  Input: Job posting URL
  Output: Page loaded, DOM available
  Failure: Navigation timeout (30s) → retry with cache clear
  Recovery: 3 retries, then try alternative URL format

STEP 12: Page Analyzed
  Component: browser-use DomService + Screenshot
  Input: Loaded page DOM + viewport screenshot
  Output: Structured DOM tree + visual analysis
  Failure: DOM extraction fails → retry after page reload
  Recovery: Fallback to screenshot-only analysis

STEP 13: Platform Detected → Workflow Template Loaded
  Component: Platform detection engine (pattern matching)
  Input: URL patterns + DOM structure + page content
  Output: Platform type (greenhouse/lever/workday/custom) + workflow config
  Failure: Unknown platform → fall back to generic workflow
  Recovery: Log unknown platform for manual template creation

STEP 14: Form Filling Begins
  Component: browser-use Agent (LLM-driven decisions)
  Input: Form fields + user resume + preferences + workflow template
  Output: Filled form fields
  Failure: Field not found → screenshot + skip or ask user
  Recovery: Per-field retry, then manual intervention request

STEP 15: [If CAPTCHA] → Human Takeover
  Component: CAPTCHA detector → noVNC session
  Input: CAPTCHA detection (DOM pattern or screenshot analysis)
  Output: Solved CAPTCHA
  Architecture:
    - Worker detects CAPTCHA in DOM/screenshot
    - Pauses automation, saves state checkpoint
    - Establishes VNC session: Chrome + Xvfb + x11vnc
    - Websockify relay: VNC → WebSocket
    - Frontend: noVNC viewer connects via WebSocket
    - User sees live browser, solves CAPTCHA
    - User clicks "Resume" → automation continues from checkpoint
  Failure: User doesn't respond within 5 minutes
  Recovery: Auto-retry once, then mark task as "needs_human" and move to next

STEP 16: [If Email Verify] → Gmail API
  Component: Gmail API (OAuth2 + google-api-python-client)
  Input: Watch for verification email from expected sender
  Output: Verification link URL
  Implementation:
    - Poll inbox every 5 seconds for 2 minutes
    - Filter by sender domain + subject line patterns
    - Extract verification link from email body (HTML parsing)
    - Navigate browser to verification URL
  Failure: Email not received within 2 minutes
  Recovery: Check spam folder, retry request, or prompt user to check manually

STEP 17: Submit Application
  Component: browser-use Agent → click submit button
  Input: Filled form + submit button selector
  Output: Form submission HTTP response
  Failure: Submit button not found / click fails
  Recovery: Screenshot + retry with alternative selector, then manual intervention

STEP 18: Verify Confirmation
  Component: Post-submission verification
  Input: Page after submit (DOM + screenshot)
  Output: Confirmation status (success/failure/unknown)
  Detection:
    - Look for "Thank you" / "Application received" text
    - Check for confirmation email in inbox
    - Verify URL changed to confirmation page
  Failure: Can't determine success → mark as "unverified"
  Recovery: Screenshot stored for user to manually verify

STEP 19: Store Results
  Component: Database + Object Storage
  Input: Task completion data + screenshots
  Output: Updated task record, stored screenshots
  Data stored:
    - Task status: completed/failed/unverified
    - Timestamps: started_at, completed_at, duration
    - Platform: detected platform type
    - Screenshots: pre-submit and post-submit (S3, encrypted)
    - AI decisions: field-by-field log with confidence scores
    - Errors: any errors encountered during process

STEP 20: Notify User
  Component: WebSocket server + Push notification service
  Input: Task completion event
  Output: Real-time notification to user
  Channels:
    - WebSocket: Immediate in-app notification
    - Push notification: Browser/mobile push
    - Email digest: Optional daily summary
  Failure: WebSocket disconnected → queue notification, deliver on reconnect

STEP 21: Release Browser Profile
  Component: AdsPower Local API
  Input: POST /api/v1/browser/stop?user_id={profile_id}
  Output: Browser closed, profile available for reuse
  Failure: Browser won't close → force kill process
  Recovery: Cleanup job runs every 5 minutes to find orphaned browsers
```

---

## 2. Component Interface Contracts

### 2.1 API <-> Task Queue

**Message Format (Celery task):**
```python
@celery_app.task(
    name='apply_to_job',
    bind=True,
    acks_late=True,
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=600,    # 10 min soft limit
    time_limit=720,         # 12 min hard kill
    queue='browser_tasks'   # Dedicated queue
)
def apply_to_job(self, task_payload: dict):
    """
    task_payload = {
        'task_id': 'uuid-v4',
        'user_id': 'user-123',
        'job_url': 'https://greenhouse.io/...',
        'resume_id': 'resume-456',
        'preferences': {
            'cover_letter': True,
            'salary_range': [120000, 150000],
            'willing_to_relocate': False,
            'custom_answers': {...}
        },
        'browser_profile_id': 'profile-789',  # Optional, auto-select if null
        'proxy_config': {
            'country': 'US',
            'type': 'residential',
            'sticky': True
        },
        'created_at': '2025-01-15T10:30:00Z',
        'priority': 'normal',  # normal | high | low
        'idempotency_key': 'user-123_job-url-hash_2025-01-15'
    }
    """
```

### 2.2 Task Queue <-> Worker (Celery Context)

```python
# Celery passes task context via self (bound task)
def apply_to_job(self, task_payload):
    # Available context:
    self.request.id          # Celery task ID
    self.request.retries     # Current retry count
    self.request.delivery_info  # Queue, routing key
    self.request.hostname    # Worker hostname

    # State updates via backend
    self.update_state(state='NAVIGATING', meta={
        'step': 'navigating_to_job',
        'progress': 20,
        'current_url': task_payload['job_url']
    })

    # Retry on failure
    try:
        # ... do work
    except BrowserConnectionError as exc:
        raise self.retry(exc=exc, countdown=30)
```

### 2.3 Worker <-> AdsPower (REST API)

```python
ADSPOWER_BASE = "http://local.adspower.net:50325"

# Create profile
POST /api/v1/user/create
Request: {
    "name": "job-applicant-{user_id}",
    "group_id": "0",
    "user_proxy_config": {
        "proxy_type": "http",
        "proxy_host": "proxy.example.com",
        "proxy_port": "8080",
        "proxy_user": "user",
        "proxy_password": "pass"
    },
    "fingerprint_config": {
        "automatic_timezone": "1",
        "language": ["en-US", "en"],
        "ua": "Mozilla/5.0 ..."
    }
}
Response: {"code": 0, "data": {"id": "profile-id"}}

# Start browser
GET /api/v1/browser/start?user_id={profile_id}
Response: {
    "code": 0,
    "data": {
        "ws": {
            "puppeteer": "ws://127.0.0.1:xxxx/devtools/browser/guid",
            "selenium": "http://127.0.0.1:xxxx"
        },
        "debug_port": "xxxx",
        "webdriver": "/path/to/chromedriver"
    }
}

# Stop browser
GET /api/v1/browser/stop?user_id={profile_id}
Response: {"code": 0, "msg": "success"}

# Check browser status
GET /api/v1/browser/active?user_id={profile_id}
Response: {"code": 0, "data": {"status": "Active"}}
```

### 2.4 Worker <-> Browser-Use (CDP Connection)

```python
from browser_use import Agent, BrowserSession
from browser_use.browser.config import BrowserConfig

# Connect to existing browser via CDP
config = BrowserConfig(
    cdp_url="ws://127.0.0.1:{port}/devtools/browser/{guid}",
    headless=False,  # AdsPower manages the browser
    disable_security=False
)

session = BrowserSession(config=config)
await session.start()

# Create agent with task
agent = Agent(
    task="Navigate to {job_url} and fill out the application form using the following resume data: {resume_json}",
    browser_session=session,
    llm=primary_llm,           # Claude or GPT-4
    max_actions_per_step=10,
    max_steps=50
)

# Execute with callback for state updates
result = await agent.run(
    on_step=lambda step: update_task_state(task_id, step),
    on_error=lambda err: handle_agent_error(task_id, err)
)
```

### 2.5 Worker <-> noVNC (Human Takeover)

```
Architecture:
  Worker Machine:
    Chrome (via AdsPower) → Xvfb (virtual display) → x11vnc (VNC server)
                                                          ↓
    Websockify (TCP→WebSocket relay, port 6080)  ←────────┘
                    ↓
  Frontend:
    noVNC client (JavaScript) connects to ws://{server}:6080/websockify

Takeover Flow:
  1. Worker detects CAPTCHA/intervention needed
  2. Worker starts x11vnc if not already running
  3. Worker starts Websockify relay
  4. Worker sends WebSocket message to frontend:
     {
       "type": "human_takeover_required",
       "task_id": "...",
       "reason": "captcha_detected",
       "vnc_url": "ws://{server}:6080/websockify",
       "screenshot": "base64://...",
       "timeout_seconds": 300
     }
  5. Frontend shows noVNC viewer in modal
  6. User interacts directly with browser
  7. User clicks "Resume Automation" button
  8. Frontend sends: {"type": "takeover_complete", "task_id": "..."}
  9. Worker resumes from checkpoint
```

### 2.6 Worker <-> Gmail API

```python
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import re

async def check_verification_email(
    user_credentials: dict,
    expected_sender_domain: str,
    timeout_seconds: int = 120
) -> Optional[str]:
    """
    Poll Gmail for verification email and extract link.

    Called when:
    - Application form requires email verification
    - Platform sends confirmation email with action link

    Returns: Verification URL or None if timeout
    """
    creds = Credentials.from_authorized_user_info(user_credentials)
    service = build('gmail', 'v1', credentials=creds)

    start_time = time.time()
    while time.time() - start_time < timeout_seconds:
        # Search for recent unread emails from expected domain
        results = service.users().messages().list(
            userId='me',
            q=f'from:{expected_sender_domain} is:unread newer_than:5m',
            maxResults=5
        ).execute()

        messages = results.get('messages', [])
        for msg in messages:
            full_msg = service.users().messages().get(
                userId='me', id=msg['id'], format='full'
            ).execute()

            # Extract verification link from body
            body = extract_body(full_msg)
            link = re.search(r'https?://[^\s<>"]+verify[^\s<>"]*', body)
            if link:
                return link.group(0)

        await asyncio.sleep(5)  # Poll every 5 seconds

    return None  # Timeout
```

### 2.7 Worker <-> Database (State Changes)

```python
# State machine for task lifecycle
TASK_STATES = {
    'pending':        'Task created, waiting in queue',
    'queued':         'Message sent to task queue',
    'processing':     'Worker picked up task',
    'browser_setup':  'Setting up browser profile',
    'navigating':     'Navigating to job URL',
    'analyzing':      'Analyzing page structure',
    'filling':        'Filling form fields',
    'reviewing':      'Waiting for user review (if enabled)',
    'captcha':        'CAPTCHA detected, waiting for human',
    'email_verify':   'Waiting for email verification',
    'submitting':     'Submitting application',
    'verifying':      'Verifying submission success',
    'completed':      'Application submitted successfully',
    'failed':         'Application failed (see error)',
    'cancelled':      'Cancelled by user',
    'timeout':        'Task exceeded time limit'
}

# Database writes happen at each state transition:
async def update_task_state(task_id: str, new_state: str, metadata: dict = None):
    """
    Persisted fields per state change:
    - task_id, state, previous_state
    - timestamp (server time)
    - metadata (step-specific data)
    - checkpoint_data (for crash recovery)
    - error_details (if failed state)
    """
    await db.tasks.update(
        {'_id': task_id},
        {
            '$set': {
                'state': new_state,
                'updated_at': datetime.utcnow(),
                'metadata': metadata
            },
            '$push': {
                'state_history': {
                    'state': new_state,
                    'timestamp': datetime.utcnow(),
                    'metadata': metadata
                }
            }
        }
    )
```

### 2.8 API <-> Frontend (WebSocket Messages)

```typescript
// WebSocket message types (Frontend receives)
interface WSMessage {
  type: 'task_update' | 'human_takeover' | 'task_complete' | 'task_error' | 'notification';
  task_id: string;
  timestamp: string; // ISO 8601
  data: TaskUpdate | TakeoverRequest | TaskResult | ErrorInfo | Notification;
}

interface TaskUpdate {
  state: string;           // Current task state
  progress: number;        // 0-100
  step_description: string; // "Filling work experience section"
  current_url?: string;
  screenshot_url?: string; // For real-time preview
  ai_decisions?: AIDecision[]; // What the AI decided for each field
}

interface TakeoverRequest {
  reason: 'captcha' | 'login_required' | 'complex_form' | 'user_requested';
  vnc_url: string;
  timeout_seconds: number;
  screenshot: string;      // Base64 preview
}

interface TaskResult {
  success: boolean;
  confirmation_screenshot?: string;
  application_id?: string;  // If platform provides one
  summary: {
    company: string;
    position: string;
    fields_filled: number;
    ai_confidence: number;
    duration_seconds: number;
  };
}

// WebSocket message types (Frontend sends)
interface WSClientMessage {
  type: 'takeover_complete' | 'cancel_task' | 'approve_submission' | 'override_field';
  task_id: string;
  data?: any;
}
```

---

## 3. Error Handling & Recovery Matrix

| # | Failure | Detection Method | Recovery Strategy | User Impact | Max Retries |
|---|---------|-----------------|-------------------|-------------|-------------|
| 1 | AdsPower not running | Connection refused on localhost:50325 | Alert ops, retry in 30s | Task delayed 1-2 min | 3 |
| 2 | AdsPower profile creation fails | API returns error code | Use pre-created profile from pool | None (transparent) | 2 |
| 3 | Browser won't start | Start API timeout (30s) | Clear profile cache, retry with new profile | Delayed 1 min | 3 |
| 4 | CDP WebSocket connection fails | WebSocket error/close event | Parse new WS URL from browser restart | Brief pause | 5 |
| 5 | CDP connection drops mid-task | WebSocket close event + heartbeat timeout | Reconnect to same browser, resume from checkpoint | 10-30s pause | 3 |
| 6 | Page won't load (timeout) | Navigation timeout (30s) | Clear cache, retry; try with/without www; check if site is down | Delayed 30-60s | 3 |
| 7 | Page returns 403/429 | HTTP status code | Rotate proxy, wait 60s, retry | Delayed 2-3 min | 2 |
| 8 | Platform not detected | Pattern matching returns null | Fall back to generic form-fill workflow | Slightly lower accuracy | N/A |
| 9 | Form field not found | DOM query returns null + screenshot verification | Try alternative selectors, wait for lazy load, scroll into view | May skip field | 3 |
| 10 | CAPTCHA encountered | DOM pattern match (class/id containing 'captcha') + screenshot AI detection | Pause automation, request human takeover via noVNC | Notification, user must act within 5 min | 1 (human) |
| 11 | Session/cookie expired | Login page detected (URL pattern or DOM) | Notify user to re-authenticate, pause task | Requires user action | 0 (user must re-auth) |
| 12 | LLM API down (OpenAI) | HTTP 5xx or timeout | Failover to Anthropic (or vice versa) | None if failover works | 2 per provider |
| 13 | LLM API rate limited | HTTP 429 | Exponential backoff (1s, 2s, 4s, 8s) | 5-15s delay | 5 |
| 14 | LLM returns invalid/empty response | Response validation fails | Retry with different temperature/prompt | Minor delay | 3 |
| 15 | Form submit button not found | Submit selector not found in DOM | Screenshot → AI re-analysis → try alternative selectors | May need human | 3 + human fallback |
| 16 | Form submit fails (error message) | Post-submit DOM contains error text | Parse error, fix fields, retry submit | 30-60s delay | 2 |
| 17 | No confirmation detected | Post-submit page doesn't match success patterns | Screenshot for user verification, mark as "unverified" | User must verify manually | 1 |
| 18 | Worker process crashes | Celery heartbeat timeout (60s) | acks_late ensures task requeue; new worker picks up from checkpoint | Restart from last checkpoint | 1 (automatic requeue) |
| 19 | Redis/RabbitMQ broker down | Connection error on task enqueue | Retry with circuit breaker; API returns 503 | Task not created, user retries | 3 |
| 20 | Database write fails | DB connection error / write timeout | Retry with backoff; critical state cached in Redis | State may be stale briefly | 3 |
| 21 | Proxy IP blocked | Page returns different content or IP-check page | Rotate to new proxy from pool | 30s delay | 3 |
| 22 | Email verification not received | Gmail API poll times out (120s) | Check spam, retry once, then ask user to check manually | 2-5 min delay | 1 + user fallback |
| 23 | Account restriction detected | Restriction page in DOM, "you've been restricted" text | STOP ALL automation immediately, alert user, do NOT retry | Critical - all tasks paused | 0 (stop permanently) |
| 24 | WebSocket to frontend drops | Connection close event | Auto-reconnect with exponential backoff; queue missed messages | Brief notification gap | Unlimited |
| 25 | Screenshot capture fails | CDP screenshot command error | Retry; if persistent, continue without screenshot | Missing audit data | 2 |
| 26 | File upload required (resume) | File input detected in DOM | Inject file via CDP Input.setFiles | None if profile has resume | 2 |
| 27 | Multi-page form, page 2+ fails | Navigation between form pages fails | Save progress, retry from last successful page | Minor delay | 2 |

---

## 4. Configuration Management

### 4.1 Platform-Specific Settings

```yaml
# platform_configs/greenhouse.yaml
platform:
  name: greenhouse
  detection:
    url_patterns:
      - "boards.greenhouse.io"
      - "job-boards.greenhouse.io"
    dom_indicators:
      - "#app_form"
      - ".greenhouse-application"

  selectors:
    application_form: "#application_form, #main_fields"
    submit_button: "#submit_app, button[type='submit']"
    confirmation: ".confirmation-message, .thank-you"

  rate_limits:
    min_delay_between_fields_ms: 500
    max_applications_per_hour: 10
    page_load_timeout_ms: 30000
    form_fill_timeout_ms: 120000

  timeouts:
    navigation: 30000
    form_fill: 120000
    submit: 30000
    confirmation: 15000

# platform_configs/workday.yaml
platform:
  name: workday
  detection:
    url_patterns:
      - "myworkdayjobs.com"
      - ".wd5.myworkdayjobs.com"
    dom_indicators:
      - "[data-automation-id]"

  selectors:
    # Workday uses dynamic selectors - use data-automation-id attributes
    application_form: "[data-automation-id='applicationForm']"
    submit_button: "[data-automation-id='bottom-navigation-next-button']"

  special_handling:
    multi_page: true           # Workday uses multi-step forms
    shadow_dom: true           # Some elements in shadow DOM
    dynamic_loading: true      # Heavy AJAX, need wait strategies
    file_upload_method: "drag_drop"  # Workday uses drag-drop upload

  rate_limits:
    min_delay_between_fields_ms: 800   # Workday is more sensitive
    max_applications_per_hour: 5       # Lower due to complexity
```

### 4.2 User Preferences

```typescript
interface UserPreferences {
  // Notification preferences
  notifications: {
    channels: ('websocket' | 'push' | 'email' | 'sms')[];
    frequency: 'realtime' | 'batch_hourly' | 'daily_digest';
    quiet_hours: { start: string; end: string }; // "22:00" - "08:00"
  };

  // Automation behavior
  automation: {
    consent_mode: 'per_action' | 'batch' | 'auto_review' | 'autonomous';
    review_timeout_minutes: number;    // Auto-skip if not reviewed
    auto_skip_low_confidence: boolean; // Skip if AI confidence < 60%
    pause_on_captcha: boolean;         // vs. auto-solve attempts
    max_daily_applications: number;    // User's own limit
  };

  // Takeover behavior
  takeover: {
    auto_notify: boolean;             // Push notification on takeover needed
    vnc_quality: 'low' | 'medium' | 'high';
    timeout_minutes: number;          // Max wait for user before skipping
  };

  // Data retention
  data: {
    screenshot_retention_days: number; // 7, 30, 60, 90
    form_data_retention_days: number;  // 30, 60, 90
    audit_log_retention_days: number;  // 90, 180, 365
  };
}
```

### 4.3 LLM Model Selection

```yaml
llm_config:
  primary:
    provider: anthropic
    model: claude-sonnet-4-20250514
    temperature: 0.3
    max_tokens: 4096
    timeout_ms: 30000
    use_for:
      - form_field_analysis
      - cover_letter_generation
      - custom_question_answering

  fallback:
    provider: openai
    model: gpt-4o
    temperature: 0.3
    max_tokens: 4096
    timeout_ms: 30000

  lightweight:
    provider: openai
    model: gpt-4o-mini
    temperature: 0.2
    max_tokens: 1024
    use_for:
      - platform_detection
      - simple_field_matching
      - confirmation_page_analysis

  routing_rules:
    - condition: "task_type == 'cover_letter'"
      model: primary    # Need high quality
    - condition: "task_type == 'yes_no_question'"
      model: lightweight  # Simple task, save cost
    - condition: "primary.latency > 5000"
      model: fallback   # Primary too slow
    - condition: "primary.error_count > 3"
      model: fallback   # Primary failing
      duration: "10m"   # Try primary again after 10 min

  cost_limits:
    max_tokens_per_application: 50000
    max_cost_per_application_usd: 0.50
    monthly_budget_per_user_usd: 50.00
```

### 4.4 Proxy Configuration

```yaml
proxy_config:
  providers:
    primary:
      name: "brightdata"
      type: residential
      countries: [US, UK, CA, AU]
      rotation: sticky    # Same IP per session (10-30 min)
      auth:
        type: username_password
        credentials_ref: "vault://proxy/brightdata"

    fallback:
      name: "smartproxy"
      type: residential
      countries: [US, UK]
      rotation: sticky

    development:
      name: "local"
      type: datacenter
      host: "proxy.dev.internal"

  selection_rules:
    - match_user_location: true     # Proxy country matches user's stated location
    - prefer_residential: true      # Residential > datacenter
    - max_concurrent_per_ip: 1      # One browser per IP
    - rotate_on_block: true         # Auto-rotate if 403/429
    - ban_ip_duration_hours: 24     # Don't reuse blocked IPs for 24h
```

### 4.5 Feature Flags

```yaml
feature_flags:
  # Platform support
  platforms:
    greenhouse_enabled: true
    lever_enabled: true
    workday_enabled: true          # Beta
    linkedin_easy_apply: false     # Not ready
    custom_ats_enabled: false      # Future

  # Feature rollout
  features:
    ai_cover_letter:
      enabled: true
      rollout_percentage: 100

    auto_submit:
      enabled: true
      rollout_percentage: 50       # A/B test: 50% get auto-submit

    captcha_auto_solve:
      enabled: false               # Manual only for now

    multi_resume:
      enabled: true
      rollout_percentage: 100

    human_takeover_vnc:
      enabled: true
      rollout_percentage: 25       # Testing with 25% of users

  # Kill switches
  emergency:
    pause_all_automation: false    # Master kill switch
    disable_linkedin: false        # Platform-specific kill
    disable_submissions: false     # Allow filling but not submitting
    read_only_mode: false          # View only, no automation

  # Implementation: LaunchDarkly or GrowthBook (open source)
  provider: growthbook
  sdk_key_ref: "vault://feature-flags/sdk-key"
  refresh_interval_seconds: 30
```

---

## 5. Monitoring & Observability

### 5.1 Critical Metrics

**Task Metrics (Prometheus counters/histograms):**
```
# Success/failure rates
job_application_total{platform, status, user_tier}           # Counter
job_application_duration_seconds{platform, step}              # Histogram
job_application_error_total{platform, error_type}             # Counter

# Per-step timing
application_step_duration_seconds{platform, step_name}        # Histogram
  # step_name: navigate, analyze, fill_form, submit, verify

# CAPTCHA metrics
captcha_encountered_total{platform, captcha_type}             # Counter
captcha_solve_duration_seconds{method}                        # Histogram (human vs auto)
captcha_solve_success_total{method}                           # Counter

# LLM metrics
llm_request_total{provider, model, task_type}                 # Counter
llm_request_duration_seconds{provider, model}                 # Histogram
llm_tokens_used_total{provider, model, direction}             # Counter (input/output)
llm_cost_usd_total{provider, model}                           # Counter
llm_error_total{provider, model, error_type}                  # Counter

# Queue metrics
celery_task_received_total{queue}                             # Counter
celery_task_started_total{queue}                              # Counter
celery_task_succeeded_total{queue}                            # Counter
celery_task_failed_total{queue}                               # Counter
celery_task_retried_total{queue}                              # Counter
celery_queue_length{queue}                                    # Gauge
celery_worker_count{state}                                    # Gauge (active/idle)

# User intervention
human_takeover_requested_total{reason}                        # Counter
human_takeover_response_time_seconds                          # Histogram
human_takeover_timeout_total                                  # Counter

# Browser/Infrastructure
adspower_browser_start_duration_seconds                       # Histogram
adspower_browser_active_count                                 # Gauge
proxy_rotation_total{reason}                                  # Counter
cdp_connection_drops_total                                    # Counter
```

### 5.2 Key Dashboards (Grafana)

**Dashboard 1: Operations Overview**
- Applications submitted (last 24h, 7d, 30d) - success/fail split
- Current queue depth and worker utilization
- Average application time by platform
- Error rate trend (should be < 5%)
- Active browser sessions

**Dashboard 2: Platform Health**
- Per-platform success rates (Greenhouse, Lever, Workday)
- CAPTCHA encounter rates per platform (rising = detection increase)
- Account restriction events (CRITICAL alert if any)
- Form selector success rates (dropping = platform updated UI)

**Dashboard 3: AI/LLM Performance**
- Token usage and cost per application
- LLM response latency (p50, p95, p99)
- Fallback trigger rate (primary -> fallback)
- AI confidence score distribution
- Cost per application trend

**Dashboard 4: User Experience**
- User intervention rate (lower is better)
- Time from request to completion
- Retry rate per user
- Abandon rate (user cancels before completion)
- User satisfaction proxy: do users retry failed tasks?

### 5.3 Alerting Rules

```yaml
alerts:
  critical:
    - name: "All Workers Down"
      condition: celery_worker_count{state="active"} == 0
      for: 2m
      notify: [pagerduty, slack_critical]

    - name: "Account Restriction Detected"
      condition: increase(account_restriction_total[5m]) > 0
      for: 0s   # Immediate
      notify: [pagerduty, slack_critical, email_user]

    - name: "Success Rate Below 50%"
      condition: rate(job_application_total{status="success"}[1h]) / rate(job_application_total[1h]) < 0.5
      for: 15m
      notify: [slack_critical]

  warning:
    - name: "Queue Depth High"
      condition: celery_queue_length{queue="browser_tasks"} > 100
      for: 10m
      notify: [slack_warning]

    - name: "CAPTCHA Rate Increasing"
      condition: rate(captcha_encountered_total[1h]) > rate(captcha_encountered_total[1h] offset 1d) * 1.5
      for: 30m
      notify: [slack_warning]

    - name: "LLM Cost Spike"
      condition: increase(llm_cost_usd_total[1h]) > 100
      for: 0s
      notify: [slack_warning, email_ops]

    - name: "Primary LLM Failing"
      condition: rate(llm_error_total{provider="primary"}[5m]) > 0.1
      for: 5m
      notify: [slack_warning]

  info:
    - name: "Platform Selector Failures"
      condition: rate(selector_failure_total{platform=~".+"}[1h]) > 0.2
      for: 1h
      notify: [slack_info]
      action: "Platform may have updated UI. Check selectors."
```

### 5.4 Logging Strategy

```
Structured JSON logs with correlation IDs:

{
  "timestamp": "2025-01-15T10:30:00.123Z",
  "level": "INFO",
  "service": "worker",
  "task_id": "abc-123",
  "user_id": "user-456",
  "correlation_id": "req-789",    // Traces from API to worker
  "step": "form_fill",
  "platform": "greenhouse",
  "message": "Field filled successfully",
  "details": {
    "field_name": "work_experience",
    "confidence": 0.92,
    "llm_model": "claude-sonnet-4-20250514",
    "duration_ms": 1523
  }
}

Log levels:
- ERROR: Task failures, unrecoverable errors, account restrictions
- WARN: Retries, CAPTCHAs, low confidence decisions, rate limit hits
- INFO: State transitions, successful actions, checkpoints
- DEBUG: DOM analysis details, LLM prompts/responses (redacted PII)

PII Handling in Logs:
- NEVER log: passwords, full SSN, credit card numbers
- HASH: email addresses, phone numbers
- REDACT: resume content, form field values
- ALLOW: job URLs, company names, field names (not values)
```

---

## Summary of Key Recommendations

### Legal & Safety (Priority: CRITICAL)

1. **Adopt the "assisted" model** - user triggers, AI fills, user reviews, user submits. This is the Simplify.jobs approach and is the legally safest position.

2. **LinkedIn is the highest-risk platform.** The Proxycurl (2025) and hiQ (2022) outcomes show LinkedIn will litigate. Consider whether LinkedIn automation is worth the risk, or focus on ATS platforms (Greenhouse, Lever, Workday) where enforcement is much lower.

3. **CFAA is not your primary legal risk** (thanks to Van Buren). ToS breach/contract law IS your primary risk. Structure disclaimers accordingly.

4. **Implement aggressive self-throttling** - your current 20/day limit is good. Never let the tool be used in "spray and pray" mode.

5. **Auto-stop on any restriction signal** - this is non-negotiable. One account ban is a user lost forever.

### Architecture (Priority: HIGH)

6. **Checkpoint everything** - every state transition is persisted. If the worker crashes, the task can resume from the last checkpoint, not restart from scratch.

7. **Use Celery with acks_late + idempotency keys** - ensures tasks are never lost and never duplicated.

8. **Multi-provider LLM with automatic failover** - never be blocked by a single API outage.

9. **Feature flags from day one** - the ability to disable any platform or feature instantly (without deployment) is essential when operating in a legally gray area.

10. **Invest in monitoring early** - CAPTCHA rate increases and selector failures are your early warning system that a platform has updated its defenses.

---

## Sources

### Legal & Terms of Service
- [LinkedIn Prohibited Software and Extensions](https://www.linkedin.com/help/linkedin/answer/a1341387)
- [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)
- [hiQ Labs v. LinkedIn - Wikipedia](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)
- [9th Circuit: Data Scraping Legal in hiQ v. LinkedIn](https://calawyers.org/privacy-law/ninth-circuit-holds-data-scraping-is-legal-in-hiq-v-linkedin/)
- [hiQ v. LinkedIn Wrapped Up: Lessons Learned](https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/)
- [Van Buren v. United States - Wikipedia](https://en.wikipedia.org/wiki/Van_Buren_v._United_States)
- [SCOTUS Limits CFAA Reach](https://www.dwt.com/blogs/media-law-monitor/2021/10/scotus-cfaa-decision)
- [The CFAA After Van Buren](https://www.acslaw.org/analysis/acs-journal/2020-2021-acs-supreme-court-review/the-computer-fraud-and-abuse-act-after-van-buren/)
- [LinkedIn Wins Against Proxycurl (2025)](https://www.socialmediatoday.com/news/linkedin-wins-legal-case-data-scrapers-proxycurl/756101/)
- [LinkedIn Takes Legal Action for Member Privacy](https://news.linkedin.com/2025/linkedin-takes-legal-action-to-defend-member-privacy)
- [Proxycurl Shuts Down After Lawsuit](https://www.startuphub.ai/ai-news/startup-news/2025/the-1-linkedin-scraping-startup-proxycurl-shuts-down)
- [Greenhouse Terms of Service](https://www.greenhouse.com/legal)
- [My Greenhouse User Agreement](https://my.greenhouse.io/users/agreement)

### Agentic AI Liability
- [Contract Law in the Age of Agentic AI (Proskauer)](https://www.proskauer.com/blog/contract-law-in-the-age-of-agentic-ai-whos-really-clicking-accept)
- [Agentic AI Transactions: Who's Liable (Nat'l Law Review)](https://natlawreview.com/article/contract-law-age-agentic-ai-whos-really-clicking-accept)
- [Rise of Agentic AI: Legal Risks (DLA Piper)](https://www.dlapiper.com/en/insights/publications/ai-outlook/2025/the-rise-of-agentic-ai--potential-new-legal-and-organizational-risks)
- [From Fine Print to Machine Code (Stanford CodeX)](https://law.stanford.edu/2025/01/14/from-fine-print-to-machine-code-how-ai-agents-are-rewriting-the-rules-of-engagement/)
- [Liability for AI-Driven Decisions (HFW)](https://www.hfw.com/insights/legal-liability-for-ai-driven-decisions-when-ai-gets-it-wrong-who-can-you-turn-to/)

### Account Safety & Rate Limiting
- [LinkedIn Automation Safety Guide 2026 (Dux-Soup)](https://www.dux-soup.com/blog/linkedin-automation-safety-guide-how-to-avoid-account-restrictions-in-2026)
- [LinkedIn Automation 2025 Guide (Linkmate)](https://blog.linkmate.io/can-you-automate-linkedin-engagement-without-getting-banned-the-complete-2025-guide/)
- [LinkedIn Daily Limits 2025 (Closely)](https://blog.closelyhq.com/linkedin-automation-daily-limits-the-2025-safety-guidelines/)
- [LinkedIn Warm-Up Strategy (Botdog)](https://www.botdog.co/blog-posts/how-to-warm-up-linkedin-account)
- [Safe LinkedIn Automation Limits (Snov.io)](https://snov.io/knowledgebase/how-to-warm-up-linkedin-account-during-automation/)
- [LinkedIn Automation Best Practices (LiGo)](https://ligo.ertiqah.com/blog/linkedin-automation-best-practices-and-tools-without-risking-your-account)

### Account Recovery
- [LinkedIn Account Restricted Recovery 2025](https://www.hyperclapper.com/blog-posts/linkedin-account-restricted-react)
- [LinkedIn Account Restricted Recovery Guide 2026](https://autoposting.ai/linkedin-account-restricted/)
- [How to Recover Restricted LinkedIn (Famelab)](https://www.famelab.io/how-do-i-get-my-restricted-linkedin-account-back/)

### Privacy & Compliance
- [AI in Recruitment: GDPR Compliance](https://gdprlocal.com/ai-in-recruitment-balancing-innovation-with-gdpr-compliance/)
- [GDPR Recruitment Compliance (SmartRecruiters)](https://www.smartrecruiters.com/resources/gdpr-recruiting/recruitment-gdpr-faq/)
- [GDPR Guide for Recruitment (Workable)](https://resources.workable.com/tutorial/gdpr-compliance-guide-recruiting)
- [OpenAI Enterprise Privacy](https://openai.com/enterprise-privacy/)
- [Anthropic DPA](https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa)
- [SOC 2 Checklist for SaaS (Scytale)](https://scytale.ai/resources/the-ultimate-soc-2-checklist-for-saas-companies/)
- [SOC 2 Compliance Checklist (Drata)](https://drata.com/grc-central/soc-2/compliance-checklist)

### Competitor Analysis
- [Simplify Copilot](https://simplify.jobs/copilot)
- [LazyApply Chrome Extension](https://chromewebstore.google.com/detail/lazyapply-job-application/pgnfaifdbfoiehcndkoeemaifhhbgkmm)
- [Simplify Alternatives (JobsAICopilot)](https://jobsaicopilot.com/simplify-alternatives/)
- [Best Auto-Apply Tools 2025 (Jobright)](https://jobright.ai/blog/2025s-best-auto-apply-tools-for-tech-job-seekers/)

### Technical Architecture
- [browser-use: Playwright to CDP](https://browser-use.com/posts/playwright-to-cdp)
- [browser-use DeepWiki](https://deepwiki.com/browser-use/browser-use)
- [AdsPower Local API Documentation](https://localapi-doc-en.adspower.com/docs/Rdw7Iu)
- [AdsPower API Postman Collection](https://documenter.getpostman.com/view/45822952/2sB34hEzQH)
- [Celery Task Resilience (GitGuardian)](https://blog.gitguardian.com/celery-tasks-retries-errors/)
- [Celery Tasks Documentation](https://docs.celeryq.dev/en/stable/userguide/tasks.html)
- [Celery Monitoring with Prometheus/Grafana](https://hodovi.cc/blog/celery-monitoring-with-prometheus-and-grafana/)
- [Grafana Celery Exporter](https://deepwiki.com/grafana/celery-exporter)
- [WebSocket Architecture Best Practices (Ably)](https://ably.com/topic/websocket-architecture-best-practices)
- [Checkpoint/Restore Systems for AI Agents](https://eunomia.dev/blog/2025/05/11/checkpointrestore-systems-evolution-techniques-and-applications-in-ai-agents/)
- [Feature Toggles (Martin Fowler)](https://martinfowler.com/articles/feature-toggles.html)
- [Residential Proxies for Automation (Browserless)](https://www.browserless.io/blog/residential-proxies-web-automation-browserless)
- [LinkedIn Proxy & Automation Guide 2026](https://www.proxies.sx/blog/linkedin-proxy-automation-guide-2026)
- [Gmail API Python Quickstart](https://developers.google.com/gmail/api/quickstart/python)
- [Workday Application Automator (GitHub)](https://github.com/ubangura/Workday-Application-Automator)
