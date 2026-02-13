# Product Requirements Document: Auto Resume Submission Copilot

**Product Name:** WeKruit AutoApply Copilot
**Version:** 1.0 Draft
**Date:** 2026-02-10
**Status:** Research & Design Phase

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Core Concept & Product Philosophy](#2-core-concept--product-philosophy)
3. [User Interaction Flow](#3-user-interaction-flow)
4. [AdsPower Backend Integration](#4-adspower-backend-integration)
5. [Gmail / Email Integration UX](#5-gmail--email-integration-ux)
6. [CAPTCHA / Human Takeover UX](#6-captcha--human-takeover-ux)
7. [Competitive Analysis](#7-competitive-analysis)
8. [MVP Definition](#8-mvp-definition)
9. [Risk Matrix](#9-risk-matrix)
10. [Pricing Model](#10-pricing-model)

---

## 1. Executive Summary

AutoApply Copilot is an async, background job-application system that operates as a **Copilot** (human-in-the-loop), not an Autopilot. The user provides a job URL, their resume, and preference data. The system opens an anti-detect browser session (AdsPower), navigates to the job posting, fills out forms, and answers screening questions using an LLM. When the system encounters a blocker -- CAPTCHA, ambiguous questions, unexpected UI -- it pauses, notifies the user, and offers remote takeover.

---

## 2. Core Concept & Product Philosophy

### 2.1 Copilot vs. Autopilot

| Dimension | Autopilot | Copilot (Our Approach) |
|---|---|---|
| User involvement | None after trigger | Notified at key decision points |
| Error handling | Fails silently or retries blindly | Pauses and asks user for help |
| Trust model | "I hope it did the right thing" | "I saw what it did and approved" |
| Legal exposure | High -- actions without consent | Lower -- user participates |
| Quality | Spray-and-pray | Targeted, user-verified |
| Differentiation | Commodity (LazyApply, Sonara) | Premium, trust-building |

### 2.2 System Flow

```
User provides:                    System does:                      User called back for:
+------------------+             +------------------------+        +---------------------+
| - Job URL        |  -------->  | 1. Detect platform     |        | - CAPTCHAs          |
| - Resume (PDF)   |             | 2. Open AdsPower       |        | - Ambiguous Qs      |
| - Preferences    |             | 3. Navigate to job     |        | - Verification      |
| - Q&A profile    |             | 4. Fill forms via LLM  |        | - Final review      |
+------------------+             | 5. Answer screening Qs |        +---------------------+
                                 | 6. Upload resume       |
                                 | 7. Submit or pause     |
                                 +------------------------+
```

### 2.3 Supported Platforms (Phased)

| Phase | Platform | Complexity |
|---|---|---|
| MVP | LinkedIn Easy Apply | Low |
| v1.1 | LinkedIn Full Apply (external redirect) | Medium |
| v1.2 | Greenhouse / Lever | Medium |
| v2.0 | Workday / iCIMS / Taleo | High |

---

## 3. User Interaction Flow

### 3.1 Onboarding

**Step 1:** Sign up / Sign in (existing Firebase Auth)

**Step 2:** Resume & Profile Setup
- Upload resume (PDF/DOCX)
- System parses via LLM: name, email, phone, work history, education, skills
- User reviews & corrects parsed data
- User fills: LinkedIn URL, GitHub URL, visa status, relocation preference, salary range

**Step 3:** Screening Question Bank
- System presents 15+ common screening questions
- User pre-answers once
- Mark answers as "Always use" or "Ask me each time"
- Used as ground truth for LLM form-filling

**Step 4:** Platform Account Connection
- Option A: User provides LinkedIn session cookie
- Option B: User logs into LinkedIn inside AdsPower session (one-time)
- Option C: Gmail OAuth for email verification handling

**Step 5:** Preferences Configuration
- Notification preferences (push, email, in-app)
- Takeover preferences (pause and wait / skip after X min / never submit without review)
- Quality preferences (match threshold filtering)

### 3.2 Job Submission (Three Entry Points)

#### Option A: Paste Job URL (Web Dashboard)
1. User pastes LinkedIn job URL in dashboard
2. System auto-detects platform
3. Shows job preview (title, company, match score)
4. User clicks "Start Application"
5. Real-time progress updates via WebSocket

#### Option B: Browser Extension (One-Click)
1. User browsing LinkedIn/any job board
2. Extension detects job page (extends existing `websiteDetection.ts`)
3. Floating "AutoApply with WeKruit" button appears
4. One click sends job URL to backend
5. Toast: "Application started. We'll notify you when done."

#### Option C: Bulk Mode
1. Upload CSV or paste list of URLs
2. System validates, shows preview table
3. User reviews, clicks "Start Batch"
4. Sequential processing with dashboard progress

### 3.3 During Application (Real-Time Status)

**State Machine:**
```
QUEUED → INITIALIZING → NAVIGATING → ANALYZING → FILLING → REVIEWING → SUBMITTING → VERIFYING → COMPLETED
                                                     ↓
                                              PAUSED_WAITING_FOR_USER → (noVNC takeover) → RESUMING
```

**WebSocket Updates:**
```json
{
  "type": "APPLICATION_PROGRESS",
  "state": "FILLING",
  "progress": {
    "currentStep": 3,
    "totalSteps": 5,
    "percentComplete": 60,
    "fieldsCompleted": [
      {"name": "First Name", "value": "Adam", "confidence": 1.0},
      {"name": "Work Authorization", "value": "Yes", "confidence": 0.95}
    ]
  }
}
```

### 3.4 After Application

1. Capture confirmation screenshot
2. Store application record (company, role, URL, date, status)
3. Send notification (push/email)
4. Dashboard shows application history with analytics

---

## 4. AdsPower Backend Integration

### 4.1 Architecture Options

#### Option A: Cloud-Only AdsPower (Recommended for MVP)

**Pros:** Zero user friction, full control, scalable
**Cons:** Higher server costs (~$0.15/hr per session), needs residential proxies

#### Option B: User Installs AdsPower Locally

**Pros:** User's sessions available, residential IP, no server costs
**Cons:** High friction, user machine must stay on

#### Option C: Hybrid (Recommended for v2.0)

Cloud for automation, user's machine for takeover only.

### 4.2 Recommendation

- **MVP: Option A (Cloud-Only)** -- zero friction, full control
- **v2.0: Option C (Hybrid)** -- cost optimization at scale

### 4.3 AdsPower API Integration Flow

1. Create/select browser profile for user
2. Configure proxy (rotating residential)
3. Start browser: `POST /api/v1/browser/start` → get CDP WebSocket URL
4. Connect Puppeteer to browser
5. Run automation
6. On completion: `POST /api/v1/browser/stop`

---

## 5. Gmail / Email Integration UX

### 5.1 OAuth Permissions

**Minimal scopes:**

| Scope | Purpose | Sensitivity |
|---|---|---|
| `gmail.readonly` | Read verification emails | High (read-only) |
| `gmail.labels` | Create "WeKruit" label | Low |

**NOT requested:** `gmail.send`, `gmail.compose`, `gmail.full`

### 5.2 Privacy Safeguards

- Only read emails matching sender domain allowlist (linkedin.com, greenhouse.io, etc.)
- Extract verification code/link only
- Never store email content permanently
- All non-matching emails are NEVER accessed

### 5.3 Google OAuth Verification Requirements

| Requirement | Details |
|---|---|
| OAuth consent screen | Clear data usage statement |
| Privacy policy | Published at public URL |
| Google security review | 4-6 weeks, CASA Tier 2 |
| Limited use compliance | Data used only for stated purpose |
| Annual re-verification | Required |

### 5.4 MCP (Model Context Protocol) for Gmail

LLM can directly query Gmail via MCP tool during automation:
1. Automation encounters "check your email"
2. LLM queries Gmail API via MCP: messages matching sender + recent timeframe
3. LLM extracts verification code from email body
4. Automation enters code into form

### 5.5 Recommendation by Phase

| Phase | Approach |
|---|---|
| MVP | Webhook-based email forwarding (no OAuth needed) |
| v1.1 | Gmail OAuth with `gmail.readonly` |
| v2.0 | MCP integration for intelligent email parsing |

---

## 6. CAPTCHA / Human Takeover UX

### 6.1 Detection Methods

- **DOM-based:** iframe src contains captcha domains
- **Navigation-based:** Redirect to checkpoint/challenge URLs
- **Content-based:** Page text contains "verify you're human"
- **Timeout-based:** Expected navigation doesn't complete

### 6.2 Human Takeover Flow

1. **DETECT:** CAPTCHA encountered (T+0)
2. **PAUSE:** Stop DOM interaction, take screenshot (T+0.5s)
3. **NOTIFY:** Multi-channel notification (T+1s)
4. **STREAM:** noVNC WebSocket endpoint ready (T+2s)
5. **USER ARRIVES:** Opens noVNC viewer in dashboard (T+variable)
6. **USER SOLVES:** Interacts via noVNC (T+variable)
7. **SIGNALS DONE:** Clicks "Resume Automation" or auto-detected (T+variable)
8. **RESUME:** Automation continues from where it stopped (T+variable+1s)

### 6.3 Timeout Policy

| Timeout | Action |
|---|---|
| 0-5 min | Waiting. Notifications every 2 min. |
| 5-15 min | Warning notification |
| 15-30 min | Final warning |
| 30 min | Application cancelled |

### 6.4 noVNC vs. WebRTC

| Factor | noVNC | WebRTC |
|---|---|---|
| Latency | 100-300ms | 30-100ms |
| Setup complexity | Low | Medium |
| Input handling | Full (VNC protocol) | Custom data channel |

**Recommendation:** noVNC for MVP, WebRTC upgrade path for v2.0

---

## 7. Competitive Analysis

### 7.1 Landscape

| Competitor | Approach | Pricing | Key Limitation |
|---|---|---|---|
| **Simplify.jobs** | Browser extension auto-fill only | Free + $39/mo premium | Doesn't submit, user must be present |
| **LazyApply** | Full automation, spray-and-pray | $99-299/quarter | Low quality, high ban risk |
| **Sonara** | AI job discovery + auto-apply | $29-99/mo | LinkedIn Easy Apply only |
| **JobRight.ai** | Job matching + limited auto-apply | Free + $29/mo | Primarily discovery, not submission |
| **Massive** | Full AI automation | ~$99/mo | New, unproven, no human-in-loop |

### 7.2 Positioning

```
                    More Automated
                         ^
        LazyApply  Massive  Sonara
                  X    X     X
                         |
                         |     WeKruit AutoApply (TARGET)
                         |           X
        JobRight.ai      |
              X          |
                  Simplify.jobs     Hiration
                       X                X
                         +------------------------------->
                    Low Quality                   High Quality
```

### 7.3 WeKruit Differentiation

1. **Copilot model** -- user stays in control, building trust
2. **LLM-powered form filling** -- intelligent, not template-based
3. **Human-in-the-loop** -- handles edge cases gracefully
4. **Anti-detect browser** -- lower ban risk
5. **Full transparency** -- screenshots, confidence scores, audit trail

---

## 8. MVP Definition

### 8.1 Scope: LinkedIn Easy Apply Only

**Why:** Structured form (3-7 fields), most popular platform, existing extension infrastructure, low CAPTCHA frequency.

### 8.2 MVP Features

| Feature | MVP | v1.1 | v2.0 |
|---|---|---|---|
| Paste job URL to start | YES | YES | YES |
| Browser extension button | NO | YES | YES |
| Bulk URL submission | NO | YES | YES |
| LinkedIn Easy Apply | YES | YES | YES |
| Greenhouse / Lever | NO | YES | YES |
| Workday / iCIMS | NO | NO | YES |
| Resume parsing & profile | YES | YES | YES |
| Screening question bank | YES | YES | YES |
| LLM form filling | YES | YES | YES |
| Real-time dashboard | YES | YES | YES |
| CAPTCHA detection & pause | YES | YES | YES |
| noVNC takeover | YES | YES | YES |
| Gmail OAuth | NO | YES | YES |
| Analytics | NO | YES | YES |
| AI cover letters | NO | YES | YES |

### 8.3 Key User Stories

**US-1:** Resume Upload & Parsing -- upload PDF, auto-extract fields, user corrects
**US-2:** Screening Q&A Bank -- pre-answer 15+ common questions, mark "always use" or "ask each time"
**US-3:** Submit LinkedIn Easy Apply -- paste URL, auto-fill, real-time progress, confirm screenshot
**US-4:** CAPTCHA Takeover -- detect, pause, notify, noVNC view, solve, resume
**US-5:** Application Tracking -- list all applications with status, screenshots, filters

### 8.4 Success Metrics

| Metric | Target |
|---|---|
| Application success rate | >= 85% |
| Average time per application | < 2 minutes |
| Form fill accuracy | >= 95% |
| User intervention rate | < 15% |
| CAPTCHA encounter rate | < 5% |

---

## 9. Risk Matrix

### 9.1 Legal Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| LinkedIn TOS Violation | HIGH | HIGH | Rate limiting, anti-detect, user consent, Copilot model |
| CFAA concerns | HIGH | LOW | User authorizes each action on their own account |
| GDPR | MEDIUM | MEDIUM | Encryption, data minimization, clear privacy policy |
| Platform lawsuits | HIGH | LOW | Copilot model, small scale initially, legal counsel |

### 9.2 Technical Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| Bot detection | HIGH | HIGH | AdsPower fingerprinting, residential proxies, human-like timing |
| Account bans | HIGH | MEDIUM | Conservative rate limits (20/day), warnings, disclaimers |
| Form structure changes | MEDIUM | HIGH | LLM-based analysis adapts, not hard-coded selectors |
| Session expiry | LOW | HIGH | Health check before each app, re-auth flow |

### 9.3 Business Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| LinkedIn access changes | HIGH | MEDIUM | Multi-platform roadmap |
| Scaling costs | MEDIUM | HIGH | Session pooling, per-app pricing |
| Competition | MEDIUM | HIGH | Copilot differentiation, ecosystem moat |

---

## 10. Pricing Model

### 10.1 Tier Structure

| Tier | Price | Apps/Month | Platforms | Key Features |
|---|---|---|---|---|
| **Free** | $0 | 5 | LinkedIn Easy Apply | Basic dashboard |
| **Starter** | $19/mo | 50 | LinkedIn Easy Apply | Full dashboard, Q&A bank |
| **Pro** | $49/mo | 200 | LinkedIn + Greenhouse + Lever | AI cover letters, analytics, bulk |
| **Enterprise** | $99/mo | Unlimited* | All platforms | Priority processing, API |

*Soft cap 500/mo, then $0.25/additional

### 10.2 Cost Per Application

| Component | Cost |
|---|---|
| AdsPower license (amortized) | $0.01 |
| Cloud VM time (3 min) | $0.008 |
| Residential proxy | $0.02 |
| LLM tokens | $0.05-0.15 |
| Firebase | $0.005 |
| **Total COGS** | **$0.10-0.20** |

### 10.3 Margin Analysis

| Tier | Revenue/app | COGS/app | Gross Margin |
|---|---|---|---|
| Starter | $0.38 | $0.15 | ~60% |
| Pro | $0.245 | $0.15 | ~39% |
| Enterprise | $0.198 | $0.15 | ~24% |

### 10.4 Development Timeline

| Phase | Duration | Deliverable |
|---|---|---|
| Phase 0: Foundation | 2 weeks | Backend API, BullMQ + Redis, AdsPower integration |
| Phase 1: Core Automation | 3 weeks | LinkedIn Easy Apply, LLM form-filling |
| Phase 2: Dashboard | 2 weeks | Web dashboard, WebSocket integration |
| Phase 3: Takeover | 2 weeks | CAPTCHA detection, noVNC, notifications |
| Phase 4: Onboarding | 1 week | Resume parsing, Q&A bank, auth setup |
| Phase 5: Polish & QA | 2 weeks | Error handling, security audit, testing |
| **Total MVP** | **~12 weeks** | |
