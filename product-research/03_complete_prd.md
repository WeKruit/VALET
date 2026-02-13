# WeKruit Valet -- Product Requirements Document

> **VALET** — **V**erified. **A**utonomous. **L**ightning. **E**ffortless. **T**rusted.
> *Verified Automation. Limitless Execution. Trust.*

**Version:** 2.0
**Date:** 2026-02-11
**Status:** Final Draft -- Ready for Engineering
**Author:** Product Management
**Stakeholders:** Engineering, Design, Legal, Operations

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [User Personas](#2-user-personas)
3. [Core User Journey](#3-core-user-journey-end-to-end)
4. [Feature Specifications](#4-feature-specifications)
5. [API Specification](#5-api-specification)
6. [Data Model](#6-data-model)
7. [System Architecture Diagram](#7-system-architecture-diagram)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Success Metrics & KPIs](#9-success-metrics--kpis)
10. [Risks & Mitigations](#10-risks--mitigations)
11. [Open Questions / Decisions Needed](#11-open-questions--decisions-needed)

---

## 1. Executive Summary

### 1.1 Product Vision

> **Updated 2026-02-11:** This section has been revised per `09_updated_product_roadmap.md` (Section 0) to reflect the dual-mode philosophy. The tech stack has also been updated to full TypeScript (Fastify + Drizzle ORM + Hatchet TS SDK) per the architecture decision in `11_integration_architecture.md`.

WeKruit AutoApply is a dual-mode, AI-agent-driven job application system that eliminates the repetitive drudgery of filling out job applications. The user provides a resume, pastes a job URL, and the system does everything else: navigates to the job posting, fills forms intelligently using LLM-powered analysis, answers screening questions from a pre-built Q&A bank, uploads documents, and submits. When the system encounters obstacles it cannot solve autonomously -- CAPTCHAs, ambiguous questions, or unexpected UI -- it pauses and lets the user take over via a remote browser session (noVNC), then resumes automation once the obstacle is cleared.

**The product operates in two modes: Copilot and Autopilot.**

**Copilot Mode** is the default for every new user. The AI fills forms and the user reviews every field and approves every submission. The system is transparent about what it is doing (real-time progress, per-field confidence scores, screenshots) and never submits without the user's explicit approval. This is the trust-building phase.

**Autopilot Mode** is earned, not given. After a user completes 3 successful Copilot applications with high confidence scores and zero critical overrides, Autopilot unlocks. In Autopilot, the AI fills AND submits applications automatically within user-defined parameters, subject to 9 mandatory quality gates that cannot be overridden. The user reviews post-submission summaries rather than pre-submission fields. A circuit breaker auto-pauses after 3 consecutive failures. A kill switch stops all automation in under 2 seconds.

**The product philosophy is: Copilot First, Autopilot Earned.** No competitor successfully bridges both modes. Tools are either fully manual with high trust (Simplify: 4.9/5 rating) or fully automated with low trust (LazyApply: 2.1/5 rating). WeKruit occupies the high-automation, high-trust quadrant that no competitor has claimed -- by building trust through transparent Copilot experiences before offering the speed of Autopilot.

This dual-mode architecture is built on three principles:

1. **Transparency creates trust.** Every field shows its confidence score and source. Every submission produces screenshot proof. Every AI decision is logged in an audit trail.
2. **Trust enables automation.** Users who see 3-5 correct Copilot applications gain the confidence to delegate. Progressive disclosure moves them naturally from "I review everything" to "the AI handles it."
3. **Automation requires guardrails.** Autopilot is bounded by mandatory quality gates, rate limits, kill switches, and GDPR Article 22 compliance. It is the "responsible Autopilot" -- the only auto-apply tool that treats legal compliance and user safety as features, not afterthoughts.

This positions WeKruit as a premium, trust-building alternative to "spray-and-pray" competitors and as a productivity upgrade over copilot-only tools.

### 1.2 Target User

Job seekers actively applying to roles, primarily in technology, finance, consulting, and other white-collar fields where online applications are the standard hiring funnel. These users are frustrated by the hours spent copy-pasting the same information into different ATS platforms and want a tool that respects their time without sacrificing application quality.

### 1.3 Problem Statement

A typical job seeker applying to 20+ positions per week spends 3-8 hours on repetitive form-filling across LinkedIn Easy Apply, Greenhouse, Lever, and Workday. Each application requires entering the same contact information, uploading the same resume, and answering similar screening questions. The process is tedious, error-prone, and emotionally draining -- leading to application fatigue, lower-quality submissions, and missed opportunities.

Existing automation tools fall into two camps: (1) simple auto-fillers like Simplify.jobs that require the user to be present and click through every step, or (2) fully autonomous bots like LazyApply that apply indiscriminately, risking account bans and sending low-quality applications to irrelevant roles.

### 1.4 Solution Overview

WeKruit AutoApply Copilot occupies the sweet spot between these extremes:

- **Intelligent automation**: LLM-powered form analysis and answer generation, not template-based filling
- **User-initiated**: Every application is triggered by the user providing a specific job URL
- **Transparent**: Real-time progress dashboard with per-field confidence scores and live screenshots
- **Resilient**: Human-in-the-loop for edge cases via noVNC remote browser takeover
- **Safe**: Anti-detect browser profiles (AdsPower), residential proxies, conservative rate limiting, aggressive self-throttling on any restriction signal
- **Cost-efficient**: 3-tier LLM model routing (Claude Sonnet 4.5 for complex tasks, GPT-4.1 mini for routine, GPT-4.1 nano for trivial) brings per-application LLM cost to $0.021

### 1.5 Platform Rollout Strategy

| Phase | Platform | Difficulty | Timeline |
|-------|----------|-----------|----------|
| **MVP** | LinkedIn Easy Apply | 3.5/5 | Weeks 1-12 |
| **v1.1** | Greenhouse | 1.8/5 | Weeks 13-16 |
| **v1.2** | Lever | 1.3/5 | Weeks 17-18 |
| **v2.0** | Workday | 4.8/5 | Weeks 19-26 |

---

## 2. User Personas

### 2.1 Primary: The Active Job Seeker ("Alex")

**Demographics:** 25-40 years old, 3-10 years of experience, technology/finance/consulting professional, currently employed but actively looking, or recently laid off.

**Behavior:**
- Applies to 10-50 jobs per week across multiple platforms
- Spends 4-8 hours per week on applications alone
- Has a polished resume and LinkedIn profile
- Uses job boards (LinkedIn, Indeed, Glassdoor) and company career pages
- Tracks applications in a spreadsheet or Notion

**Pain Points:**
- Repetitive data entry across platforms (same name, email, phone, work history on every form)
- Screening questions that require thought but are often similar across roles ("Why are you interested in this role?", "Years of experience with X")
- Resume upload formats differ between platforms (PDF vs DOCX, parsed vs unparsed)
- Loses track of which jobs were applied to and when
- Application fatigue leads to lower-quality submissions later in each session

**Goals:**
- Apply to more jobs in less time without sacrificing quality
- Never miss a good opportunity because of application fatigue
- Track all applications in one place
- Maintain high application quality even at volume

**Willingness to Pay:** $19-49/month for a tool that saves 4+ hours/week

### 2.2 Secondary: The Selective Job Seeker ("Sam")

**Demographics:** 30-50 years old, senior-level professional, passively looking, employed in a role they are willing to leave for the right opportunity.

**Behavior:**
- Applies to 1-5 highly targeted jobs per week
- Spends 30-60 minutes per application customizing responses
- Values quality over quantity
- Researches each company thoroughly before applying

**Pain Points:**
- Even targeted applications require repetitive data entry
- Wants to spend time on research and customization, not form-filling
- Concerned about being detected using automation (reputation risk)
- Needs confidence that the tool will represent them accurately

**Goals:**
- Eliminate the mechanical parts of applying (data entry, file uploads) so they can focus on strategy and customization
- Review every field before submission
- Maintain complete control over what gets submitted

**Willingness to Pay:** $29-49/month for a premium, accurate tool

### 2.3 Tertiary: The Career Coach / Recruiter ("Jordan")

**Demographics:** Career coach, outplacement consultant, or independent recruiter managing 5-20 candidates simultaneously.

**Behavior:**
- Manages applications on behalf of multiple candidates
- Needs to track status across candidates and roles
- Requires audit trails for compliance and reporting
- Values bulk operations and analytics

**Pain Points:**
- Managing application pipelines for multiple people is operationally complex
- No single tool provides multi-candidate management
- Reporting to candidates on application status is manual

**Goals:**
- Submit applications for multiple candidates efficiently
- Track and report on application status per candidate
- Export analytics for client reviews

**Willingness to Pay:** $99+/month (Enterprise tier)

---

## 3. Core User Journey (End-to-End)

### 3.1 First-Time User Journey

```
STEP 1: Landing Page
  User visits wekruit.com/copilot
  Sees value proposition: "Apply to jobs 10x faster. AI fills the forms. You stay in control."
  CTA: "Get Started -- Free"

STEP 2: Gmail OAuth Sign-Up
  User clicks "Sign in with Google"
  OAuth consent screen: "WeKruit wants to access your Google Account"
  Minimal scopes: email, profile (Gmail read access added in v1.1)
  User grants access
  Account created, redirected to onboarding

STEP 3: Resume Upload
  Upload modal: "Upload your resume (PDF or DOCX, max 10MB)"
  Drag-and-drop or file picker
  Upload progress bar
  System sends resume to LLM for parsing (2-5 seconds)

STEP 4: Resume Review
  Parsed fields displayed in editable form:
    - Full name, email, phone, location
    - Work history (company, title, dates, description) x N
    - Education (school, degree, dates) x N
    - Skills (extracted as tags)
    - LinkedIn URL, GitHub URL, portfolio URL
  User reviews and corrects any parsing errors
  "Looks Good" button saves profile

STEP 5: Screening Q&A Bank Setup
  System presents 20+ common screening questions grouped by category:
    WORK AUTHORIZATION: "Are you authorized to work in [country]?", "Do you require visa sponsorship?"
    EXPERIENCE: "How many years of experience do you have with [skill]?", "What is your most recent job title?"
    COMPENSATION: "What is your expected salary?", "Are you open to contract/freelance?"
    AVAILABILITY: "When can you start?", "Are you willing to relocate?"
    IDENTITY (OPTIONAL): "Gender", "Race/Ethnicity", "Veteran Status", "Disability Status"
    CUSTOM: Free-form Q&A pairs the user adds themselves

  For each question, user can:
    - Provide a default answer (used automatically)
    - Mark as "Ask me each time" (system pauses for input)
    - Mark as "Decline to answer" (for optional/EEO questions)
    - Skip (system will use LLM best-guess with low confidence flag)

  "Save & Continue" button

STEP 6: Preferences Configuration
  Notification preferences: Email, push, in-app (default: all on)
  Automation behavior:
    - "Review before submit" (default) vs. "Auto-submit if confidence > 90%"
    - Daily application limit (default: 20)
  "Finish Setup" button

STEP 7: Dashboard (Empty State)
  Welcome message: "You're all set! Paste a job URL below to start your first application."
  URL input field prominently displayed
  Quick stats: 0 applications, 0 pending, 0 completed
```

### 3.2 Applying to a Job (Core Loop)

```
STEP 1: Paste Job URL
  User pastes URL: https://www.linkedin.com/jobs/view/1234567890
  System auto-detects platform: "LinkedIn Easy Apply detected"
  Loading spinner while system fetches job metadata

STEP 2: Job Preview
  Card displays:
    - Job title: "Senior Software Engineer"
    - Company: "Acme Corp"
    - Location: "San Francisco, CA (Hybrid)"
    - Posted: "3 days ago"
    - Match score: 87% (based on resume vs. job description analysis)
    - Skills match: Python (yours) -> Python (required), etc.
    - Estimated time: "~90 seconds"
  CTA: "Start Application" / "Cancel"

STEP 3: Pre-Fill Preview (Optional, if "Review before submit" enabled)
  Shows what will be filled:
    - First Name: Adam [auto] | Confidence: 100%
    - Last Name: Smith [auto] | Confidence: 100%
    - Email: adam@email.com [auto] | Confidence: 100%
    - Phone: (555) 123-4567 [auto] | Confidence: 100%
    - Resume: resume_v3.pdf [auto]
    - Years of Python experience: "7" [from Q&A bank] | Confidence: 95%
    - "Why are you interested?": [LLM-generated] | Confidence: 78%
      [Click to preview/edit generated answer]
  CTA: "Approve & Start" / "Edit" / "Cancel"

STEP 4: Application In Progress
  Real-time progress panel:
    [=========>          ] 45%
    Status: FILLING FORM
    Current step: "Answering screening questions (3 of 5)"

    Live field log:
      09:14:02  Navigated to job posting                    OK
      09:14:04  Clicked "Easy Apply"                        OK
      09:14:06  Filled: First Name = "Adam"                 OK  100%
      09:14:07  Filled: Last Name = "Smith"                 OK  100%
      09:14:08  Filled: Email = "adam@email.com"            OK  100%
      09:14:09  Filled: Phone = "(555) 123-4567"            OK  100%
      09:14:11  Uploaded: resume_v3.pdf                     OK
      09:14:14  Answered: "Years of experience" = "7"       OK  95%
      09:14:18  Answered: "Work authorization" = "Yes"      OK  100%
      09:14:22  Generating answer for "Why interested?"...  PENDING

    [Live Screenshot Preview] (updates every 5s)

STEP 5a: Normal Completion
  Status changes to: SUBMITTING -> VERIFYING -> COMPLETED
  Success notification:
    "Application submitted to Acme Corp -- Senior Software Engineer"
    [View Confirmation Screenshot] [View Application Details]
  Application appears in history table

STEP 5b: CAPTCHA Encountered
  Status changes to: PAUSED -- CAPTCHA DETECTED
  Alert: "We need your help! A CAPTCHA appeared."
  [Open Remote Browser] button -> opens noVNC viewer in modal
  User solves CAPTCHA in the remote browser
  User clicks "Resume Automation" (or system auto-detects CAPTCHA solved)
  Automation continues from where it paused

STEP 5c: Low-Confidence Field
  Status changes to: PAUSED -- REVIEW NEEDED
  Alert: "We're not sure about one answer. Please review."
  Shows: Question: "What is your expected salary range?"
         AI Answer: "$120,000 - $140,000" | Confidence: 62%
         [Approve] [Edit] [Skip]
  User approves or edits, automation continues
```

### 3.3 Returning User Journey (100th Application)

```
User opens dashboard
  - Application history shows 99 completed applications
  - Analytics: 92% success rate, avg 1:42 per application, 8% intervention rate
  - Q&A bank has grown to 45 entries (system learned from overrides)

User pastes new URL
  - System recognizes it's a Greenhouse job board (v1.1+)
  - Pre-fill preview shows all fields with 95%+ confidence
  - User clicks "Start Application" -- done in 90 seconds with zero intervention

Bulk mode (v1.1+):
  User pastes 10 URLs at once
  System validates all, shows preview table
  User clicks "Start Batch"
  Applications process sequentially with dashboard showing batch progress
```

---

## 4. Feature Specifications

### 4.A Authentication & Onboarding

#### 4.A.1 Gmail OAuth Sign-Up / Sign-In

**Description:** Users authenticate exclusively via Google OAuth 2.0. No username/password accounts. This simplifies onboarding, eliminates password management, and positions the system for Gmail API integration in v1.1.

**User Story:** As a job seeker, I want to sign in with my Google account so that I can get started immediately without creating yet another password.

**Acceptance Criteria:**
- Google OAuth 2.0 flow with PKCE for security
- Minimal scopes at sign-up: `openid`, `email`, `profile`
- Gmail read scope (`gmail.readonly`) requested only when user enables email verification features (v1.1)
- Account is created on first sign-in, subsequent sign-ins retrieve existing account
- JWT access token (15min expiry) + refresh token (7-day expiry) issued on success
- Tokens stored in HTTP-only, secure, SameSite cookies (web) or secure storage (extension)
- Sign-out clears all tokens and local state
- Error handling: Google auth failure shows "Something went wrong. Please try again." with retry button

**Technical Requirements:**
- Google OAuth 2.0 client configuration (Google Cloud Console)
- FastAPI OAuth callback endpoint
- JWT generation and validation (RS256 signing)
- PostgreSQL users table (see Data Model section)
- Refresh token rotation on each use

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.A.2 Resume Upload (PDF/DOCX)

**Description:** Users upload their resume as a PDF or DOCX file. The file is stored securely and sent to the LLM for structured parsing. Maximum file size: 10MB.

**User Story:** As a job seeker, I want to upload my resume once so that the system can use it to fill applications automatically.

**Acceptance Criteria:**
- Accepts PDF and DOCX formats only (client-side and server-side validation)
- Maximum file size: 10MB
- Drag-and-drop upload area with file picker fallback
- Upload progress indicator
- File stored in encrypted object storage (S3-compatible) under user-scoped path
- File virus-scanned before processing
- Multiple resumes supported (user can have up to 5 active resumes)
- Default resume can be set for auto-selection
- Resume can be deleted at any time (GDPR right to deletion)
- Original file retained for 90 days, then auto-deleted (parsed data persists)

**Technical Requirements:**
- FastAPI multipart file upload endpoint
- S3-compatible object storage (MinIO for self-hosted, AWS S3 for cloud)
- AES-256 encryption at rest
- ClamAV or similar virus scanning
- PostgreSQL resumes table linking to user

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.A.3 LLM-Powered Resume Parsing with User Review

**Description:** After upload, the resume is sent to Claude Sonnet 4.5 for structured extraction. The LLM returns a JSON object with all parseable fields. The user reviews and corrects the parsed output before it becomes their profile.

**User Story:** As a job seeker, I want the system to automatically extract my information from my resume so that I do not have to manually enter everything.

**Acceptance Criteria:**
- Parsing completes within 10 seconds of upload
- Extracted fields: full name, email, phone, location (city/state/country), work history (company, title, start date, end date, description, achievements), education (school, degree, field, start date, end date, GPA), skills (as tags), certifications, languages, URLs (LinkedIn, GitHub, portfolio, personal website)
- User presented with an editable form showing all parsed fields
- Changed fields are highlighted (user corrections)
- "Looks Good" button saves the reviewed data
- Re-parsing available if user uploads a new resume version
- Parsing confidence score displayed per section (informational)
- LLM prompt includes structured output schema (JSON mode) to ensure consistent extraction
- PII is never logged; only the structured output is stored permanently

**Technical Requirements:**
- Claude Sonnet 4.5 API call with structured JSON output
- PDF text extraction (PyMuPDF) as preprocessing step before LLM call
- DOCX text extraction (python-docx) as preprocessing step
- ParsedResumeData table in PostgreSQL (see Data Model)
- Retry with GPT-4.1 as fallback if Claude API is unavailable

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.A.4 Screening Q&A Bank

**Description:** A persistent bank of question-answer pairs that the system uses as ground truth when filling screening questions on job applications. The bank is seeded with common questions and grows as the user encounters new ones.

**User Story:** As a job seeker, I want to pre-answer common screening questions once so that the system can reuse my answers across all applications.

**Acceptance Criteria:**
- Seeded with 20+ common screening questions across categories (work authorization, experience, compensation, availability, EEO/identity)
- User can add custom Q&A pairs at any time
- Each answer can be flagged as: "Always use" (default), "Ask me each time", or "Decline to answer"
- When the system encounters a screening question during an application, it first checks the Q&A bank for a semantic match (not just exact string match)
- If a match is found with "Always use", the answer is used automatically
- If a match is found with "Ask me each time", the system pauses for user input
- If no match is found, the LLM generates an answer based on the user's resume and profile, flagged with a confidence score
- User overrides during applications are offered as new Q&A bank entries ("Save this answer for future use?")
- CRUD operations: create, read, update, delete Q&A pairs
- Q&A bank is searchable and filterable by category

**Technical Requirements:**
- PostgreSQL qa_bank_entries table
- Semantic similarity search for question matching (embedding-based with pgvector, or LLM-based classification)
- FastAPI CRUD endpoints
- Frontend Q&A management interface

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.A.5 LinkedIn Session Connection (Optional)

**Description:** For LinkedIn Easy Apply, the system needs access to the user's authenticated LinkedIn session. In the MVP, this is achieved by having the user log into LinkedIn within an AdsPower browser profile during onboarding. The session cookies are persisted within the AdsPower profile.

**User Story:** As a job seeker, I want to connect my LinkedIn account so that the system can apply to LinkedIn Easy Apply jobs on my behalf.

**Acceptance Criteria:**
- User clicks "Connect LinkedIn" in settings
- System provisions a new AdsPower browser profile bound to the user
- noVNC session opens showing the AdsPower browser at linkedin.com/login
- User manually logs into LinkedIn (including any 2FA)
- System detects successful login (cookie check or DOM detection of logged-in state)
- Session cookies are persisted in the AdsPower profile
- Connection status shown in settings: "Connected" / "Disconnected" / "Session Expired"
- If session expires, user is notified and can re-authenticate
- System never stores LinkedIn passwords (cookies only)
- Legal disclaimer shown before connection: acknowledgment of LinkedIn ToS risk

**Technical Requirements:**
- AdsPower profile provisioning API
- noVNC session for manual login
- Session health check (periodic cookie validation)
- Cookie persistence within AdsPower profile
- IPRoyal sticky residential proxy bound to the profile

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

### 4.B Job Application Submission

#### 4.B.1 URL Paste with Platform Auto-Detection

**Description:** The primary entry point for submitting applications. User pastes a job URL, and the system automatically identifies the platform (LinkedIn, Greenhouse, Lever, Workday) and validates that the URL points to an actual job posting.

**User Story:** As a job seeker, I want to paste a job URL and have the system figure out the rest so that I do not need to worry about which platform it is on.

**Acceptance Criteria:**
- URL input field on dashboard with "Start Application" button
- Validation: URL must be a valid HTTP/HTTPS URL
- Platform detection via URL pattern matching:
  - LinkedIn: `linkedin.com/jobs/view/*`
  - Greenhouse: `boards.greenhouse.io/*` or `job-boards.greenhouse.io/*`
  - Lever: `jobs.lever.co/*`
  - Workday: `*.myworkdayjobs.com/*` or `*.wd5.myworkdayjobs.com/*`
- Unsupported platform: "This platform is not yet supported. We currently support LinkedIn Easy Apply." (MVP)
- Duplicate detection: if user has already applied to this exact URL, show warning: "You applied to this job on [date]. Apply again?"
- Response time: platform detection < 500ms

**Technical Requirements:**
- URL pattern matching library (regex-based, platform_configs YAML)
- Duplicate check query against applications table
- FastAPI endpoint that returns platform type and validation status

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.B.2 Job Preview with Match Score

**Description:** After URL detection, the system fetches job metadata and displays a preview card with a match score comparing the job requirements to the user's resume.

**User Story:** As a job seeker, I want to see a preview of the job and how well I match before starting the application so that I can make an informed decision.

**Acceptance Criteria:**
- Preview card shows: job title, company name, location, posting date, salary range (if available), job type (full-time/contract/etc.)
- Match score (0-100%) calculated by LLM comparing resume skills/experience to job description
- Skills breakdown: matched skills, missing skills, bonus skills
- Estimated application time based on platform complexity
- "Start Application" and "Cancel" buttons
- Preview loads within 5 seconds of URL submission
- If metadata cannot be fetched (e.g., login required), show: "We'll need to navigate to this page to see details. Start anyway?"

**Technical Requirements:**
- Job metadata scraping via AdsPower browser session (or API where available)
- LLM match scoring call (Claude Sonnet 4.5 or GPT-4.1 mini)
- Caching of job metadata for deduplication

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.B.3 Pre-Fill Preview

**Description:** Before starting automation, show the user exactly what data will be entered into each field. Each field displays the planned value and a confidence score.

**User Story:** As a job seeker, I want to review what the system plans to fill in before it starts so that I can catch any errors upfront.

**Acceptance Criteria:**
- Preview shows all fields that will be filled, organized by form section
- Each field shows: field label, planned value, source (resume / Q&A bank / LLM-generated), confidence score (0-100%)
- Fields with confidence < 80% are highlighted in yellow
- Fields with confidence < 60% are highlighted in red with "Review recommended" badge
- User can edit any field inline before starting
- User can toggle between "Review before submit" mode and "Auto-submit" mode
- "Approve & Start" button begins automation with the previewed data
- Preview data is determined by analyzing the target platform's known form structure
- For LinkedIn Easy Apply (known structure): full preview available
- For unknown forms: preview shows only profile data with note "Additional fields will be determined during application"

**Technical Requirements:**
- Platform-specific form field prediction (based on workflow templates)
- Confidence scoring algorithm (rule-based for known fields, LLM-based for screening questions)
- Frontend editable preview component

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.B.4 One-Click "Start Application"

**Description:** Single button that triggers the entire automation pipeline: provisions a browser, navigates to the job, fills the form, answers questions, uploads resume, and submits.

**User Story:** As a job seeker, I want to click one button and have my application completed so that I can move on to the next opportunity.

**Acceptance Criteria:**
- "Start Application" button triggers POST to `/api/v1/applications`
- Immediate response with application ID and WebSocket channel for real-time updates
- Button shows loading state, then transitions to progress view
- Application enters queue and is picked up by the next available worker
- If no worker is available, show estimated wait time
- User can cancel at any point before submission
- Only one active application per user at a time (MVP); concurrent applications in v1.1+

**Technical Requirements:**
- Hatchet workflow trigger via FastAPI
- WebSocket channel creation for real-time updates
- Application record creation in PostgreSQL
- Worker pool management

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.B.5 Bulk URL Submission

**Description:** Submit multiple job URLs at once. The system validates all URLs, shows a preview table, and processes them sequentially.

**User Story:** As a power user, I want to submit 10-20 job URLs at once so that I can batch my application sessions.

**Acceptance Criteria:**
- Textarea for pasting multiple URLs (one per line) or CSV upload
- Validation of all URLs with platform detection
- Preview table: URL, platform, job title (if fetchable), match score, status
- User can remove individual URLs from the batch before starting
- "Start Batch" button processes applications sequentially
- Batch progress dashboard showing overall and per-application status
- Configurable delay between applications (default: 2 minutes)
- If one application fails, the batch continues with the next
- Batch can be paused or cancelled at any point
- Maximum batch size: 25 URLs

**Technical Requirements:**
- Bulk application creation endpoint
- Batch workflow in Hatchet (sequential with configurable delays)
- Batch-level status tracking

**Priority:** P1 (v1.1)
**Estimated Effort:** M

---

#### 4.B.6 Browser Extension One-Click

**Description:** A Chrome extension button that appears on job listing pages, allowing users to submit applications directly from the job board without visiting the WeKruit dashboard.

**User Story:** As a job seeker browsing LinkedIn, I want to click a button on the job posting itself to start an application so that I never need to leave the page.

**Acceptance Criteria:**
- Extension detects job posting pages (extends existing `websiteDetection.ts`)
- Floating "Apply with WeKruit" button appears on supported platforms
- One click sends the current page URL to the backend
- Toast notification: "Application started. We'll notify you when done."
- Extension popup shows mini dashboard with recent application statuses
- Extension requires user to be logged in (check JWT token)
- Works on LinkedIn, Greenhouse, Lever job pages

**Technical Requirements:**
- Chrome extension content script updates
- Platform detection matching (URL patterns)
- Extension <-> backend API communication
- Extension auth state management

**Priority:** P1 (v1.1)
**Estimated Effort:** L

---

### 4.C Core Automation Engine (Backend)

#### 4.C.1 AdsPower Browser Profile Provisioning

**Description:** Each user gets a dedicated AdsPower browser profile with a unique device fingerprint. Profiles are reused across sessions to maintain cookie persistence and fingerprint consistency.

**User Story:** As the system, I need isolated browser environments for each user so that platform detection is minimized and sessions persist.

**Acceptance Criteria:**
- One AdsPower profile per user per platform (e.g., user has separate LinkedIn and Greenhouse profiles)
- Profile includes: unique canvas fingerprint, WebGL renderer, timezone, language, screen resolution, User-Agent
- Profile is created on first use and reused thereafter
- Profiles are pooled: if a user's profile is idle, it can be started/stopped efficiently
- Browser start returns CDP WebSocket URL within 10 seconds
- If profile fails to start after 3 attempts, create a new profile and migrate
- Orphaned browsers (running > 30 minutes without active task) are automatically stopped
- Profile cleanup job runs every 5 minutes

**Technical Requirements:**
- AdsPower Local API integration (`POST /api/v1/user/create`, `POST /api/v1/browser/start`, `POST /api/v1/browser/stop`)
- Profile pool manager (acquire/release pattern)
- PostgreSQL browser_profiles table
- Health check and cleanup background job

**Priority:** P0 (MVP)
**Estimated Effort:** L

---

#### 4.C.2 Proxy Binding (IPRoyal Sticky Residential)

**Description:** Each browser profile is bound to a sticky residential proxy IP. The same IP is used for all sessions of that profile, maintaining geographic and network consistency.

**User Story:** As the system, I need consistent IP addresses per browser profile so that platform fingerprinting sees a real residential connection.

**Acceptance Criteria:**
- Each browser profile has a dedicated sticky residential IP (24-hour session)
- IP country matches the user's stated location (or US by default)
- Proxy is configured at the AdsPower profile level (all browser traffic routes through it)
- If proxy is blocked (HTTP 403/429), automatically rotate to a new IP from the same region
- Banned IPs are blacklisted for 24 hours
- Proxy health check before each application (verify IP via ipify.org)
- Maximum 1 browser session per proxy IP at any time

**Technical Requirements:**
- IPRoyal API integration for proxy provisioning
- Proxy configuration in AdsPower profile settings
- PostgreSQL proxy_bindings table
- IP rotation logic with blacklist tracking

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.C.3 Browser-Use CDP Connection

**Description:** The Browser-Use library connects to the AdsPower browser via Chrome DevTools Protocol (CDP), enabling programmatic control of the browser for navigation, form filling, and interaction.

**User Story:** As the system, I need programmatic control of the anti-detect browser so that I can automate form filling while maintaining the fingerprint protections.

**Acceptance Criteria:**
- Browser-Use connects to AdsPower browser via CDP WebSocket URL
- Connection established within 5 seconds of browser start
- Automatic reconnection on CDP WebSocket drop (3 attempts with exponential backoff)
- All browser actions go through CDP: navigation, DOM queries, element interaction, file upload, screenshot capture
- The LLM agent is unaware it is controlling an anti-detect browser (transparent abstraction)
- CDP connection is closed gracefully on task completion
- Heartbeat monitoring: if no CDP activity for 60 seconds during an active task, trigger recovery

**Technical Requirements:**
- Browser-Use library with CDP configuration (`BrowserConfig(cdp_url=...)`)
- WebSocket connection management with reconnection logic
- Integration with Hatchet worker tasks

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.C.4 Hybrid Form Filling (DOM Selectors + LLM Vision Fallback)

**Description:** A 3-layer interaction strategy that maximizes reliability while minimizing detection risk. Layer 1 uses DOM selectors for known platforms. Layer 2 uses the accessibility tree for unknown forms. Layer 3 falls back to LLM vision (screenshot analysis) when DOM methods fail.

**User Story:** As the system, I need to reliably fill forms across different platforms, even when the DOM structure is unexpected.

**Acceptance Criteria:**
- **Layer 1 (DOM/RPA):** For known platforms (LinkedIn, Greenhouse, Lever), use pre-defined CSS selectors from workflow templates. Expected to handle 80% of interactions.
- **Layer 2 (Accessibility Tree + LLM):** For unknown forms or when Layer 1 selectors fail, extract the accessibility tree and send it to the LLM for field mapping. Expected to handle 15% of interactions.
- **Layer 3 (Vision/Screenshot):** When DOM methods fail entirely (e.g., canvas-based UI, shadow DOM), capture a screenshot and use Claude Sonnet 4.5 Computer Use to identify elements and generate click coordinates. Expected to handle 5% of interactions.
- Automatic escalation: if Layer 1 selector not found within 3 seconds, try Layer 2; if Layer 2 fails, try Layer 3
- All form interactions include human-like delays: 2-5 seconds of "thinking time" before filling, randomized typing speed (50-150ms per character), mouse movements to elements before clicking
- File uploads handled via CDP `Input.setFiles` (not drag-and-drop simulation)
- Dropdown/select handled via both DOM selection and click-based selection (platform-dependent)

**Technical Requirements:**
- Platform-specific workflow templates (YAML configuration)
- Browser-Use DOM extraction and element interaction
- Claude Sonnet 4.5 Computer Use API for vision fallback
- Human-like delay injection (normally distributed random delays)
- Action logging (every interaction is recorded with timestamp, selector, value, confidence)

**Priority:** P0 (MVP)
**Estimated Effort:** XL

---

#### 4.C.5 LLM Model Routing

**Description:** A 3-tier model routing system that directs each LLM call to the most cost-effective model capable of handling it, reducing per-application LLM cost from $0.045 to $0.021.

**User Story:** As the system, I need to optimize LLM costs without sacrificing quality so that the product is economically viable at scale.

**Acceptance Criteria:**
- **Premium tier (Claude Sonnet 4.5):** Used for form analysis, screening answer generation, screenshot understanding, complex decision-making. ~2-3 calls per application.
- **Mid tier (GPT-4.1 mini):** Used for field mapping, error recovery, simple form filling. ~3-5 calls per application.
- **Budget tier (GPT-4.1 nano):** Used for confirmation checks, navigation decisions, dropdown selection. ~2-3 calls per application.
- Routing is rule-based in MVP (task type determines model), with ML-based routing in v2.0
- Fallback chain: if primary model is unavailable, route to the next tier up (e.g., GPT-4.1 mini fails -> escalate to Claude Sonnet 4.5)
- Multi-provider fallback: Claude -> GPT-4o -> Gemini 2.5 Pro for critical tasks
- Per-application token budget cap: 50,000 tokens maximum (abort with error if exceeded)
- Per-application cost cap: $0.50 maximum
- All LLM calls routed through LiteLLM unified interface
- Prompt caching enabled for repeated form structures (up to 90% input cost reduction)

**Technical Requirements:**
- LiteLLM library for unified API across providers
- Model routing configuration (YAML or database-driven)
- Token counting and budget enforcement
- Prompt caching implementation (Anthropic prompt caching API)
- LLM usage logging (model, tokens, cost, latency per call)

**Priority:** P0 (MVP for single-model), P1 (v1.1 for full routing)
**Estimated Effort:** L

---

#### 4.C.6 Hatchet Workflow Orchestration

**Description:** Hatchet provides durable workflow execution with native pause/resume for human-in-the-loop scenarios. Each job application is a Hatchet workflow with defined steps, timeouts, retry policies, and durable event waits.

**User Story:** As the system, I need reliable workflow execution that survives crashes, supports human intervention, and provides built-in monitoring.

**Acceptance Criteria:**
- Each application is a Hatchet workflow with the following steps:
  1. `ProvisionBrowser` -- Start AdsPower profile, bind proxy, get CDP URL
  2. `NavigateToJob` -- Open job URL, wait for page load
  3. `AnalyzePage` -- Detect platform, load workflow template
  4. `FillForm` -- Execute hybrid form filling (DOM + LLM)
  5. `HandleScreeningQuestions` -- Answer questions from Q&A bank + LLM
  6. `WaitForHuman` (conditional) -- Durable event wait for CAPTCHA/review
  7. `SubmitApplication` -- Click submit, wait for confirmation
  8. `VerifySubmission` -- Check for success indicators
  9. `Cleanup` -- Stop browser, store results, notify user
- Each step has a timeout (configurable per step, defaults in workflow template)
- Each step has a retry policy (max 3 retries with exponential backoff)
- Durable events for human-in-the-loop: `UserEventCondition("captcha:solved")`, `UserEventCondition("review:approved")`
- Hatchet built-in rate limiting: max 100 concurrent workflows globally, max 5 per user
- Hatchet built-in monitoring UI accessible to ops team
- Workflow state persisted in PostgreSQL (shared with app data)
- Crash recovery: if a worker dies, the workflow resumes from the last completed step

**Technical Requirements:**
- Hatchet self-hosted deployment (single binary + PostgreSQL)
- Hatchet Python SDK with async workers
- Workflow definition as Python class with `@hatchet.task` decorators
- Durable event emission from FastAPI endpoints (when user solves CAPTCHA)
- Hatchet webhook or polling for status updates relayed via WebSocket

**Priority:** P0 (MVP)
**Estimated Effort:** XL

---

#### 4.C.7 Checkpoint and Crash Recovery

**Description:** Every state transition during an application is checkpointed to the database. If a worker crashes or the system restarts, the workflow resumes from the last checkpoint rather than restarting from scratch.

**User Story:** As a user, I want my application to continue from where it left off if something goes wrong, rather than starting over.

**Acceptance Criteria:**
- State checkpoints saved at every workflow step transition
- Checkpoint data includes: current step, form fields already filled, screenshot of current state, browser session state
- On crash recovery, system determines if the browser session is still alive (CDP health check)
- If browser alive: reconnect and continue from checkpoint
- If browser dead: restart browser, navigate back to the form, verify partially filled state, continue
- If form state has been lost (page refreshed, session expired): restart the application from scratch with notification to user
- Maximum recovery time: 30 seconds from crash detection to resumed execution
- All checkpoint operations are idempotent (safe to replay)

**Technical Requirements:**
- ApplicationEvents table for checkpoint storage
- Hatchet's built-in durable execution handles most crash recovery
- CDP session health check endpoint
- Form state verification logic (compare expected filled fields with actual DOM state)

**Priority:** P0 (MVP)
**Estimated Effort:** L

---

### 4.D Real-Time Progress and Tracking

#### 4.D.1 WebSocket-Driven Live Status Updates

**Description:** A persistent WebSocket connection between the frontend and backend delivers real-time updates about application progress, state changes, and notifications.

**User Story:** As a job seeker, I want to see exactly what the system is doing in real-time so that I feel confident it is working correctly.

**Acceptance Criteria:**
- WebSocket connection established on dashboard load
- Auto-reconnect with exponential backoff on connection drop
- Missed messages queued and delivered on reconnect
- Message types: `task_update`, `human_takeover`, `task_complete`, `task_error`, `notification`
- Updates include: current state, progress percentage, current step description, per-field completion log, confidence scores
- Updates delivered at minimum every 2 seconds during active automation
- Connection authenticated via JWT token in initial handshake
- User only receives updates for their own applications (RLS-enforced)

**Technical Requirements:**
- FastAPI WebSocket endpoint (`/api/v1/ws`)
- Redis Pub/Sub for relaying worker status to WebSocket server
- JWT authentication on WebSocket handshake
- Message queuing for reconnection scenarios
- Connection pool management

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.D.2 Step-by-Step Progress Display

**Description:** A visual progress component showing the current state of the application workflow with completed, active, and pending steps.

**User Story:** As a job seeker, I want to see a clear progress indicator showing which step my application is on.

**Acceptance Criteria:**
- Progress states displayed as a linear stepper:
  `Queued -> Navigating -> Analyzing -> Filling Form -> Answering Questions -> Submitting -> Verifying -> Done`
- Current step highlighted with spinner animation
- Completed steps show green checkmark with timestamp
- Failed steps show red X with error description
- Percentage progress bar (0-100%) above stepper
- Estimated time remaining based on historical averages for this platform

**Technical Requirements:**
- Frontend React component consuming WebSocket updates
- Historical timing data for ETA calculation

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.D.3 Per-Field Confidence Scores

**Description:** Each form field filled by the system displays a confidence score indicating how certain the system is about the value it entered.

**User Story:** As a job seeker, I want to know which answers the system is confident about and which it is guessing so that I can review the uncertain ones.

**Acceptance Criteria:**
- Confidence scores: 0-100% per field
- Visual indicators: Green (90-100%), Yellow (70-89%), Orange (50-69%), Red (< 50%)
- Fields sourced from resume/profile: 100% confidence
- Fields sourced from Q&A bank with exact match: 95-100% confidence
- Fields sourced from Q&A bank with semantic match: 70-90% confidence
- Fields generated by LLM: 50-85% confidence (based on LLM's self-assessed uncertainty)
- Fields where "Decline to answer" was chosen: shown as "Skipped" with reason
- Confidence scores displayed in real-time log during automation and in post-application summary

**Technical Requirements:**
- Confidence scoring logic in form-filling pipeline
- WebSocket message format includes confidence per field
- Frontend confidence display components

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.D.4 Live Screenshot Preview

**Description:** Periodic screenshots of the browser session are captured and displayed to the user during automation, providing visual confirmation of what the system is doing.

**User Story:** As a job seeker, I want to see what the browser looks like while it is filling my application so that I can verify it is working correctly.

**Acceptance Criteria:**
- Screenshots captured every 5 seconds during active automation
- Displayed as a live preview panel alongside the progress stepper
- Screenshots are compressed (JPEG, 80% quality) to minimize bandwidth
- Screenshot history scrollable (user can scroll back to see previous states)
- Pre-submit screenshot prominently displayed for final review
- Post-submit confirmation screenshot saved permanently with the application record
- Screenshots encrypted at rest (AES-256) and in transit (TLS 1.3)
- Screenshots deleted after 30 days (configurable in user preferences)
- PII visible in screenshots is acknowledged in privacy policy

**Technical Requirements:**
- CDP `Page.captureScreenshot` called on a timer during automation
- Image compression pipeline
- WebSocket binary frame delivery or base64-encoded URL
- S3 storage for persistent screenshots
- Cleanup job for expired screenshots

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.D.5 Application History with Filters/Search

**Description:** A searchable, filterable table of all past applications with status, timestamps, and details.

**User Story:** As a job seeker, I want to see a history of all my applications so that I can track my progress and avoid duplicates.

**Acceptance Criteria:**
- Table columns: Date, Company, Position, Platform, Status, Duration, Match Score, Actions
- Statuses: Completed, Failed, Cancelled, In Progress, Pending Review
- Filters: by status, by platform, by date range, by company
- Search: by company name or position title
- Sort: by date (default newest first), by company, by status
- Pagination: 25 per page with infinite scroll option
- Click on a row to expand details: field-by-field log, screenshots, error details, confidence scores
- Export as CSV (v1.1)
- Duplicate warning when submitting a URL that already exists in history

**Technical Requirements:**
- FastAPI endpoint with query parameters for filtering, sorting, pagination
- PostgreSQL indexed queries on applications table
- Frontend table component with filtering UI

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

### 4.E Human-in-the-Loop

#### 4.E.1 CAPTCHA Detection

**Description:** The system detects CAPTCHAs via multiple methods and immediately pauses automation when one is encountered.

**User Story:** As the system, I need to detect CAPTCHAs so that I can pause and request human help instead of failing.

**Acceptance Criteria:**
- **DOM-based detection:** iframe src containing "captcha", "recaptcha", "hcaptcha", "challenge"; elements with captcha-related class names or IDs
- **URL-based detection:** redirect to checkpoint/challenge URLs (e.g., `linkedin.com/checkpoint/challenge`)
- **Content-based detection:** page text contains "verify you're human", "prove you're not a robot", "security check"
- **Visual detection:** screenshot sent to LLM for CAPTCHA identification (fallback for novel CAPTCHA types)
- Detection latency: < 2 seconds from CAPTCHA appearance
- On detection: immediately stop all DOM interaction, take screenshot, save checkpoint, transition to NEED_CAPTCHA state

**Technical Requirements:**
- DOM pattern matching (CSS selectors + MutationObserver)
- URL pattern matching on navigation events
- Text content scanning on page load
- Optional LLM visual classification for unknown CAPTCHAs

**Priority:** P0 (MVP)
**Estimated Effort:** M

---

#### 4.E.2 noVNC Remote Browser Takeover

**Description:** When the system needs human help (CAPTCHA, ambiguous question, unexpected UI), it exposes the browser session via noVNC, allowing the user to interact directly with the browser in a web-based viewer.

**User Story:** As a job seeker, I want to see and control the remote browser when it gets stuck so that I can solve the problem and let automation continue.

**Acceptance Criteria:**
- noVNC viewer embedded in the dashboard as a modal or panel
- Connection established within 3 seconds of opening
- User can see the full browser viewport
- User can click, type, and scroll within the remote browser
- Latency: < 300ms input-to-screen (acceptable for CAPTCHA solving)
- "Resume Automation" button clearly visible above the noVNC viewer
- Auto-detection: if CAPTCHA disappears from DOM, offer to auto-resume
- Session timeout: if user does not interact within the timeout policy, the session is released
- Multiple simultaneous takeover sessions not supported in MVP (one at a time)

**Technical Requirements:**
- noVNC server (Xvfb + x11vnc + websockify) per browser worker
- WebSocket-based noVNC client in the frontend
- Secure WebSocket connection (wss://) with authentication
- Session management (start/stop VNC server on demand)

**Priority:** P0 (MVP)
**Estimated Effort:** L

---

#### 4.E.3 "Resume Automation" Signal

**Description:** After the user resolves the issue in the remote browser, they signal the system to resume automation by clicking a button. The system verifies the obstacle is cleared and continues from the checkpoint.

**User Story:** As a job seeker, I want to click a single button after solving a CAPTCHA to let the system continue.

**Acceptance Criteria:**
- "Resume Automation" button prominently displayed during takeover
- On click: system verifies the CAPTCHA/obstacle is no longer present in the DOM
- If obstacle cleared: automation resumes from checkpoint, noVNC viewer closes
- If obstacle still present: "It looks like the issue hasn't been resolved yet. Please try again or cancel."
- Alternative: auto-detect resolution (DOM polling for CAPTCHA removal) and offer "CAPTCHA solved! Resume now?"
- Signal sent as a Hatchet durable event (`captcha:solved`) to wake the paused workflow

**Technical Requirements:**
- FastAPI endpoint: `POST /api/v1/applications/{id}/captcha-solved`
- Hatchet durable event emission
- DOM verification logic in the worker
- Frontend button with state management

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.E.4 Timeout Policy

**Description:** A tiered timeout policy for human-in-the-loop scenarios to prevent applications from being stuck indefinitely.

**User Story:** As the system, I need to handle cases where the user does not respond to takeover requests so that resources are not wasted.

**Acceptance Criteria:**
- **0-5 minutes:** Waiting. Notifications sent every 2 minutes (push + in-app).
- **5-15 minutes:** Warning notification: "Your application is waiting for you. It will be cancelled in 15 minutes."
- **15-30 minutes:** Final warning: "Last chance! Application will be cancelled in [remaining] minutes."
- **30 minutes:** Application cancelled. Resources released. Status set to "Cancelled (Timeout)". User notified.
- Timeout is configurable in user preferences (minimum 5 minutes, maximum 60 minutes)
- Timer resets if user interacts with the noVNC session
- User can extend timeout by clicking "I need more time" (adds 15 minutes, once)

**Technical Requirements:**
- Hatchet `SleepCondition` with the configured timeout
- Progressive notification scheduling
- Timer reset on user activity detection
- Application status update on timeout

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.E.5 Low-Confidence Field Review

**Description:** When the system fills a field with low confidence (< 60%), it pauses and asks the user to review that specific field before continuing.

**User Story:** As a job seeker, I want the system to ask me about answers it is unsure about so that my applications are accurate.

**Acceptance Criteria:**
- Threshold configurable: default 60%, user can set 0% (never pause) to 100% (always pause)
- When triggered, system pauses at that field and sends a review request via WebSocket
- Review request shows: the question, the AI's proposed answer, the confidence score, and the source
- User can: Approve (use as-is), Edit (provide different answer), Skip (leave blank if optional)
- If user approves/edits: answer is used, and user is offered "Save to Q&A bank?"
- Automation resumes immediately after user response
- If user does not respond within 5 minutes: use the AI's answer and flag it in the post-application summary

**Technical Requirements:**
- Confidence threshold configuration in user preferences
- WebSocket review request message type
- Hatchet durable event wait for review response
- Q&A bank update prompt logic

**Priority:** P1 (v1.1)
**Estimated Effort:** M

---

### 4.F Notification System

#### 4.F.1 In-App Notifications

**Description:** Real-time notifications within the WeKruit dashboard for application events, system alerts, and updates.

**User Story:** As a job seeker, I want to see notifications in the app when something needs my attention.

**Acceptance Criteria:**
- Notification bell icon in header with unread count badge
- Notification panel shows list of recent notifications with timestamps
- Notification types: application completed, application failed, CAPTCHA needs solving, review needed, session expired, system announcement
- Click on notification navigates to the relevant application or settings page
- Mark as read (individual or all)
- Notifications persist for 30 days

**Technical Requirements:**
- PostgreSQL notifications table
- WebSocket delivery for real-time
- Frontend notification component

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.F.2 Email Notifications

**Description:** Email notifications for important events, delivered to the user's Gmail address.

**User Story:** As a job seeker, I want to receive email notifications when something important happens so that I do not miss urgent items.

**Acceptance Criteria:**
- Email sent for: application completed (summary), application failed (with reason), CAPTCHA waiting (with link to dashboard), daily/weekly digest (if enabled)
- Email templates: clean, mobile-friendly HTML
- Unsubscribe link in every email
- Configurable: per-event toggle in notification preferences
- Delivery via transactional email service (SendGrid, Resend, or AWS SES)
- Rate limited: maximum 20 emails per user per day

**Technical Requirements:**
- Transactional email service integration
- Email template engine (Jinja2 or similar)
- Notification preference checks before sending
- Unsubscribe handling

**Priority:** P1 (v1.1)
**Estimated Effort:** M

---

#### 4.F.3 Push Notifications (PWA)

**Description:** Browser push notifications for time-sensitive events like CAPTCHA detection.

**User Story:** As a job seeker, I want to get a push notification when the system needs my help so that I can respond quickly.

**Acceptance Criteria:**
- Service Worker registration for push notifications
- Push sent for: CAPTCHA detected, low-confidence review needed, application completed
- User must explicitly opt in to push notifications
- Push includes: title, body, and deep link to the relevant application
- Respect OS-level Do Not Disturb settings

**Technical Requirements:**
- Web Push API (VAPID keys)
- Service Worker with push event handler
- Push subscription storage in PostgreSQL

**Priority:** P1 (v1.1)
**Estimated Effort:** M

---

#### 4.F.4 Digest Mode

**Description:** Aggregated notification summaries delivered at configurable intervals instead of per-event notifications.

**User Story:** As a job seeker who applies to many jobs, I want a summary instead of individual notifications so that my inbox is not flooded.

**Acceptance Criteria:**
- Digest options: hourly, daily (default 9 AM local time), weekly (Monday 9 AM)
- Digest includes: applications completed since last digest, applications failed, pending reviews, overall stats
- User can switch between real-time and digest mode per notification channel
- Digest delivered via email; in-app notifications always remain real-time

**Technical Requirements:**
- Scheduled digest job (Hatchet cron or separate scheduler)
- Digest template rendering
- User timezone handling

**Priority:** P2 (v2.0)
**Estimated Effort:** S

---

### 4.G Settings and Profile

#### 4.G.1 Resume Data Management

**Description:** Full CRUD interface for managing resume files and parsed profile data.

**User Story:** As a job seeker, I want to manage my resume versions and update my profile data at any time.

**Acceptance Criteria:**
- View all uploaded resumes with upload date and parsed status
- Upload new resume (triggers re-parsing)
- Set default resume for applications
- Delete resume (file deleted from storage, parsed data optionally retained)
- Edit parsed profile fields at any time (changes apply to future applications)
- Re-parse an existing resume (e.g., after LLM improvements)
- Maximum 5 resumes per user

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.G.2 Q&A Bank CRUD

**Description:** Full management interface for screening question-answer pairs.

**User Story:** As a job seeker, I want to manage my screening answers so that I can keep them up to date.

**Acceptance Criteria:**
- List all Q&A pairs with category, question, answer, and usage mode
- Add new Q&A pair with category selection
- Edit existing Q&A pair
- Delete Q&A pair
- Bulk import Q&A pairs (CSV)
- Search Q&A pairs by question text
- View usage stats: how many times each answer has been used

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.G.3 Notification Preferences

**Description:** Granular control over which notifications are delivered via which channels.

**User Story:** As a job seeker, I want to control which notifications I receive and how.

**Acceptance Criteria:**
- Per-event type toggle for each channel (in-app, email, push)
- Quiet hours configuration (e.g., no push notifications 10 PM - 8 AM)
- Digest mode toggle (hourly/daily/weekly/off)
- Global mute option (mute all notifications temporarily)

**Priority:** P1 (v1.1)
**Estimated Effort:** S

---

#### 4.G.4 Automation Behavior

**Description:** Controls for how the automation system behaves, including submission mode and rate limits.

**User Story:** As a job seeker, I want to control how aggressive the automation is so that I balance speed with safety.

**Acceptance Criteria:**
- Submission mode: "Review before submit" (default) vs. "Auto-submit if confidence > X%"
- Confidence threshold slider: 0-100% (default 90%)
- Low-confidence review: pause on fields below threshold vs. use best guess
- Daily application limit: 1-50 (default 20)
- Minimum delay between applications: 1-10 minutes (default 2)
- Platform-specific rate limits displayed (read-only, system-enforced)

**Priority:** P0 (MVP)
**Estimated Effort:** S

---

#### 4.G.5 Subscription Management

**Description:** View and manage subscription plan, billing, and usage.

**User Story:** As a job seeker, I want to see my current plan and usage so that I know if I need to upgrade.

**Acceptance Criteria:**
- Current plan displayed: Free, Starter, Pro, Enterprise
- Usage meter: applications used / limit this month
- Upgrade/downgrade options with plan comparison
- Billing history (invoices)
- Cancel subscription option
- Plan limits enforced server-side (cannot exceed application limits)

**Pricing Tiers:**

| Tier | Price | Apps/Month | Platforms | Key Features |
|------|-------|-----------|-----------|-------------|
| Free | $0 | 5 | LinkedIn Easy Apply | Basic dashboard |
| Starter | $19/mo | 50 | LinkedIn Easy Apply | Full dashboard, Q&A bank |
| Pro | $49/mo | 200 | LinkedIn + Greenhouse + Lever | Analytics, bulk submission, AI cover letters |
| Enterprise | $99/mo | 500* | All platforms | Priority processing, API access, multi-candidate |

*Soft cap; $0.25 per additional application beyond 500.

**Priority:** P1 (v1.1)
**Estimated Effort:** L

---

### 4.H Admin and Analytics

#### 4.H.1 Application Success/Failure Rates

**Description:** Dashboard showing aggregate success and failure rates across all applications, filterable by platform, time range, and user cohort.

**User Story:** As a product owner, I want to monitor application success rates so that I can identify and fix problems quickly.

**Acceptance Criteria:**
- Success rate: applications that reached "Completed" status / total attempts
- Failure breakdown by reason: CAPTCHA timeout, session expired, form error, platform not supported, unknown error
- Platform-specific success rates (LinkedIn vs Greenhouse vs Lever)
- Trend lines: daily/weekly success rate over time
- Alerting: if success rate drops below 80% for any platform, trigger alert

**Priority:** P1 (v1.1)
**Estimated Effort:** M

---

#### 4.H.2 Performance Metrics

**Description:** Operational metrics including application timing, LLM costs, and resource utilization.

**User Story:** As an operations lead, I want to monitor system performance and costs so that I can optimize operations.

**Acceptance Criteria:**
- Average time per application by platform
- P50/P95/P99 application duration
- LLM cost per application (broken down by model)
- Total monthly LLM spend with trend
- Worker utilization (active/idle/total)
- Queue depth and wait times
- CAPTCHA encounter rate and resolution time

**Priority:** P1 (v1.1)
**Estimated Effort:** M

---

#### 4.H.3 User Engagement Metrics

**Description:** User-level analytics for understanding product engagement and retention.

**User Story:** As a product manager, I want to understand how users engage with the product so that I can improve retention.

**Acceptance Criteria:**
- Daily/weekly/monthly active users
- Applications per user per week (distribution)
- Retention cohorts (week-over-week)
- Funnel: sign-up -> resume upload -> first application -> 10th application
- Feature adoption: Q&A bank usage, bulk mode usage, extension usage
- NPS survey (quarterly)

**Priority:** P2 (v2.0)
**Estimated Effort:** M

---

## 5. API Specification

All endpoints require authentication via JWT Bearer token unless otherwise noted. Rate limits are per-user unless otherwise noted. All request/response bodies are JSON (`Content-Type: application/json`) unless otherwise noted.

**Base URL:** `https://api.wekruit.com/api/v1`

### 5.1 Authentication

#### `POST /auth/google`

Exchange Google OAuth authorization code for WeKruit JWT tokens.

| Field | Value |
|-------|-------|
| Auth Required | No |
| Rate Limit | 10/minute per IP |

**Request Body:**
```json
{
  "code": "4/0AY0e-g7...",
  "redirect_uri": "https://app.wekruit.com/auth/callback"
}
```

**Response (201 Created -- new user / 200 OK -- existing user):**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "dGhpcyBpcyBhIHJlZnJl...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "usr_abc123",
    "email": "user@gmail.com",
    "name": "Adam Smith",
    "avatar_url": "https://lh3.googleusercontent.com/...",
    "subscription_tier": "free",
    "created_at": "2026-02-11T10:00:00Z"
  }
}
```

**Errors:** `400` invalid code, `429` rate limited

---

#### `GET /auth/me`

Get the currently authenticated user.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 60/minute |

**Response (200 OK):**
```json
{
  "id": "usr_abc123",
  "email": "user@gmail.com",
  "name": "Adam Smith",
  "avatar_url": "https://lh3.googleusercontent.com/...",
  "subscription_tier": "starter",
  "preferences": {
    "submission_mode": "review_before_submit",
    "confidence_threshold": 90,
    "daily_limit": 20,
    "min_delay_minutes": 2
  },
  "stats": {
    "total_applications": 47,
    "success_rate": 0.89,
    "active_resumes": 2
  },
  "created_at": "2026-02-11T10:00:00Z"
}
```

**Errors:** `401` unauthorized

---

#### `POST /auth/refresh`

Exchange a refresh token for a new access token.

| Field | Value |
|-------|-------|
| Auth Required | No (refresh token in body) |
| Rate Limit | 10/minute per IP |

**Request Body:**
```json
{
  "refresh_token": "dGhpcyBpcyBhIHJlZnJl..."
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "bmV3IHJlZnJlc2ggdG9r...",
  "token_type": "Bearer",
  "expires_in": 900
}
```

**Errors:** `401` invalid/expired refresh token

---

### 5.2 Users

#### `GET /users/me/profile`

Get the authenticated user's full profile including parsed resume data.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 30/minute |

**Response (200 OK):**
```json
{
  "id": "usr_abc123",
  "email": "user@gmail.com",
  "name": "Adam Smith",
  "phone": "+1 555-123-4567",
  "location": "San Francisco, CA",
  "linkedin_url": "https://linkedin.com/in/adamsmith",
  "github_url": "https://github.com/adamsmith",
  "portfolio_url": "https://adamsmith.dev",
  "work_history": [
    {
      "company": "Acme Corp",
      "title": "Senior Software Engineer",
      "start_date": "2022-01",
      "end_date": null,
      "description": "Led backend team...",
      "achievements": ["Reduced API latency by 40%"]
    }
  ],
  "education": [
    {
      "school": "UC Berkeley",
      "degree": "B.S. Computer Science",
      "start_date": "2014-08",
      "end_date": "2018-05",
      "gpa": "3.7"
    }
  ],
  "skills": ["Python", "TypeScript", "PostgreSQL", "AWS"],
  "certifications": [],
  "languages": ["English (native)", "Spanish (conversational)"]
}
```

---

#### `PUT /users/me/profile`

Update profile fields. Partial updates supported (send only changed fields).

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 10/minute |

**Request Body (partial update):**
```json
{
  "phone": "+1 555-987-6543",
  "location": "New York, NY",
  "skills": ["Python", "TypeScript", "PostgreSQL", "AWS", "Docker"]
}
```

**Response (200 OK):** Updated full profile object (same as GET).

**Errors:** `400` validation error, `401` unauthorized

---

#### `PUT /users/me/preferences`

Update automation and notification preferences.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 10/minute |

**Request Body:**
```json
{
  "submission_mode": "auto_submit",
  "confidence_threshold": 85,
  "daily_limit": 30,
  "min_delay_minutes": 3,
  "notifications": {
    "email_enabled": true,
    "push_enabled": true,
    "digest_mode": "daily",
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00"
  },
  "takeover_timeout_minutes": 15,
  "screenshot_retention_days": 30
}
```

**Response (200 OK):** Updated preferences object.

---

### 5.3 Resumes

#### `POST /resumes/upload`

Upload a resume file for parsing.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 5/minute |
| Content-Type | multipart/form-data |

**Request:** Multipart form with field `file` (PDF or DOCX, max 10MB)

**Response (201 Created):**
```json
{
  "id": "res_xyz789",
  "filename": "adam_smith_resume_2026.pdf",
  "file_size_bytes": 245760,
  "mime_type": "application/pdf",
  "status": "parsing",
  "uploaded_at": "2026-02-11T10:05:00Z"
}
```

The parsing happens asynchronously. The client should poll `GET /resumes/{id}` or listen on the WebSocket for a `resume_parsed` event.

**Errors:** `400` invalid file type/size, `409` max resume limit reached (5), `401` unauthorized

---

#### `GET /resumes/{id}`

Get a resume and its parsed data.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 30/minute |

**Response (200 OK):**
```json
{
  "id": "res_xyz789",
  "filename": "adam_smith_resume_2026.pdf",
  "file_size_bytes": 245760,
  "status": "parsed",
  "is_default": true,
  "parsed_data": {
    "full_name": "Adam Smith",
    "email": "adam@gmail.com",
    "phone": "+1 555-123-4567",
    "location": "San Francisco, CA",
    "work_history": ["..."],
    "education": ["..."],
    "skills": ["..."],
    "parsing_confidence": 0.94
  },
  "uploaded_at": "2026-02-11T10:05:00Z",
  "parsed_at": "2026-02-11T10:05:08Z"
}
```

**Errors:** `404` not found, `401` unauthorized, `403` not your resume

---

#### `PUT /resumes/{id}`

Update parsed fields (user corrections after review).

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 10/minute |

**Request Body (partial update of parsed_data):**
```json
{
  "parsed_data": {
    "phone": "+1 555-987-6543",
    "skills": ["Python", "TypeScript", "React", "AWS"]
  },
  "is_default": true
}
```

**Response (200 OK):** Updated resume object.

---

#### `DELETE /resumes/{id}`

Delete a resume and its associated file.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 5/minute |

**Response (204 No Content)**

**Errors:** `404` not found, `409` cannot delete the only resume if applications are pending

---

### 5.4 Q&A Bank

#### `GET /qa-bank`

List all Q&A pairs for the authenticated user.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 30/minute |

**Query Parameters:**
- `category` (optional): Filter by category (work_authorization, experience, compensation, availability, identity, custom)
- `search` (optional): Full-text search on question text

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "qa_001",
      "category": "work_authorization",
      "question": "Are you authorized to work in the United States?",
      "answer": "Yes",
      "usage_mode": "always_use",
      "times_used": 23,
      "created_at": "2026-02-11T10:10:00Z",
      "updated_at": "2026-02-11T10:10:00Z"
    },
    {
      "id": "qa_002",
      "category": "compensation",
      "question": "What is your expected salary range?",
      "answer": "$140,000 - $170,000",
      "usage_mode": "ask_each_time",
      "times_used": 8,
      "created_at": "2026-02-11T10:10:00Z",
      "updated_at": "2026-02-15T14:30:00Z"
    }
  ],
  "total": 25
}
```

---

#### `POST /qa-bank`

Add a new Q&A pair.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 20/minute |

**Request Body:**
```json
{
  "category": "experience",
  "question": "How many years of experience do you have with Python?",
  "answer": "7",
  "usage_mode": "always_use"
}
```

**Response (201 Created):** Created Q&A object.

---

#### `PUT /qa-bank/{id}`

Update a Q&A pair.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 20/minute |

**Request Body (partial):**
```json
{
  "answer": "8",
  "usage_mode": "always_use"
}
```

**Response (200 OK):** Updated Q&A object.

---

#### `DELETE /qa-bank/{id}`

Delete a Q&A pair.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 20/minute |

**Response (204 No Content)**

---

### 5.5 Applications

#### `POST /applications`

Submit a new job application. This triggers the full automation workflow.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 5/minute, subject to daily limit |

**Request Body:**
```json
{
  "job_url": "https://www.linkedin.com/jobs/view/1234567890",
  "resume_id": "res_xyz789",
  "preferences": {
    "submission_mode": "review_before_submit",
    "cover_letter": false,
    "custom_answers": {
      "Why are you interested in this role?": "I'm excited about Acme's mission to..."
    }
  }
}
```

**Response (201 Created):**
```json
{
  "id": "app_def456",
  "job_url": "https://www.linkedin.com/jobs/view/1234567890",
  "platform": "linkedin_easy_apply",
  "status": "queued",
  "job_preview": {
    "title": "Senior Software Engineer",
    "company": "Acme Corp",
    "location": "San Francisco, CA (Hybrid)",
    "match_score": 87
  },
  "websocket_channel": "app_def456",
  "created_at": "2026-02-11T10:15:00Z"
}
```

**Errors:** `400` invalid URL / unsupported platform, `402` daily limit reached / subscription required, `409` duplicate application, `401` unauthorized

---

#### `GET /applications`

List applications with filters and pagination.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 30/minute |

**Query Parameters:**
- `status` (optional): completed, failed, cancelled, in_progress, queued
- `platform` (optional): linkedin_easy_apply, greenhouse, lever, workday
- `date_from` (optional): ISO 8601 date
- `date_to` (optional): ISO 8601 date
- `search` (optional): company name or job title
- `sort` (optional): created_at_desc (default), created_at_asc, company_asc
- `page` (optional): page number (default 1)
- `per_page` (optional): items per page (default 25, max 100)

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "app_def456",
      "job_url": "https://www.linkedin.com/jobs/view/1234567890",
      "platform": "linkedin_easy_apply",
      "status": "completed",
      "job_title": "Senior Software Engineer",
      "company": "Acme Corp",
      "location": "San Francisco, CA",
      "match_score": 87,
      "duration_seconds": 94,
      "fields_filled": 12,
      "confidence_avg": 0.92,
      "created_at": "2026-02-11T10:15:00Z",
      "completed_at": "2026-02-11T10:16:34Z"
    }
  ],
  "total": 47,
  "page": 1,
  "per_page": 25,
  "pages": 2
}
```

---

#### `GET /applications/{id}`

Get detailed application data including field-by-field log and screenshots.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 30/minute |

**Response (200 OK):**
```json
{
  "id": "app_def456",
  "job_url": "https://www.linkedin.com/jobs/view/1234567890",
  "platform": "linkedin_easy_apply",
  "status": "completed",
  "job_title": "Senior Software Engineer",
  "company": "Acme Corp",
  "location": "San Francisco, CA",
  "match_score": 87,
  "duration_seconds": 94,
  "resume_used": "res_xyz789",
  "fields": [
    {
      "field_name": "First Name",
      "value": "Adam",
      "source": "resume",
      "confidence": 1.0,
      "filled_at": "2026-02-11T10:15:12Z"
    },
    {
      "field_name": "Years of Python experience",
      "value": "7",
      "source": "qa_bank",
      "confidence": 0.95,
      "filled_at": "2026-02-11T10:15:18Z"
    },
    {
      "field_name": "Why are you interested?",
      "value": "I'm excited about Acme's mission...",
      "source": "llm_generated",
      "confidence": 0.78,
      "filled_at": "2026-02-11T10:15:25Z"
    }
  ],
  "events": [
    {"timestamp": "2026-02-11T10:15:00Z", "event": "queued"},
    {"timestamp": "2026-02-11T10:15:02Z", "event": "provisioning"},
    {"timestamp": "2026-02-11T10:15:06Z", "event": "navigating"},
    {"timestamp": "2026-02-11T10:15:10Z", "event": "filling_form"},
    {"timestamp": "2026-02-11T10:16:28Z", "event": "submitting"},
    {"timestamp": "2026-02-11T10:16:32Z", "event": "verifying"},
    {"timestamp": "2026-02-11T10:16:34Z", "event": "completed"}
  ],
  "screenshots": {
    "pre_submit": "https://storage.wekruit.com/screenshots/app_def456_pre.jpg",
    "post_submit": "https://storage.wekruit.com/screenshots/app_def456_post.jpg"
  },
  "llm_usage": {
    "total_tokens": 8420,
    "total_cost_usd": 0.019,
    "models_used": ["claude-sonnet-4-5", "gpt-4.1-mini"]
  },
  "created_at": "2026-02-11T10:15:00Z",
  "completed_at": "2026-02-11T10:16:34Z"
}
```

---

#### `POST /applications/{id}/cancel`

Cancel a pending or in-progress application.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 10/minute |

**Response (200 OK):**
```json
{
  "id": "app_def456",
  "status": "cancelled",
  "cancelled_at": "2026-02-11T10:15:45Z"
}
```

**Errors:** `404` not found, `409` application already completed/cancelled

---

#### `POST /applications/{id}/captcha-solved`

Signal that the user has solved a CAPTCHA in the remote browser session.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 10/minute |

**Request Body:**
```json
{
  "resolution": "captcha_solved"
}
```

**Response (200 OK):**
```json
{
  "id": "app_def456",
  "status": "filling_form",
  "message": "Automation resumed. Continuing from where we left off."
}
```

**Errors:** `404` not found, `409` application not in CAPTCHA state

---

#### `GET /applications/{id}/screenshots`

Get all screenshots for an application.

| Field | Value |
|-------|-------|
| Auth Required | Yes |
| Rate Limit | 30/minute |

**Response (200 OK):**
```json
{
  "screenshots": [
    {
      "id": "ss_001",
      "type": "progress",
      "url": "https://storage.wekruit.com/screenshots/app_def456_001.jpg",
      "captured_at": "2026-02-11T10:15:12Z",
      "step": "filling_form"
    },
    {
      "id": "ss_010",
      "type": "pre_submit",
      "url": "https://storage.wekruit.com/screenshots/app_def456_pre.jpg",
      "captured_at": "2026-02-11T10:16:28Z",
      "step": "submitting"
    },
    {
      "id": "ss_011",
      "type": "confirmation",
      "url": "https://storage.wekruit.com/screenshots/app_def456_post.jpg",
      "captured_at": "2026-02-11T10:16:34Z",
      "step": "completed"
    }
  ]
}
```

---

#### `POST /applications/bulk` (v1.1)

Submit multiple job URLs as a batch.

| Field | Value |
|-------|-------|
| Auth Required | Yes (Pro tier+) |
| Rate Limit | 2/minute |

**Request Body:**
```json
{
  "urls": [
    "https://www.linkedin.com/jobs/view/111",
    "https://www.linkedin.com/jobs/view/222",
    "https://boards.greenhouse.io/acme/jobs/333"
  ],
  "resume_id": "res_xyz789",
  "delay_between_minutes": 2
}
```

**Response (201 Created):**
```json
{
  "batch_id": "batch_ghi012",
  "applications": [
    {"id": "app_001", "job_url": "...111", "platform": "linkedin_easy_apply", "status": "queued"},
    {"id": "app_002", "job_url": "...222", "platform": "linkedin_easy_apply", "status": "queued"},
    {"id": "app_003", "job_url": "...333", "platform": "greenhouse", "status": "queued"}
  ],
  "total": 3,
  "estimated_completion_minutes": 10
}
```

**Errors:** `400` invalid URLs, `402` subscription tier insufficient, `413` batch too large (max 25)

---

### 5.6 WebSocket

#### `WS /ws`

Persistent WebSocket connection for real-time updates.

**Connection:** `wss://api.wekruit.com/api/v1/ws?token={jwt_access_token}`

**Authentication:** JWT token passed as query parameter on connection. Connection rejected with `4001` close code if token is invalid/expired.

**Server-to-Client Message Types:**

| Type | Description | When Sent |
|------|-------------|-----------|
| `application_update` | State change or field fill progress | Every state transition and field fill during automation |
| `human_takeover_required` | CAPTCHA or review needed | When automation pauses for human help |
| `application_completed` | Application finished successfully | On successful submission verification |
| `application_error` | Application failed | On unrecoverable error |
| `review_required` | Low-confidence field needs review | When a field's confidence is below threshold |
| `notification` | General notification | Various events |
| `resume_parsed` | Resume parsing completed | After LLM finishes parsing |
| `pong` | Keepalive response | In response to client `ping` |

**Client-to-Server Message Types:**

| Type | Description |
|------|-------------|
| `review_response` | Approve, edit, or skip a field under review |
| `ping` | Keepalive |

---

## 6. Data Model

### 6.1 Entity Relationship Overview

```
Users 1---* Resumes
Users 1---* QABankEntries
Users 1---* Applications
Users 1---* Notifications
Users 1---1 Subscriptions
Applications 1---* ApplicationEvents
Applications 1---* ApplicationFields
Applications *---1 BrowserProfiles
BrowserProfiles 1---1 ProxyBindings
```

### 6.2 Table Definitions

#### `users`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Primary key |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Google account email |
| name | VARCHAR(255) | NOT NULL | Display name from Google profile |
| avatar_url | TEXT | NULLABLE | Google profile picture URL |
| google_id | VARCHAR(255) | UNIQUE, NOT NULL | Google OAuth subject ID |
| phone | VARCHAR(50) | NULLABLE | Phone number |
| location | VARCHAR(255) | NULLABLE | City, State, Country |
| linkedin_url | VARCHAR(500) | NULLABLE | LinkedIn profile URL |
| github_url | VARCHAR(500) | NULLABLE | GitHub profile URL |
| portfolio_url | VARCHAR(500) | NULLABLE | Portfolio/website URL |
| work_history | JSONB | DEFAULT '[]' | Parsed work experience array |
| education | JSONB | DEFAULT '[]' | Parsed education array |
| skills | JSONB | DEFAULT '[]' | Skills array |
| certifications | JSONB | DEFAULT '[]' | Certifications array |
| languages | JSONB | DEFAULT '[]' | Languages array |
| preferences | JSONB | DEFAULT '{}' | Automation and notification preferences |
| subscription_tier | VARCHAR(50) | DEFAULT 'free' | free, starter, pro, enterprise |
| is_active | BOOLEAN | DEFAULT TRUE | Account active flag |
| accepted_disclaimer_version | VARCHAR(20) | NULLABLE | Last accepted legal disclaimer version |
| accepted_disclaimer_at | TIMESTAMPTZ | NULLABLE | When disclaimer was accepted |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Account creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last profile update |

**Indexes:** `idx_users_email` (UNIQUE), `idx_users_google_id` (UNIQUE)

---

#### `resumes`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK -> users(id), NOT NULL | Owning user |
| filename | VARCHAR(255) | NOT NULL | Original filename |
| file_key | VARCHAR(500) | NOT NULL | S3/storage object key |
| file_size_bytes | INTEGER | NOT NULL | File size |
| mime_type | VARCHAR(100) | NOT NULL | PDF or DOCX MIME type |
| is_default | BOOLEAN | DEFAULT FALSE | Default resume for applications |
| status | VARCHAR(50) | DEFAULT 'uploading' | uploading, parsing, parsed, parse_failed |
| parsed_data | JSONB | NULLABLE | Structured parsed resume data |
| parsing_confidence | FLOAT | NULLABLE | Overall parsing confidence 0-1 |
| raw_text | TEXT | NULLABLE | Extracted plain text (for search/embeddings) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |
| parsed_at | TIMESTAMPTZ | NULLABLE | When parsing completed |
| expires_at | TIMESTAMPTZ | NULLABLE | When original file will be auto-deleted |

**Indexes:** `idx_resumes_user_id`, `idx_resumes_user_default` (user_id, is_default)

---

#### `qa_bank_entries`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK -> users(id), NOT NULL | Owning user |
| category | VARCHAR(50) | NOT NULL | work_authorization, experience, compensation, availability, identity, custom |
| question | TEXT | NOT NULL | The screening question |
| answer | TEXT | NOT NULL | The user's answer |
| usage_mode | VARCHAR(20) | DEFAULT 'always_use' | always_use, ask_each_time, decline_to_answer |
| times_used | INTEGER | DEFAULT 0 | Usage counter |
| embedding | VECTOR(1536) | NULLABLE | Question embedding for semantic search (pgvector) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_qa_user_id`, `idx_qa_user_category` (user_id, category), `idx_qa_embedding` (HNSW index on embedding)

---

#### `applications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK -> users(id), NOT NULL | Owning user |
| job_url | TEXT | NOT NULL | The job posting URL |
| platform | VARCHAR(50) | NOT NULL | linkedin_easy_apply, greenhouse, lever, workday |
| status | VARCHAR(50) | NOT NULL, DEFAULT 'queued' | See status enum below |
| batch_id | UUID | NULLABLE | If part of a bulk submission |
| resume_id | UUID | FK -> resumes(id) | Resume used |
| browser_profile_id | UUID | FK -> browser_profiles(id), NULLABLE | Browser profile used |
| job_title | VARCHAR(500) | NULLABLE | Extracted job title |
| company_name | VARCHAR(255) | NULLABLE | Extracted company name |
| job_location | VARCHAR(255) | NULLABLE | Job location |
| match_score | FLOAT | NULLABLE | Resume-job match score 0-100 |
| confidence_avg | FLOAT | NULLABLE | Average confidence across all fields |
| fields_filled | INTEGER | DEFAULT 0 | Number of form fields filled |
| duration_seconds | INTEGER | NULLABLE | Total application duration |
| submission_mode | VARCHAR(50) | DEFAULT 'review_before_submit' | Mode for this application |
| custom_answers | JSONB | DEFAULT '{}' | User-provided overrides |
| error_message | TEXT | NULLABLE | Error description if failed |
| error_type | VARCHAR(100) | NULLABLE | Categorized error type |
| retry_count | INTEGER | DEFAULT 0 | Number of retries attempted |
| hatchet_workflow_id | VARCHAR(255) | NULLABLE | Hatchet workflow run ID |
| screenshots | JSONB | DEFAULT '{}' | URLs to screenshots |
| llm_usage | JSONB | DEFAULT '{}' | Token counts and costs |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| started_at | TIMESTAMPTZ | NULLABLE | When automation began |
| completed_at | TIMESTAMPTZ | NULLABLE | When application finished |

**Status values:** `queued`, `provisioning`, `navigating`, `analyzing`, `filling_form`, `answering_questions`, `need_captcha`, `need_review`, `human_takeover`, `submitting`, `verifying`, `completed`, `failed`, `cancelled`, `timeout`

**Indexes:** `idx_applications_user_status` (user_id, status), `idx_applications_user_created` (user_id, created_at DESC), `idx_applications_status` (status), `idx_applications_job_url` (user_id, job_url), `idx_applications_batch` (batch_id)

---

#### `application_events`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| application_id | UUID | FK -> applications(id) ON DELETE CASCADE, NOT NULL | Parent application |
| event_type | VARCHAR(100) | NOT NULL | state_transition, field_filled, screenshot, error, checkpoint |
| from_status | VARCHAR(50) | NULLABLE | Previous status |
| to_status | VARCHAR(50) | NULLABLE | New status |
| event_data | JSONB | DEFAULT '{}' | Event-specific payload |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_events_application_id` (application_id, created_at)

---

#### `application_fields`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| application_id | UUID | FK -> applications(id) ON DELETE CASCADE, NOT NULL | Parent application |
| field_name | VARCHAR(255) | NOT NULL | Form field label |
| field_type | VARCHAR(50) | NOT NULL | text, select, radio, checkbox, file, textarea |
| value | TEXT | NULLABLE | Value that was filled |
| source | VARCHAR(50) | NOT NULL | resume, qa_bank, llm_generated, user_override |
| confidence | FLOAT | NOT NULL | Confidence score 0-1 |
| qa_bank_entry_id | UUID | FK -> qa_bank_entries(id), NULLABLE | If sourced from Q&A bank |
| user_overridden | BOOLEAN | DEFAULT FALSE | Whether user changed the AI's answer |
| filled_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_fields_application_id` (application_id)

---

#### `browser_profiles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK -> users(id), NOT NULL | Assigned user |
| platform | VARCHAR(50) | NOT NULL | Platform this profile is for |
| adspower_profile_id | VARCHAR(100) | UNIQUE, NOT NULL | AdsPower's internal profile ID |
| proxy_binding_id | UUID | FK -> proxy_bindings(id), NULLABLE | Bound proxy |
| fingerprint_config | JSONB | NOT NULL | Browser fingerprint configuration |
| status | VARCHAR(20) | DEFAULT 'available' | available, in_use, error, retired |
| session_healthy | BOOLEAN | DEFAULT FALSE | Whether platform session cookies are valid |
| total_tasks_completed | INTEGER | DEFAULT 0 | Lifetime usage counter |
| last_used_at | TIMESTAMPTZ | NULLABLE | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_profiles_user_platform` (user_id, platform), `idx_profiles_status` (status)

---

#### `proxy_bindings`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| provider | VARCHAR(50) | DEFAULT 'iproyal' | Proxy provider name |
| proxy_type | VARCHAR(20) | DEFAULT 'socks5' | socks5, http, https |
| hostname | VARCHAR(255) | NOT NULL | Proxy server hostname |
| port | INTEGER | NOT NULL | Proxy server port |
| username | VARCHAR(255) | NULLABLE | Auth username |
| encrypted_password | BYTEA | NULLABLE | AES-256 encrypted password |
| country | VARCHAR(10) | DEFAULT 'US' | Proxy location country code |
| ip_address | INET | NULLABLE | Current resolved IP |
| session_id | VARCHAR(255) | NULLABLE | Sticky session identifier |
| status | VARCHAR(20) | DEFAULT 'active' | active, blocked, expired |
| blocked_until | TIMESTAMPTZ | NULLABLE | If blocked, when it can be retried |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_proxy_status_country` (status, country)

---

#### `notifications`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK -> users(id), NOT NULL | Recipient user |
| type | VARCHAR(50) | NOT NULL | application_completed, application_failed, captcha_needed, review_needed, system |
| title | VARCHAR(255) | NOT NULL | Notification title |
| body | TEXT | NOT NULL | Notification body |
| action_url | VARCHAR(500) | NULLABLE | Deep link URL |
| application_id | UUID | FK -> applications(id), NULLABLE | Related application |
| read | BOOLEAN | DEFAULT FALSE | |
| delivered_channels | JSONB | DEFAULT '[]' | Which channels it was delivered on |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_notifications_user_read` (user_id, read, created_at DESC)

---

#### `subscriptions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Primary key |
| user_id | UUID | FK -> users(id), UNIQUE, NOT NULL | Owning user |
| tier | VARCHAR(50) | NOT NULL | free, starter, pro, enterprise |
| stripe_customer_id | VARCHAR(255) | NULLABLE | Stripe customer ID |
| stripe_subscription_id | VARCHAR(255) | NULLABLE | Stripe subscription ID |
| current_period_start | TIMESTAMPTZ | NULLABLE | Billing period start |
| current_period_end | TIMESTAMPTZ | NULLABLE | Billing period end |
| applications_used_this_period | INTEGER | DEFAULT 0 | Usage counter |
| applications_limit | INTEGER | NOT NULL | Based on tier |
| status | VARCHAR(50) | DEFAULT 'active' | active, past_due, cancelled, trialing |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | |

**Indexes:** `idx_subscriptions_user` (user_id), `idx_subscriptions_stripe` (stripe_subscription_id)

---

## 7. System Architecture Diagram

```
+-------------------------------------------------------------------+
|                        USER LAYER                                  |
|                                                                    |
|  +-------------------+     +-------------------+                   |
|  | React Dashboard   |     | Chrome Extension  |                   |
|  | (Next.js / SPA)   |     | (Content Script + |                   |
|  |                   |     |  Popup)           |                   |
|  | - URL submission  |     | - Job page detect |                   |
|  | - Progress view   |     | - One-click apply |                   |
|  | - noVNC viewer    |     | - Mini dashboard  |                   |
|  | - History/Settings|     |                   |                   |
|  +--------+----------+     +--------+----------+                   |
|           |  WebSocket (wss://)      |  REST (https://)            |
+-----------|--------------------------|-----------+-----------------+
            |                          |           |
+-----------v--------------------------v-----------v-----------------+
|                        API LAYER                                   |
|  +---------------------------------------------------------------+ |
|  |                    FastAPI Server                              | |
|  |  +----------+ +----------+ +----------+ +---------+           | |
|  |  | REST API | | WS Gate- | | OAuth    | | File    |           | |
|  |  | Handlers | | way      | | Handler  | | Upload  |           | |
|  |  +----------+ +----+-----+ +----------+ +---------+           | |
|  |                     | Redis Pub/Sub (status relay)             | |
|  +---------------------------------------------------------------+ |
|           | Hatchet SDK                                            |
+-----------|-----------+--------------------------------------------+
            |           |
+-----------v-----------v--------------------------------------------+
|                   ORCHESTRATION LAYER                               |
|  +----------------------------------------------------------------+ |
|  |          Hatchet Engine (Postgres-backed)                      | |
|  |  +-----------+ +-----------+ +--------+ +------------------+  | |
|  |  | Workflow   | | Rate      | | Web UI | | Durable Events   |  | |
|  |  | Manager   | | Limiter   | |        | | (CAPTCHA pause)  |  | |
|  |  +-----------+ +-----------+ +--------+ +------------------+  | |
|  +----------------------------------------------------------------+ |
|           | Dispatches to workers                                   |
+-----------|---------------------------------------------------------+
            |
+-----------v---------------------------------------------------------+
|                      WORKER LAYER                                    |
|  +------------------+ +------------------+ +---------------------+   |
|  | AdsPower Client  | | Browser-Use CDP  | | LLM Router(LiteLLM)|   |
|  | (profiles+proxy) | | (DOM+form fill)  | | Sonnet/GPT-4.1/nano|   |
|  +------------------+ +------------------+ +---------------------+   |
|  +----------------------------------------------------------------+  |
|  |   noVNC Server (Xvfb + x11vnc + websockify)                   |  |
|  +----------------------------------------------------------------+  |
+----------------------------------------------------------------------+
        |                    |                    |
+-------v------+ +-----------v------+ +-----------v------+
| PostgreSQL   | | External APIs    | | Object Storage   |
| (app+Hatchet)| | Anthropic,OpenAI | | (S3/MinIO)       |
| + pgvector   | | IPRoyal,Stripe   | | Resumes, screens |
+--------------+ | AdsPower,SendGrid| +------------------+
  + Redis        +------------------+
  (optional)
```

### 7.1 Key Architectural Decisions

1. **Hatchet over Celery:** Native durable events for CAPTCHA pause/resume, built-in rate limiting, Postgres-only infrastructure. Migration path to Temporal at scale.

2. **Extension Content Script as Primary Interaction Layer:** Content scripts are invisible to web-side bot detection, the stealthiest approach for LinkedIn and Greenhouse.

3. **3-Layer Interaction Strategy:** DOM selectors (80%) -> Accessibility tree + LLM (15%) -> Vision/screenshot fallback (5%).

4. **Shared PostgreSQL:** App data and Hatchet state share one PostgreSQL instance, simplifying infrastructure.

5. **Model Routing via LiteLLM:** Unified API across providers. Reduces LLM cost from $0.045 to $0.021 per application.

---

## 8. Non-Functional Requirements

### 8.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Application completion time (LinkedIn Easy Apply) | < 3 minutes (p95) | From "Start" to "Completed" |
| Application completion time (Greenhouse/Lever) | < 5 minutes (p95) | |
| API response time (non-automation endpoints) | < 500ms (p95) | |
| API response time (application submission) | < 2s (p95) | Includes validation + queue insertion |
| WebSocket message latency | < 200ms | Worker event to frontend delivery |
| Resume parsing time | < 10 seconds | Upload complete to parsed data |
| noVNC connection establishment | < 3 seconds | Click to interactive session |

### 8.2 Scalability

| Dimension | MVP Target | Scale Target (v2.0) |
|-----------|-----------|---------------------|
| Concurrent active applications | 10 | 100 |
| Total registered users | 1,000 | 50,000 |
| Applications per day (total) | 500 | 10,000 |
| Workers (browser instances) | 5 | 50 |
| WebSocket connections | 200 | 5,000 |

### 8.3 Reliability

| Metric | Target |
|--------|--------|
| API uptime | 99.9% (< 8.7 hours downtime/year) |
| Workflow completion rate | 99.5% (excluding user cancellations) |
| Crash recovery success rate | 95% (resume from checkpoint after crash) |
| Data durability | 99.999% (PostgreSQL with daily backups) |
| Mean time to recovery (MTTR) | < 5 minutes automated, < 30 minutes manual |

### 8.4 Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication | Google OAuth 2.0 + JWT (RS256), no passwords stored |
| Authorization | Row-Level Security (RLS) in PostgreSQL |
| Encryption at rest | AES-256-GCM for all PII, resume files, screenshots, proxy credentials |
| Encryption in transit | TLS 1.3 for all API and WebSocket connections |
| Session security | HTTP-only, Secure, SameSite=Strict cookies |
| Rate limiting | Per-endpoint, per-user, per-IP limits |
| Input validation | Pydantic models; parameterized SQL queries |
| Dependency security | Automated vulnerability scanning (Dependabot / Snyk) |
| Credential handling | LinkedIn cookies in AdsPower only; proxy passwords AES-256 encrypted |
| LLM data safety | API tier with DPA; PII stripped from prompts where possible |
| Audit logging | All state transitions and form fills logged with timestamp and user_id |

### 8.5 Privacy (GDPR Compliance)

| GDPR Right | Implementation |
|------------|----------------|
| Right to access (Art. 15) | Export endpoint returns all user data as JSON |
| Right to rectification (Art. 16) | All profile and Q&A data editable |
| Right to deletion (Art. 17) | Cascade-delete all user data within 72 hours |
| Right to portability (Art. 20) | JSON/CSV export |
| Consent management (Art. 7) | Versioned legal disclaimer with re-consent |
| Data minimization (Art. 5) | Original resume deleted after 90 days; screenshots after 30 days |
| Purpose limitation (Art. 5) | Data used only for job applications; never sold |
| DPIA required (Art. 35) | Completed before launch |

---

## 9. Success Metrics & KPIs

### 9.1 Product Health Metrics (Measured Weekly)

| Metric | Definition | MVP Target | v1.1 Target | v2.0 Target |
|--------|-----------|-----------|-------------|-------------|
| **Application Success Rate** | Applications reaching "Completed" / Total attempts (excluding cancellations) | >= 80% | >= 85% | >= 90% |
| **Average Time Per Application** | Median time from "Start" to "Completed" for LinkedIn Easy Apply | < 3 min | < 2 min | < 1.5 min |
| **Form Fill Accuracy** | Fields filled correctly (verified by user override rate) / Total fields filled | >= 90% | >= 95% | >= 97% |
| **User Intervention Rate** | Applications requiring human intervention (CAPTCHA, review, takeover) / Total applications | < 20% | < 15% | < 10% |
| **CAPTCHA Encounter Rate** | Applications where CAPTCHA appeared / Total applications | < 10% | < 5% | < 3% |
| **CAPTCHA Resolution Rate** | CAPTCHAs solved within timeout / Total CAPTCHAs encountered | >= 70% | >= 80% | >= 85% |
| **Crash Recovery Rate** | Workflows successfully resumed after crash / Total crashes | >= 85% | >= 95% | >= 98% |

### 9.2 Business Metrics (Measured Monthly)

| Metric | Definition | 3-Month Target | 6-Month Target | 12-Month Target |
|--------|-----------|---------------|----------------|-----------------|
| **Registered Users** | Total accounts created | 500 | 2,000 | 10,000 |
| **Daily Active Users (DAU)** | Unique users who submit >= 1 application per day | 50 | 200 | 1,000 |
| **Weekly Active Users (WAU)** | Unique users who submit >= 1 application per week | 150 | 600 | 3,000 |
| **Weekly Retention (Week 1)** | % of new users who return in week 2 | >= 40% | >= 50% | >= 55% |
| **Monthly Retention (Month 1)** | % of new users who return in month 2 | >= 25% | >= 35% | >= 40% |
| **Free-to-Paid Conversion** | % of free users who upgrade to a paid plan | >= 5% | >= 8% | >= 12% |
| **Monthly Recurring Revenue (MRR)** | Total monthly subscription revenue | $2,000 | $15,000 | $75,000 |
| **Net Promoter Score (NPS)** | Quarterly NPS survey | >= 30 | >= 40 | >= 50 |
| **Applications Per User Per Week** | Average across active users | 8 | 12 | 15 |

### 9.3 Operational Metrics (Measured Daily)

| Metric | Definition | Target |
|--------|-----------|--------|
| **API Uptime** | Percentage of time API returns 2xx/3xx | >= 99.9% |
| **P95 API Latency** | 95th percentile response time for non-automation endpoints | < 500ms |
| **Worker Utilization** | % of time workers are actively processing (not idle) | 40-70% |
| **Queue Wait Time** | Time from application queued to worker pickup | < 30 seconds (p95) |
| **LLM Cost Per Application** | Total LLM API spend / Total completed applications | < $0.025 |
| **Total COGS Per Application** | VM + proxy + LLM + storage per application | < $0.07 |
| **Error Rate** | 5xx responses / Total requests | < 0.5% |

### 9.4 Quality Gates (Required for v1.0 Launch)

The following metrics must be met in a 7-day production trial with beta users before general availability:

- [ ] Application success rate >= 80% across 100+ applications
- [ ] No data loss events (0 incidents of lost user data)
- [ ] CAPTCHA detection rate >= 95% (CAPTCHAs detected vs. total CAPTCHAs encountered)
- [ ] Zero security vulnerabilities rated "High" or "Critical" in penetration test
- [ ] Resume parsing accuracy >= 90% (measured by user correction rate < 10%)
- [ ] Average application time < 3 minutes for LinkedIn Easy Apply
- [ ] WebSocket connection reliability >= 99% (messages delivered / messages sent)
- [ ] Legal disclaimer acceptance rate tracked and versioned

---

## 10. Risks & Mitigations

### 10.1 Technical Risks

| # | Risk | Severity | Likelihood | Impact | Mitigation |
|---|------|----------|------------|--------|------------|
| T1 | **LinkedIn bot detection evolves** -- LinkedIn deploys new fingerprinting or behavioral analysis that detects our automation | HIGH | HIGH | Applications fail; user accounts restricted | AdsPower fingerprint management + residential proxies + human-like timing (randomized delays, mouse movements). Extension content scripts are invisible to web-side detection. Patchright for CDP tasks removes `navigator.webdriver` and other markers. Conservative rate limits (20/day). Monitoring: if CAPTCHA rate spikes >5% above baseline, auto-pause all LinkedIn automation and alert ops. |
| T2 | **User account bans on LinkedIn** -- Users get soft or hard restrictions on their LinkedIn accounts | HIGH | MEDIUM | User churn, reputation damage, potential liability claims | Account warm-up guidance during onboarding. Hard-coded rate limits that cannot be overridden (20 apps/day, 5s between actions, 10 actions/minute). Auto-stop on ANY restriction signal (CAPTCHA, checkpoint page, "restricted" text). Legal disclaimer making users explicitly acknowledge risk. No refunds for account restrictions (documented in ToS). |
| T3 | **LLM hallucination in form answers** -- The LLM generates incorrect or inappropriate answers for screening questions | MEDIUM | MEDIUM | Poor application quality, user distrust, potential employer blacklisting | Q&A bank as ground truth (LLM-generated answers only when no Q&A match). Confidence scoring: any LLM-generated answer < 60% confidence triggers user review. "Review before submit" as default mode. Post-application summary showing all AI-generated answers with confidence. User override tracking: if users override > 20% of AI answers, flag for model quality review. |
| T4 | **Platform UI changes break automation** -- LinkedIn, Greenhouse, or other ATS platforms update their UI, breaking our CSS selectors and workflow templates | MEDIUM | HIGH | Application failures spike on affected platform | Hybrid interaction strategy: DOM selectors -> accessibility tree + LLM -> vision fallback. When selectors fail, the system automatically escalates to LLM-based understanding. Stagehand-style caching: LLM analyzes page once, caches selector mappings, self-heals on next failure. Monitoring: per-platform selector failure rate tracked; alert on >10% increase triggers template review. Workflow templates are external YAML configs (not hardcoded), enabling rapid updates without deployment. |
| T5 | **AdsPower service disruption** -- AdsPower API becomes unavailable, or AdsPower changes pricing/terms | MEDIUM | LOW | All automation stops until alternative provisioned | Abstraction layer between our code and AdsPower API (not tightly coupled). Fallback plan: Patchright (patched Playwright) with custom fingerprinting as a 2-week migration path. Monitor AdsPower API latency and error rates. Keep evaluation notes for alternatives (Multilogin, GoLogin). |
| T6 | **CDP detection by LinkedIn** -- Chrome DevTools Protocol connection detected via known CDP markers | MEDIUM | MEDIUM | Browser sessions flagged as automated | Extension content scripts as primary interaction layer (zero CDP detection vectors). When CDP is used, Patchright patches known detection markers. Never inject `__playwright__binding__` or other identifiable globals. Runtime checks for `navigator.webdriver` and other red flags. |
| T7 | **Database performance degradation** -- PostgreSQL under load from application events, Hatchet state, and concurrent queries | LOW | MEDIUM | Increased latency, application queue backup | Connection pooling (PgBouncer). Aggressive indexing on high-query tables. Partition `application_events` by month for large-scale. Archive old applications after 1 year. Read replicas for dashboard queries (v2.0). |

### 10.2 Legal Risks

| # | Risk | Severity | Likelihood | Impact | Mitigation |
|---|------|----------|------------|--------|------------|
| L1 | **LinkedIn sends cease-and-desist** -- LinkedIn legal contacts WeKruit demanding we stop the service | CRITICAL | MEDIUM | Forced to disable LinkedIn automation or face lawsuit | Copilot model (user-initiated, user-reviewed) reduces legal exposure vs. fully autonomous bots. UETA "electronic agent" framework: user authorizes each action on their own account. Van Buren v. United States (2021) established that automating actions within an authorized account does not violate CFAA. Our tool is legally closer to a password manager or screen reader than a scraper. If C&D received: immediately consult outside counsel, consider disabling LinkedIn while maintaining other platforms. Multi-platform roadmap reduces LinkedIn dependency. |
| L2 | **CFAA prosecution** -- Federal charges for unauthorized computer access | CRITICAL | VERY LOW | Criminal liability, company shutdown | Van Buren ruling strongly protects our use case: users are accessing their own authorized accounts. DOJ has stated it will not prosecute mere ToS violations as CFAA violations. We never use fake accounts, never scrape data we are not authorized to see, never bypass technical access controls. Legal disclaimer records user consent for each action. |
| L3 | **GDPR enforcement action** -- EU data protection authority finds violations | HIGH | LOW | Fines up to 4% of global revenue, mandatory changes | DPIA completed before launch. Data minimization enforced (90-day retention for files, 30-day for screenshots). DPA signed with all LLM providers. User data export and deletion endpoints implemented. Consent versioning with re-consent on changes. Regular privacy audits (quarterly). |
| L4 | **User sues for account restriction** -- User's LinkedIn account gets restricted and they blame WeKruit | MEDIUM | MEDIUM | Legal costs, reputation damage | Terms of Service explicitly disclaim liability for platform restrictions. Legal disclaimer requires acknowledgment before first use. Rate limits are conservative by design. Auto-stop on restriction signals. No refund policy for restriction-related complaints (documented). Errors & omissions (E&O) insurance. |
| L5 | **Platform lawsuit (Greenhouse, Lever, Workday)** -- ATS platforms take legal action | MEDIUM | LOW | Forced to disable affected platform | These platforms have less aggressive enforcement history than LinkedIn. Our tool helps their employers receive more applications (aligned interests). Content script approach leaves no server-side footprint on their systems. If sued: disable the specific platform while resolving. |

### 10.3 Business Risks

| # | Risk | Severity | Likelihood | Impact | Mitigation |
|---|------|----------|------------|--------|------------|
| B1 | **LinkedIn access model changes** -- LinkedIn restricts Easy Apply, adds mandatory CAPTCHA, or requires login for job viewing | HIGH | MEDIUM | Core MVP feature compromised | Multi-platform roadmap: Greenhouse and Lever are Phase 1 priorities. Greenhouse/Lever have much lower enforcement and simpler forms. If LinkedIn becomes untenable, pivot messaging to "ATS automation" rather than "LinkedIn automation." |
| B2 | **Competition copies our approach** -- Simplify, LazyApply, or a new entrant builds a similar Copilot model | MEDIUM | HIGH | Market share pressure, pricing pressure | First-mover advantage in the Copilot space. Ecosystem moat: Q&A bank that improves over time, application history analytics, multi-platform coverage. Superior technology: LLM routing, crash recovery, confidence scoring. Community and trust: transparency features (screenshots, audit trail) build switching cost. |
| B3 | **Cost structure does not support pricing** -- COGS per application exceeds what users will pay | MEDIUM | LOW | Negative unit economics | Current COGS estimate: $0.064/application. At Starter ($19/mo, 50 apps): $0.38 revenue/app vs $0.064 COGS = 83% gross margin. Model routing reduces LLM cost over time. Prompt caching further reduces cost. Batch API for non-urgent applications (50% LLM cost reduction). Monitor COGS/application weekly and adjust routing strategy proactively. |
| B4 | **User trust erosion** -- Users have bad experiences (wrong answers submitted, accounts flagged) and churn | HIGH | MEDIUM | Retention drops, negative word-of-mouth | "Review before submit" as default. Confidence scoring and transparency build trust. Q&A bank gives users control over answers. Screenshot proof of every submission. Proactive alerts when things go wrong (instead of silent failures). NPS tracking and rapid response to negative feedback. |

### 10.4 Operational Risks

| # | Risk | Severity | Likelihood | Impact | Mitigation |
|---|------|----------|------------|--------|------------|
| O1 | **LLM provider outage** -- Anthropic or OpenAI API goes down during active applications | MEDIUM | MEDIUM | Active applications fail or stall | Multi-provider fallback chain: Claude -> GPT-4o -> Gemini 2.5 Pro. LiteLLM handles automatic failover. In-flight applications pause and retry with fallback model. Per-provider health monitoring with circuit breaker pattern. |
| O2 | **Worker crash during application** -- Python worker process dies mid-application | MEDIUM | HIGH | Application stuck in incomplete state | Hatchet durable execution resumes from last completed step. CDP session health check on recovery. If browser session lost, restart from scratch with user notification. Orphaned browser cleanup every 5 minutes. |
| O3 | **Proxy provider issues** -- IPRoyal service degradation or IP pool exhaustion | LOW | MEDIUM | Applications fail with connection errors | Backup proxy provider configuration ready (SmartProxy). Per-IP health checks before each application. Automatic rotation on block detection. IP blacklist with 24-hour cooldown. |
| O4 | **Scaling bottleneck** -- Demand exceeds worker capacity during peak hours | MEDIUM | MEDIUM | Long queue wait times, user frustration | Queue depth monitoring with alerting (>50 = warning, >100 = critical). Auto-scaling worker count based on queue depth (v1.1). Priority queuing: paid users get higher priority. Estimated wait time shown in UI when queue is long. |

---

## 11. Open Questions / Decisions Needed

### 11.1 Architecture Decisions

| # | Question | Options | Recommendation | Decision Owner | Deadline |
|---|----------|---------|----------------|----------------|----------|
| A1 | **Should we start with Hatchet or go straight to Temporal?** | (a) Hatchet for MVP, migrate to Temporal at scale; (b) Temporal from day 1 | (a) Hatchet for MVP. Simpler infrastructure (Postgres-only), faster time to first working workflow, built-in rate limiting. Migrate to Temporal only if we hit >500 tasks/sec or need cross-language workflows. | Engineering Lead | Week 1 |
| A2 | **Should the web dashboard be a separate Next.js app or part of the existing extension?** | (a) Standalone Next.js web app at app.wekruit.com; (b) Extension popup + side panel only; (c) Both | (c) Both. Dashboard for onboarding, history, analytics. Extension for one-click submission while browsing. Shared API backend. | Product + Engineering | Week 2 |
| A3 | **How should we handle Q&A semantic matching: embeddings (pgvector) or LLM classification?** | (a) pgvector with OpenAI embeddings for fast similarity search; (b) Send question to LLM with Q&A bank context for classification; (c) Start with (b), add (a) as optimization | (c) Start with LLM classification (simpler, no embedding pipeline needed), add pgvector when Q&A banks grow large (>100 entries). | Engineering | Week 4 |
| A4 | **Should we use Patchright or standard Playwright for CDP connections?** | (a) Standard Playwright via Browser-Use; (b) Patchright (patched Playwright with stealth features); (c) Patchright for LinkedIn, standard for others | (c) Patchright for LinkedIn (where stealth matters most), standard Playwright via Browser-Use for Greenhouse/Lever (where stealth is less critical). | Engineering | Week 3 |
| A5 | **Self-hosted vs. cloud for Hatchet?** | (a) Self-hosted from day 1; (b) Hatchet Cloud free tier for MVP, self-host when scaling | (b) Start with Hatchet Cloud ($5/mo, 2K runs/day). Migrate to self-hosted when usage exceeds free tier or when we need more control. | Engineering + DevOps | Week 1 |

### 11.2 Product Decisions

| # | Question | Options | Recommendation | Decision Owner | Deadline |
|---|----------|---------|----------------|----------------|----------|
| P1 | **Should the default submission mode be "Review before submit" or "Auto-submit"?** | (a) Review before submit (safer, more control); (b) Auto-submit if confidence > 90% (faster) | (a) Review before submit as default for MVP. Trust must be earned. Allow power users to switch to auto-submit in preferences after their 5th successful application. | Product | Week 2 |
| P2 | **Should we show the noVNC remote browser by default during automation, or only on CAPTCHA?** | (a) Always show live browser view; (b) Only show when human intervention needed; (c) Toggle option | (b) Only show on intervention. Always-on streaming consumes bandwidth and may increase anxiety. Live screenshot preview (updated every 5s) provides sufficient visibility. | Product + Design | Week 3 |
| P3 | **Should we support concurrent applications per user in MVP?** | (a) One at a time (MVP); (b) Up to 3 concurrent (MVP); (c) Sequential with queuing | (c) Sequential with queuing. User can submit multiple URLs, they queue and process one at a time. Simplifies worker management and reduces detection risk. Concurrent in v1.1. | Product + Engineering | Week 2 |
| P4 | **What happens when a user submits a URL for an unsupported platform?** | (a) Reject immediately; (b) Accept but attempt generic form-fill; (c) Waitlist with notification when supported | (a) Reject with clear message and list of supported platforms. Attempting generic fill risks poor quality and erodes trust. Add (c) as a P2 feature. | Product | Week 1 |
| P5 | **How should we handle EEO/demographic questions?** | (a) Always decline to answer; (b) Let user set per-question in Q&A bank; (c) Ask each time | (b) Let user set preferences in Q&A bank. Default to "Decline to answer" for all EEO questions. Never store EEO data permanently. Display clear message: "These questions are optional and your answers will not be stored." | Product + Legal | Week 4 |

### 11.3 Business Decisions

| # | Question | Options | Recommendation | Decision Owner | Deadline |
|---|----------|---------|----------------|----------------|----------|
| B1 | **Should we launch with LinkedIn Easy Apply first despite the legal risk, or start with safer platforms (Greenhouse/Lever)?** | (a) LinkedIn first (biggest user demand); (b) Greenhouse/Lever first (lower legal risk); (c) LinkedIn first with aggressive disclaimers | (c) LinkedIn first. It is the highest-demand feature and the primary competitive differentiator. Mitigate with aggressive disclaimers, conservative rate limits, and Copilot model positioning. Monitor legal landscape closely. | CEO + Legal | Week 1 |
| B2 | **What is the minimum beta period before GA launch?** | (a) 2 weeks with 20 beta users; (b) 4 weeks with 50 beta users; (c) 6 weeks with 100 beta users | (b) 4 weeks with 50 beta users. Sufficient to validate quality gates, catch edge cases, and gather NPS data. Beta users get 6 months free on Starter plan. | Product + Engineering | Week 10 |
| B3 | **Should we require a credit card for the free tier?** | (a) No credit card required; (b) Credit card required; (c) No card for free, card required for trial of paid tiers | (a) No credit card for free tier. Minimize friction for initial adoption. Conversion happens after users experience value. | Product + Growth | Week 8 |

### 11.4 Legal Questions Requiring Counsel

| # | Question | Status | Urgency |
|---|----------|--------|---------|
| LQ1 | Should we register as an "electronic agent" under UETA and what does that entail? | Not started | Before launch |
| LQ2 | Do we need specific insurance (E&O, cyber liability) for this product? | Not started | Before launch |
| LQ3 | Should our ToS include a binding arbitration clause to prevent class actions? | Not started | Before launch |
| LQ4 | What specific language should our legal disclaimer use regarding LinkedIn ToS risk? | Draft in LegalDisclaimerModal.tsx | Before launch |
| LQ5 | Do we need a separate privacy policy for the Chrome extension vs. the web app? | Not started | Before launch |

---

## Appendix A: Development Timeline

| Phase | Duration | Deliverables | Dependencies |
|-------|----------|-------------|-------------|
| **Phase 0: Foundation** | Weeks 1-2 | FastAPI server, PostgreSQL schema, Google OAuth, Hatchet setup, AdsPower integration spike | None |
| **Phase 1: Core Automation** | Weeks 3-6 | LinkedIn Easy Apply workflow, Browser-Use + CDP integration, LLM form filling, hybrid interaction engine | Phase 0 |
| **Phase 2: Dashboard** | Weeks 5-8 | React web dashboard, WebSocket integration, progress UI, application history | Phase 0 (parallel with Phase 1) |
| **Phase 3: Human-in-the-Loop** | Weeks 7-9 | CAPTCHA detection, noVNC takeover, timeout policy, "Resume Automation" flow | Phase 1 |
| **Phase 4: Onboarding** | Weeks 8-10 | Resume upload + parsing, Q&A bank, LinkedIn session connection, profile setup | Phase 0 |
| **Phase 5: Polish & QA** | Weeks 10-12 | Error handling, security audit, performance testing, beta testing, documentation | All phases |
| **Launch (Beta)** | Week 12 | Beta with 50 users | Phase 5 |
| **Launch (GA)** | Week 16 | General availability | Beta validation |

---

## Appendix B: Cost Model Summary

### Per-Application COGS

| Component | Cost | Notes |
|-----------|-----:|-------|
| Cloud VM (3 min) | $0.008 | ARM instance, amortized |
| AdsPower license | $0.010 | Amortized across applications |
| Residential proxy | $0.020 | IPRoyal sticky session |
| LLM tokens (routed) | $0.021 | 3 Sonnet + 5 GPT-4.1 mini calls |
| Storage (screenshots + DB) | $0.005 | S3 + PostgreSQL |
| **Total COGS** | **$0.064** | |

### Unit Economics by Tier

| Tier | Price/App | COGS/App | Gross Margin |
|------|----------|---------|-------------|
| Free ($0, 5 apps) | $0.00 | $0.064 | -100% (acquisition cost) |
| Starter ($19/mo, 50 apps) | $0.38 | $0.064 | 83% |
| Pro ($49/mo, 200 apps) | $0.245 | $0.064 | 74% |
| Enterprise ($99/mo, 500 apps) | $0.198 | $0.064 | 68% |

### Cost Optimization Roadmap

| Optimization | Impact | Timeline |
|-------------|--------|----------|
| Model routing (Sonnet + GPT-4.1 mini) | LLM cost: $0.045 -> $0.021 | v1.0 |
| Prompt caching (Anthropic) | LLM cost: $0.021 -> $0.008 | v1.1 |
| Batch API for non-urgent | LLM cost: $0.008 -> $0.005 | v2.0 |
| Worker density optimization | VM cost: $0.008 -> $0.005 | v2.0 |

---

*End of document. This PRD is the single source of truth for the WeKruit AutoApply Copilot engineering effort. All feature changes, scope adjustments, and architectural decisions should be reflected here.*
