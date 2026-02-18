# WeKruit Valet -- Complete UX Design Specification

**Version:** 1.0
**Date:** 2026-02-11
**Author:** Product Design
**Status:** Design Phase

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Information Architecture](#2-information-architecture)
3. [Screen 1: Landing / Marketing Page](#3-screen-1-landing--marketing-page)
4. [Screen 2: Onboarding Flow](#4-screen-2-onboarding-flow)
5. [Screen 3: Dashboard (Main Screen)](#5-screen-3-dashboard-main-screen)
6. [Screen 4: New Application Flow](#6-screen-4-new-application-flow)
7. [Screen 5: Application Progress View](#7-screen-5-application-progress-view)
8. [Screen 6: CAPTCHA / Human Takeover](#8-screen-6-captcha--human-takeover)
9. [Screen 7: Application Complete](#9-screen-7-application-complete)
10. [Screen 8: Settings](#10-screen-8-settings)
11. [Screen 9: Subscription / Pricing](#11-screen-9-subscription--pricing)
12. [Screen 10: Browser Extension UI](#12-screen-10-browser-extension-ui)
13. [Notification System](#13-notification-system)
14. [Empty States](#14-empty-states)
15. [Error States](#15-error-states)
16. [Loading States](#16-loading-states)
17. [Accessibility Specification](#17-accessibility-specification)
18. [Mobile Responsiveness Strategy](#18-mobile-responsiveness-strategy)

---

## 1. Design Principles

### 1.1 Core Philosophy

**Copilot, Not Autopilot.** Every design decision reinforces that the user is in command. The AI fills; the user approves. The system suggests; the user decides. We never take an irreversible action without explicit consent.

**Transparency Over Magic.** Users should never wonder "what did it do?" Every AI decision is visible, every field fill is auditable, every confidence score is shown. Black boxes destroy trust.

**Minimal Friction, Maximum Control.** Onboarding takes under 3 minutes. Starting an application takes one paste and one click. But if the user wants to inspect, override, or pause -- every control is one tap away.

**Progressive Disclosure.** Show the essential information first. Let power users drill down into confidence scores, AI reasoning, and audit trails. Never overwhelm a first-time user.

### 1.2 Visual Language

| Element       | Specification                                 |
| ------------- | --------------------------------------------- |
| Primary color | Deep blue (#1E40AF) -- trust, professionalism |
| Success       | Green (#059669)                               |
| Warning       | Amber (#D97706)                               |
| Error         | Red (#DC2626)                                 |
| Background    | Cool gray (#F8FAFC)                           |
| Cards         | White (#FFFFFF) with subtle shadow            |
| Typography    | Inter (headings), system font stack (body)    |
| Border radius | 8px (cards), 6px (buttons), 4px (inputs)      |
| Spacing scale | 4px base unit (4, 8, 12, 16, 24, 32, 48, 64)  |

### 1.3 Confidence Score Visual Language

Confidence scores appear throughout the product. They use a consistent color system:

| Range     | Color           | Label            | Icon               |
| --------- | --------------- | ---------------- | ------------------ |
| 90-100%   | Green (#059669) | High confidence  | Solid check        |
| 70-89%    | Amber (#D97706) | Review suggested | Warning triangle   |
| Below 70% | Red (#DC2626)   | Needs attention  | Exclamation circle |

---

## 2. Information Architecture

```
WeKruit AutoApply Copilot
|
+-- Landing Page (unauthenticated)
|   +-- Pricing Section
|   +-- Sign Up / Sign In
|
+-- Onboarding (first-time only)
|   +-- Step 1: Gmail OAuth
|   +-- Step 2: Resume Upload
|   +-- Step 3: Resume Review
|   +-- Step 4: Q&A Bank
|   +-- Step 5: LinkedIn Connection (optional)
|
+-- Dashboard (main screen, post-auth)
|   +-- Active Applications (live cards)
|   +-- Application History (table)
|   +-- Stats Bar
|   +-- "+ New Application" (primary CTA)
|
+-- New Application
|   +-- URL Input
|   +-- Job Preview + Match Score
|   +-- Pre-fill Preview
|   +-- Start Application
|
+-- Application Progress (per-application)
|   +-- Live Status Bar
|   +-- Field-by-Field Log
|   +-- Browser Screenshot Preview
|   +-- Pause / Cancel Controls
|
+-- CAPTCHA Takeover (modal overlay)
|   +-- noVNC Viewer
|   +-- Instructions
|   +-- Resume Button
|
+-- Application Complete (per-application)
|   +-- Confirmation Screenshot
|   +-- Summary Card
|   +-- Next Actions
|
+-- Settings
|   +-- Profile & Resume
|   +-- Q&A Bank
|   +-- Notifications
|   +-- Automation Preferences
|   +-- Account & Billing
|   +-- Data & Privacy
|
+-- Browser Extension (v1.1)
    +-- Floating Apply Button
    +-- Mini Queue Popup
```

---

## 3. Screen 1: Landing / Marketing Page

### 3.1 Wireframe

```
+========================================================================+
|  [Logo] WeKruit                          [Pricing]  [Log In]  [Sign Up]|
+========================================================================+
|                                                                        |
|                  Stop applying. Start getting hired.                    |
|                                                                        |
|     AI fills your job applications in the background while you          |
|     focus on what matters. You paste the link. We do the rest.         |
|                                                                        |
|          [Get Started Free]        [See How It Works]                  |
|                                                                        |
|     "Applied to 47 jobs this week while I slept" -- Sarah K.          |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                      How It Works (3 Steps)                            |
|                                                                        |
|  +------------------+  +------------------+  +------------------+      |
|  |   [icon: upload] |  |  [icon: paste]   |  |  [icon: check]   |     |
|  |                  |  |                  |  |                  |      |
|  |  1. Upload your  |  |  2. Paste a job  |  |  3. Review and   |     |
|  |     resume       |  |     link         |  |     approve      |     |
|  |                  |  |                  |  |                  |      |
|  |  We parse your   |  |  Our AI fills    |  |  See every field |     |
|  |  resume and      |  |  the entire      |  |  before it's     |     |
|  |  learn your      |  |  application     |  |  submitted.      |     |
|  |  profile once.   |  |  for you.        |  |  You stay in     |     |
|  |                  |  |                  |  |  control.        |     |
|  +------------------+  +------------------+  +------------------+      |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                     What Makes Us Different                            |
|                                                                        |
|  +------------------------------+  +------------------------------+    |
|  | Copilot, not Autopilot       |  | Full Transparency            |    |
|  | You review every application |  | See exactly what AI decided  |    |
|  | before it goes out. No       |  | for each field, with         |    |
|  | spray-and-pray.              |  | confidence scores.           |    |
|  +------------------------------+  +------------------------------+    |
|  +------------------------------+  +------------------------------+    |
|  | Smart, Not Generic           |  | Your Data, Your Control      |    |
|  | AI writes real answers to    |  | AES-256 encryption. 90-day   |    |
|  | screening questions, not     |  | auto-delete. Export or       |    |
|  | copy-paste templates.        |  | delete anytime.              |    |
|  +------------------------------+  +------------------------------+    |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                        Live Stats (Social Proof)                       |
|                                                                        |
|     12,847 applications      94% success rate     1m 47s average      |
|     submitted this month                          per application     |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                           Pricing                                      |
|                                                                        |
|  [Free]     [Starter $19/mo]   [Pro $49/mo]   [Enterprise $99/mo]     |
|  5/month    50/month           200/month        500+/month            |
|                                                                        |
|  (See full pricing comparison below)                                   |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                  Trusted by job seekers at                             |
|      [Google] [Meta] [Amazon] [Microsoft] [Apple] logos               |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|             Ready to stop filling forms manually?                      |
|                                                                        |
|                    [Get Started Free]                                   |
|                                                                        |
+------------------------------------------------------------------------+
|  Footer: About | Privacy | Terms | Blog | Support | Status            |
|  (c) 2026 WeKruit. All rights reserved.                               |
+========================================================================+
```

### 3.2 Key UI Elements and States

| Element                | Default State                         | Hover State                     | Click Action                          |
| ---------------------- | ------------------------------------- | ------------------------------- | ------------------------------------- |
| "Get Started Free" CTA | Blue (#1E40AF), white text, large     | Darker blue, slight lift shadow | Navigate to sign-up (Gmail OAuth)     |
| "See How It Works"     | Ghost button (outlined)               | Fill with light blue            | Smooth scroll to How It Works section |
| "Log In"               | Text link, nav bar                    | Underline                       | Navigate to sign-in                   |
| Live stats             | Animated count-up on scroll into view | --                              | --                                    |
| Pricing cards          | Flat, equal height                    | Slight lift                     | Navigate to full pricing page         |
| Social proof logos     | Grayscale                             | Full color on hover             | --                                    |

### 3.3 User Actions and System Responses

| User Action               | System Response                                                             |
| ------------------------- | --------------------------------------------------------------------------- |
| Clicks "Get Started Free" | Redirect to Google OAuth consent screen                                     |
| Clicks "Log In"           | Show sign-in modal (Gmail OAuth)                                            |
| Scrolls to pricing        | Pricing cards animate in                                                    |
| Clicks pricing tier       | Scroll to detailed comparison or redirect to sign-up with plan pre-selected |

### 3.4 Edge Cases

- **Returning user clicks "Get Started"**: Detect existing auth token, skip to dashboard.
- **Mobile visitor**: Stack the 3-step cards vertically. CTA buttons become full-width.
- **Slow connection**: Show skeleton for stats section. CTA buttons render first (above the fold).
- **Ad blocker**: Ensure no analytics scripts block rendering. Use first-party tracking only.

### 3.5 Mobile Responsiveness

- Hamburger menu for nav at < 768px.
- 3-step section stacks vertically.
- Pricing cards stack vertically with horizontal swipe option.
- CTA buttons are full-width on mobile.
- Font sizes reduce by 1 step (h1: 36px to 28px, body: 16px to 14px).

---

## 4. Screen 2: Onboarding Flow

### 4.1 Overview

Target: Under 3 minutes from sign-up to dashboard. 5 steps, but Step 5 (LinkedIn) is optional and skippable.

Progress indicator at the top of every step:

```
Step 1      Step 2       Step 3       Step 4       Step 5
  [*]--------[o]----------[o]----------[o]----------[o]
 Sign Up    Resume     Review Data    Q&A Bank    LinkedIn
```

### 4.2 Step 1: Gmail OAuth Sign-Up

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]--------[o]----------[o]----------[o]----------[o]                |
|  Sign Up    Resume     Review       Q&A Bank    LinkedIn              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                    Welcome to WeKruit                                   |
|                                                                        |
|           Sign up with Google to get started.                          |
|           We only need your email to create                            |
|           your account. Nothing else.                                  |
|                                                                        |
|         +--------------------------------------------+                 |
|         |  [G logo]  Continue with Google             |                |
|         +--------------------------------------------+                 |
|                                                                        |
|           By signing up, you agree to our                              |
|           Terms of Service and Privacy Policy.                         |
|                                                                        |
|           Already have an account? Log in                              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|     [lock icon] Your data is encrypted with AES-256.                  |
|     We never sell your information.                                    |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- Single CTA: "Continue with Google" (branded Google OAuth button).
- No email/password form. Gmail only for MVP.
- Trust signals below the fold: encryption mention, privacy link.

**User Actions:**
| Action | Response |
|--------|----------|
| Click "Continue with Google" | Opens Google OAuth consent screen in popup |
| Completes Google OAuth | Auto-advance to Step 2 |
| Cancels Google OAuth | Returns to this screen with message: "Sign-up cancelled. Try again when ready." |
| Clicks "Log in" | Switch to login flow (same OAuth, just checks for existing account) |

**Edge Cases:**

- Google OAuth fails (network error): Show inline error "Could not connect to Google. Check your internet connection and try again." with retry button.
- User already has account: Detect on OAuth callback, skip onboarding, go to dashboard.
- Third-party cookies blocked: Show message explaining how to allow cookies for Google sign-in.

### 4.3 Step 2: Resume Upload

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]--------[*]----------[o]----------[o]----------[o]                |
|  Sign Up    Resume     Review       Q&A Bank    LinkedIn              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|                   Upload Your Resume                                   |
|                                                                        |
|   +------------------------------------------------------+            |
|   |                                                      |            |
|   |              [cloud upload icon]                     |            |
|   |                                                      |            |
|   |         Drag and drop your resume here               |            |
|   |         or click to browse                           |            |
|   |                                                      |            |
|   |         PDF or DOCX, max 5MB                         |            |
|   +------------------------------------------------------+            |
|                                                                        |
|   Don't have your resume handy?                                        |
|   [Skip for now -- you can add it later]                              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|   Why we need this:                                                    |
|   Your resume is the source of truth for filling                      |
|   applications. We extract your info once so you                      |
|   never have to type it again.                                        |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- Drag-and-drop zone with visual feedback (border changes to blue dashed on drag over).
- File type indicator: PDF or DOCX only.
- "Skip for now" link (not a button -- de-emphasized but available).
- Explanation of why the resume is needed (builds trust).

**States of the Upload Zone:**

| State                      | Visual                                                              |
| -------------------------- | ------------------------------------------------------------------- |
| Default                    | Gray dashed border, cloud icon, "Drag and drop" text                |
| Drag over                  | Blue dashed border, zone slightly enlarges, "Drop to upload" text   |
| File selected (pre-upload) | File name shown with icon, "Uploading..." with progress bar         |
| Uploading                  | Progress bar (0-100%), file name, "Parsing your resume..."          |
| Upload complete            | Green check, file name, "Resume uploaded. Parsing..."               |
| Parse in progress          | Spinner with "AI is reading your resume..." (typically 3-5 seconds) |
| Parse complete             | Auto-advance to Step 3                                              |
| Error                      | Red border, error message, "Try again" button                       |

**User Actions:**
| Action | Response |
|--------|----------|
| Drops PDF/DOCX | Upload begins, progress bar shows |
| Clicks browse | Native file picker opens (filtered to .pdf, .docx) |
| Drops wrong file type | Error: "Please upload a PDF or DOCX file." Zone stays active. |
| Drops file > 5MB | Error: "File is too large. Maximum size is 5MB." |
| Clicks "Skip for now" | Advance to Step 4 (skip Step 3 -- no data to review). Dashboard shows reminder later. |
| Upload fails (network) | Error: "Upload failed. Check your connection and try again." Retry button. |

**Edge Cases:**

- Corrupt PDF: "We could not read this file. Try saving it as a new PDF and uploading again."
- Scanned image PDF (no extractable text): "This appears to be a scanned document. For best results, upload a text-based PDF. We will try our best, but some fields may need manual correction."
- Very long resume (10+ pages): Accept it, but only parse first 5 pages with note: "We parsed the first 5 pages. You can add additional details manually."
- Password-protected PDF: "This PDF is password-protected. Please remove the password and try again."

### 4.4 Step 3: Review Extracted Data

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]--------[*]----------[*]----------[o]----------[o]                |
|  Sign Up    Resume     Review       Q&A Bank    LinkedIn              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|          Review Your Information                                       |
|          We extracted this from your resume.                           |
|          Please correct anything that looks wrong.                     |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  PERSONAL INFORMATION                              [Edit All]    | |
|  |                                                                  | |
|  |  First Name        [Adam              ]                          | |
|  |  Last Name         [Smith             ]                          | |
|  |  Email             [adam@gmail.com     ]  [from Google account]  | |
|  |  Phone             [+1 555-123-4567   ]                          | |
|  |  Location          [San Francisco, CA ]                          | |
|  |  LinkedIn URL      [                  ]  (optional)              | |
|  |  GitHub URL        [                  ]  (optional)              | |
|  |  Portfolio URL     [                  ]  (optional)              | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  WORK EXPERIENCE                                   [Edit All]    | |
|  |                                                                  | |
|  |  [v] Senior Software Engineer                                    | |
|  |      Acme Corp | Jan 2022 - Present                             | |
|  |      San Francisco, CA                                           | |
|  |      > Led a team of 5 engineers building...                     | |
|  |                                                    [Edit] [x]    | |
|  |                                                                  | |
|  |  [v] Software Engineer                                           | |
|  |      StartupXYZ | Mar 2019 - Dec 2021                           | |
|  |      New York, NY                                                | |
|  |      > Built full-stack features for...                          | |
|  |                                                    [Edit] [x]    | |
|  |                                                                  | |
|  |  [+ Add Work Experience]                                         | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  EDUCATION                                         [Edit All]    | |
|  |                                                                  | |
|  |  [v] B.S. Computer Science                                      | |
|  |      MIT | 2015 - 2019 | GPA: 3.8                               | |
|  |                                                    [Edit] [x]    | |
|  |                                                                  | |
|  |  [+ Add Education]                                               | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  SKILLS                                            [Edit All]    | |
|  |                                                                  | |
|  |  [Python] [TypeScript] [React] [AWS] [PostgreSQL]               | |
|  |  [Docker] [Kubernetes] [GraphQL] [+ Add Skill]                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  ADDITIONAL INFO                                   [Edit All]    | |
|  |                                                                  | |
|  |  Work Authorization    [Authorized to work in US   ] [dropdown] | |
|  |  Visa Sponsorship      [Do not require sponsorship ] [dropdown] | |
|  |  Willing to Relocate   [Yes, within US             ] [dropdown] | |
|  |  Salary Expectation    [$120,000 - $160,000        ]            | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|                   [Back]                [Looks Good, Continue]         |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- All fields are pre-filled from resume parsing. Editable inline.
- Each section has "Edit All" to expand into full edit mode.
- Work experience and education entries are collapsible (chevron toggle).
- Skills are displayed as tags with "x" to remove and "+ Add" to add.
- "Additional Info" section contains fields not typically on a resume but frequently asked on applications (work auth, salary, relocation). These may be blank and need user input.
- Green check icon next to fields that were confidently extracted. Amber warning next to low-confidence or missing fields.

**AI Confidence Indicators Per Field:**

- Fields extracted with high confidence (>90%): no indicator (clean look).
- Fields with medium confidence (70-89%): small amber dot next to field, tooltip: "AI was less certain about this field. Please verify."
- Fields not found / low confidence (<70%): field highlighted with amber background, label: "We could not find this in your resume. Please fill in."

**User Actions:**
| Action | Response |
|--------|----------|
| Edits a field | Field updates instantly. Marked as "user-verified" (higher trust in future fills). |
| Clicks "Edit" on experience entry | Entry expands into editable form (title, company, dates, location, description). |
| Clicks "x" on experience entry | Confirm dialog: "Remove this entry? This can be re-added later." |
| Clicks "+ Add Work Experience" | Blank entry form appears at top of section. |
| Removes a skill tag | Tag removed. Can be re-added. |
| Clicks "+ Add Skill" | Inline text input with autocomplete suggestions. |
| Changes dropdown (work auth, etc.) | Value saved instantly. |
| Clicks "Looks Good, Continue" | Save all data, advance to Step 4. |
| Clicks "Back" | Return to Step 2 (resume upload). Data is preserved. |

**Edge Cases:**

- Resume parsing extracts garbage (bad PDF): Show mostly-empty form with message "We had trouble reading your resume. Please fill in the fields below manually, or try uploading a different file."
- Multiple email addresses found: Pre-fill with Google account email. Show note: "We found other emails in your resume: work@company.com. You can change this if needed."
- Dates are ambiguous (e.g., "2019-2021" without months): Pre-fill with Jan for start, Dec for end. Show amber indicator.
- No phone number found: Leave blank with amber highlight. Note: "Most applications require a phone number."

### 4.5 Step 4: Q&A Bank

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]--------[*]----------[*]----------[*]----------[o]                |
|  Sign Up    Resume     Review       Q&A Bank    LinkedIn              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|          Pre-Answer Common Questions                                   |
|          These questions appear on most applications.                  |
|          Answer them once -- we'll use your answers                    |
|          every time.                                                   |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  WORK AUTHORIZATION & ELIGIBILITY                                | |
|  |                                                                  | |
|  |  Are you legally authorized to work in the US?                   | |
|  |  [Yes / No / Prefer not to answer]              [Always use v]   | |
|  |                                                                  | |
|  |  Will you now or in the future require visa                      | |
|  |  sponsorship for employment?                                     | |
|  |  [Yes / No / Prefer not to answer]              [Always use v]   | |
|  |                                                                  | |
|  |  Are you at least 18 years of age?                               | |
|  |  [Yes / No]                                     [Always use v]   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  EXPERIENCE & QUALIFICATIONS                                     | |
|  |                                                                  | |
|  |  How many years of relevant work experience                      | |
|  |  do you have?                                                    | |
|  |  [0-1 / 1-3 / 3-5 / 5-7 / 7-10 / 10+]         [Always use v]   | |
|  |                                                                  | |
|  |  What is your highest level of education?                        | |
|  |  [HS / Associate / Bachelor / Master / PhD]     [Always use v]   | |
|  |                                                                  | |
|  |  Are you willing to undergo a background check?                  | |
|  |  [Yes / No]                                     [Always use v]   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  LOGISTICS                                                       | |
|  |                                                                  | |
|  |  Are you willing to relocate?                                    | |
|  |  [Yes / No / Yes, within my country]            [Always use v]   | |
|  |                                                                  | |
|  |  What is your preferred work arrangement?                        | |
|  |  [Remote / Hybrid / On-site / No preference]    [Always use v]   | |
|  |                                                                  | |
|  |  When can you start?                                             | |
|  |  [Immediately / 2 weeks / 1 month / 2+ months]  [Always use v]   | |
|  |                                                                  | |
|  |  What is your expected salary range?                             | |
|  |  [$_______ - $_______] per [year/hour]          [Ask each time v]| |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  EQUAL OPPORTUNITY (Optional -- these are never required)        | |
|  |                                                                  | |
|  |  [i] These questions are voluntary. We default to                | |
|  |  "Prefer not to answer" for all EEO questions.                   | |
|  |  You can override this per question.                             | |
|  |                                                                  | |
|  |  Gender           [Prefer not to answer v]      [Always use v]   | |
|  |  Race/Ethnicity   [Prefer not to answer v]      [Always use v]   | |
|  |  Veteran Status   [Prefer not to answer v]      [Always use v]   | |
|  |  Disability       [Prefer not to answer v]      [Always use v]   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  CUSTOM QUESTIONS                                                | |
|  |                                                                  | |
|  |  [+ Add a custom question and answer]                            | |
|  |                                                                  | |
|  |  Tip: If you get asked the same question often,                  | |
|  |  add it here so we can answer it automatically                   | |
|  |  next time.                                                      | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|                   [Back]              [Continue]                       |
|                                                                        |
|          [Skip for now -- AI will ask you during applications]        |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- Questions grouped by category for scannability.
- Each question has two controls: the answer (dropdown/text) and the usage mode ("Always use" / "Ask each time").
- "Always use" means the AI will auto-fill with this answer every time. "Ask each time" means the system will pause and ask the user during each application.
- EEO section defaults to "Prefer not to answer" with clear explanation (aligns with legal safety research recommending declining EEO questions to avoid liability).
- Custom questions section allows power users to pre-program answers to niche questions.

**"Always Use" vs. "Ask Each Time" Dropdown:**

- "Always use" (default for most): AI fills automatically with this answer.
- "Ask each time": AI pauses application and presents this question to the user in the review step.
- "Let AI decide": AI uses resume context and job posting to generate an answer. User sees it in the review step before submission.

**User Actions:**
| Action | Response |
|--------|----------|
| Selects answer from dropdown | Answer saved immediately (auto-save). |
| Types salary range | Input validated (numbers only, min < max). |
| Changes usage mode | Mode saved. Tooltip explains what the mode does. |
| Clicks "+ Add custom question" | Inline form: question text input + answer text area + usage mode dropdown. |
| Clicks "Continue" | Save all answers, advance to Step 5. |
| Clicks "Skip" | Advance to Step 5. AI will use resume data and ask during applications. Dashboard reminder shown later. |

**Edge Cases:**

- User leaves all questions blank and clicks "Continue": Allow it. Show message: "No worries! Our AI will use your resume to answer questions and ask you when it is unsure."
- User enters contradictory answers (e.g., "Not authorized to work" but "Does not require sponsorship"): Show inline warning: "These answers may conflict. Please double-check."
- Custom question duplicate: If user adds a question similar to a pre-defined one, show note: "This looks similar to an existing question. Consider using that one instead."

### 4.6 Step 5: LinkedIn Connection (Optional)

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]--------[*]----------[*]----------[*]----------[*]                |
|  Sign Up    Resume     Review       Q&A Bank    LinkedIn              |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|          Connect Your LinkedIn (Optional)                              |
|                                                                        |
|          To apply to LinkedIn Easy Apply jobs, we need                 |
|          access to your LinkedIn session. Choose one:                  |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  OPTION A: Log in via Secure Browser (Recommended)               | |
|  |                                                                  | |
|  |  We'll open a secure browser window where you                    | |
|  |  log into LinkedIn once. Your session stays active               | |
|  |  for future applications.                                        | |
|  |                                                                  | |
|  |  [Open Secure Browser Login]                                     | |
|  |                                                                  | |
|  |  [lock icon] Your password is never stored.                      | |
|  |  We only keep the session cookie, encrypted.                     | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  OPTION B: Paste Session Cookie (Advanced)                       | |
|  |                                                                  | |
|  |  If you prefer, paste your LinkedIn li_at cookie.                | |
|  |  [How to find your cookie >]                                     | |
|  |                                                                  | |
|  |  li_at cookie:  [_________________________]                      | |
|  |                                                                  | |
|  |  [Save Cookie]                                                   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  [!] Important Legal Notice                                      | |
|  |                                                                  | |
|  |  LinkedIn's Terms of Service prohibit automated access.          | |
|  |  By connecting your account, you acknowledge:                    | |
|  |                                                                  | |
|  |  - You are using this tool on your own account                   | |
|  |  - You accept the risk of account restrictions                   | |
|  |  - WeKruit is not liable for any account actions                 | |
|  |  - We enforce strict rate limits to minimize risk                | |
|  |                                                                  | |
|  |  [checkbox] I understand and accept these terms.                 | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|             [Skip -- I'll connect later]    [Done, Go to Dashboard]   |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- Two connection options: secure browser (recommended, lower friction) or manual cookie paste (advanced).
- Legal disclaimer with explicit checkbox consent (required before connection works). Aligns with the legal architecture research: versioned consent, risk acknowledgment.
- "Skip" option is prominent -- this step is genuinely optional. Users can apply to non-LinkedIn jobs without it.

**User Actions:**
| Action | Response |
|--------|----------|
| Clicks "Open Secure Browser Login" | Opens AdsPower browser session in new window. User sees LinkedIn login page. |
| Logs into LinkedIn in secure browser | System captures session cookie. Browser window closes. Success message shown. |
| Pastes li_at cookie | System validates cookie format (starts with "AQ", length check). |
| Clicks "Save Cookie" | System tests cookie by fetching LinkedIn profile. Shows success or error. |
| Checks legal checkbox | Enables connection buttons. Consent logged with timestamp and version. |
| Clicks "Skip" | Advance to dashboard. Reminder banner on dashboard. |
| Clicks "Done" | Navigate to dashboard. |

**Edge Cases:**

- Cookie is expired: "This cookie appears to be expired. Please log in again or paste a fresh cookie."
- Cookie is invalid format: "This does not look like a valid LinkedIn cookie. It should start with 'AQ' and be about 300-500 characters."
- LinkedIn session test fails (account restricted): "We could not verify your LinkedIn session. Your account may have restrictions. Please check LinkedIn directly."
- User has 2FA on LinkedIn: Secure browser login handles this naturally (user completes 2FA in the browser window).
- Consent checkbox not checked: Connection buttons are disabled. Tooltip: "Please read and accept the terms above to continue."

### 4.7 Onboarding Complete Transition

After Step 5 (or skipping it), user sees a brief celebration screen (1.5 seconds auto-dismiss):

```
+========================================================================+
|                                                                        |
|                      [checkmark animation]                             |
|                                                                        |
|                   You're all set!                                      |
|                                                                        |
|           Paste a job URL to submit your first                         |
|           application in under 2 minutes.                              |
|                                                                        |
|                  [Go to Dashboard]                                     |
|                                                                        |
+========================================================================+
```

---

## 5. Screen 3: Dashboard (Main Screen)

### 5.1 Wireframe

```
+========================================================================+
| [Logo] WeKruit          [Search...]         [Bell icon (3)] [Avatar v] |
+========================================================================+
|                                                                        |
|  +----+  Dashboard                                                     |
|  |    |  Applications                           [+ New Application]    |
|  | D  |  Settings                                                      |
|  | a  |                                                                |
|  | s  | +--------------------------------------------------------------+
|  | h  | |  STATS BAR                                                   |
|  | b  | |                                                              |
|  | o  | |  Total Applied    Success Rate    Avg Time    This Week     |
|  | a  | |     127              91%           1m 42s        23          |
|  | r  | |                                                              |
|  | d  | +--------------------------------------------------------------+
|  |    |                                                                |
|  | N  | +--------------------------------------------------------------+
|  | a  | |  ACTIVE APPLICATIONS (3)                      [View All]     |
|  | v  | |                                                              |
|  |    | |  +---------------------+  +---------------------+           |
|  | B  | |  | Senior SWE          |  | Product Manager     |           |
|  | a  | |  | Stripe              |  | Notion              |           |
|  | r  | |  |                     |  |                     |           |
|  |    | |  | [=====>    ] 65%    |  | [========> ] 82%    |           |
|  |    | |  | Filling fields...   |  | Reviewing...        |           |
|  |    | |  |                     |  |                     |           |
|  |    | |  | [View] [Pause]      |  | [Review Now]        |           |
|  |    | |  +---------------------+  +---------------------+           |
|  |    | |                                                              |
|  |    | |  +---------------------+                                    |
|  |    | |  | Data Analyst        |                                    |
|  |    | |  | Airbnb              |                                    |
|  |    | |  |                     |                                    |
|  |    | |  | [=>        ] 12%    |                                    |
|  |    | |  | Queued (2nd in line) |                                    |
|  |    | |  |                     |                                    |
|  |    | |  | [View] [Cancel]     |                                    |
|  |    | |  +---------------------+                                    |
|  |    | +--------------------------------------------------------------+
|  |    |                                                                |
|  |    | +--------------------------------------------------------------+
|  |    | |  RECENT APPLICATIONS                          [View All]    |
|  |    | |                                                              |
|  |    | |  Status    Role              Company     Date      Time     |
|  |    | |  -------   ----              -------     ----      ----     |
|  |    | |  [green]   Frontend Eng      Google      Today     1:34     |
|  |    | |  [green]   Full Stack Dev    Meta        Today     2:01     |
|  |    | |  [red]     Backend Eng       Apple       Yest.     Failed   |
|  |    | |  [green]   SRE               Netflix     Yest.     1:22     |
|  |    | |  [amber]   ML Engineer       OpenAI      2d ago    Review   |
|  |    | |                                                              |
|  |    | |  [Load More]                                                 |
|  |    | +--------------------------------------------------------------+
|  +----+                                                                |
+========================================================================+
```

### 5.2 Key UI Elements

**Stats Bar:**

- 4 metric cards in a horizontal row.
- "Total Applied" -- lifetime count.
- "Success Rate" -- percentage of submitted / attempted. Color-coded (green > 85%, amber 70-85%, red < 70%).
- "Avg Time" -- average time per application.
- "This Week" -- applications submitted in current week, with up/down arrow vs. last week.

**Active Applications Cards:**

- Each card shows: Job title, company name, progress bar (with percentage), current status text, and action buttons.
- Cards are ordered by recency (most recently started first).
- Progress bar colors: blue (in progress), green (almost done/reviewing), amber (paused/needs attention), red (failed).

**Status Text on Active Cards:**

| State        | Display Text                    | Card Accent |
| ------------ | ------------------------------- | ----------- |
| QUEUED       | "Queued (Nth in line)"          | Gray        |
| INITIALIZING | "Starting browser..."           | Blue        |
| NAVIGATING   | "Opening job page..."           | Blue        |
| ANALYZING    | "Analyzing application form..." | Blue        |
| FILLING      | "Filling fields... (N of M)"    | Blue        |
| REVIEWING    | "Ready for your review"         | Amber pulse |
| CAPTCHA      | "Needs your help (CAPTCHA)"     | Red pulse   |
| SUBMITTING   | "Submitting application..."     | Green       |

**Recent Applications Table:**

- Columns: Status (icon), Role, Company, Date, Time (duration or status).
- Status icons: green circle (success), red circle (failed), amber circle (needs review), gray circle (cancelled).
- Clickable rows -- navigate to Application Complete or Application Progress view.
- Filter bar above table (not shown in wireframe): All, Submitted, Failed, Needs Review, Cancelled.
- Sort by: Date (default), Company, Status.

**"+ New Application" Button:**

- Fixed position: always visible in the top-right area of the main content.
- Large, primary blue, high contrast.
- On mobile: floating action button (FAB) in bottom-right corner.

### 5.3 User Actions

| Action                                | Response                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Clicks "+ New Application"            | Opens New Application flow (Section 6)                                                           |
| Clicks "View" on active card          | Navigates to Application Progress View (Section 7)                                               |
| Clicks "Pause" on active card         | Confirmation: "Pause this application? You can resume later." Pauses the automation.             |
| Clicks "Cancel" on active card        | Confirmation: "Cancel this application? This cannot be undone." Cancels and removes from active. |
| Clicks "Review Now" on reviewing card | Opens Application Progress View at the review step (Section 7)                                   |
| Clicks a row in Recent Applications   | Navigates to Application Complete view (Section 9) or Progress view if still active              |
| Clicks notification bell              | Opens notification dropdown (see Section 13)                                                     |
| Clicks avatar                         | Dropdown: Profile, Settings, Billing, Help, Log Out                                              |
| Clicks "View All" on active section   | Expands to full-page view of all active applications                                             |
| Clicks "View All" on recent section   | Expands to full-page application history with filters and search                                 |

### 5.4 Edge Cases

- **No active applications**: Active section collapses. Show empty state (Section 14).
- **10+ active applications**: Show first 6 as cards with horizontal scroll. "View All (N)" link.
- **Application needs attention while user is on dashboard**: Card pulses with amber/red. Notification sound (if enabled). Banner at top: "An application needs your attention."
- **WebSocket disconnects**: Show subtle banner: "Connection lost. Reconnecting..." Auto-reconnect with exponential backoff. Card data may be stale -- show last-updated timestamp.
- **Session expires**: Redirect to login. Preserve URL so user returns to dashboard after re-auth.

### 5.5 Mobile Responsiveness

- Side nav collapses into hamburger menu.
- Stats bar: 2x2 grid instead of 4-across.
- Active application cards: single column, full width.
- Recent applications table: horizontal scroll, or switch to card layout on < 640px.
- "+ New Application": FAB in bottom-right corner.

---

## 6. Screen 4: New Application Flow

### 6.1 Wireframe -- Step 1: URL Input

```
+========================================================================+
|  [<- Dashboard]                              [+ New Application]       |
+------------------------------------------------------------------------+
|                                                                        |
|                    New Application                                     |
|                                                                        |
|  Paste a job URL and we'll handle the rest.                           |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  [paste icon]  https://www.linkedin.com/jobs/view/12345...       | |
|  +------------------------------------------------------------------+ |
|  |  [Detect Platform]                                                | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  Or drag a file with multiple URLs (.csv, .txt)         [v1.1 badge] |
|                                                                        |
|  Supported platforms:                                                  |
|  [LinkedIn icon] LinkedIn Easy Apply                                  |
|  [GH icon] Greenhouse          (coming soon)                         |
|  [Lever icon] Lever            (coming soon)                         |
|  [WD icon] Workday             (coming soon)                         |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- Large, focused URL input field (auto-focus on page load).
- "Detect Platform" button activates on paste (or auto-detects after a brief delay).
- Supported platforms shown below with visual indicators of availability.
- Bulk upload hint (disabled for MVP, shown as "coming soon" / v1.1).

**Auto-Detection Logic:**
After user pastes URL, system immediately:

1. Validates URL format.
2. Matches against known platform URL patterns.
3. Shows platform badge next to input ("LinkedIn Easy Apply detected").
4. Auto-advances to job preview (Step 2) after 1 second.

**Input States:**

| State             | Visual                                                                       |
| ----------------- | ---------------------------------------------------------------------------- |
| Empty             | Placeholder: "Paste a job URL (e.g., linkedin.com/jobs/view/...)"            |
| URL pasted        | URL shown, spinner appears, "Detecting platform..."                          |
| Platform detected | Green badge: "LinkedIn Easy Apply" or platform name. Auto-advance.           |
| Unknown platform  | Amber badge: "Platform not yet supported. We'll try our best."               |
| Invalid URL       | Red text: "This does not look like a valid URL. Please check and try again." |
| Duplicate         | Amber text: "You already applied to this job on [date]. Apply again?"        |

### 6.2 Wireframe -- Step 2: Job Preview

```
+========================================================================+
|  [<- Back]                                                             |
+------------------------------------------------------------------------+
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  [LinkedIn logo]  LinkedIn Easy Apply                             | |
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |  Senior Software Engineer                                        | |
|  |  Stripe | San Francisco, CA (Hybrid)                             | |
|  |  Posted 3 days ago | 142 applicants                              | |
|  |                                                                  | |
|  |  Match Score: [============>   ] 87%                             | |
|  |                                                                  | |
|  |  +---------------------------+  +---------------------------+    | |
|  |  | Skills Match       92%   |  | Experience Match    85%   |    | |
|  |  | Location Match    100%   |  | Education Match     78%   |    | |
|  |  +---------------------------+  +---------------------------+    | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  PRE-FILL PREVIEW                                                | |
|  |  These values will be used to fill your application:             | |
|  |                                                                  | |
|  |  Field                Value                    Confidence        | |
|  |  -----                -----                    ----------        | |
|  |  First Name           Adam                     [green] 99%      | |
|  |  Last Name            Smith                    [green] 99%      | |
|  |  Email                adam@gmail.com           [green] 99%      | |
|  |  Phone                +1 555-123-4567          [green] 95%      | |
|  |  Resume               resume_v3.pdf            [green] 99%      | |
|  |  Work Authorization   Yes                      [green] 99%      | |
|  |  Years of Experience  5-7 years                [amber] 82%      | |
|  |  Salary Expectation   (will ask during app)    [gray]  --       | |
|  |                                                                  | |
|  |  [Edit pre-fill values]                                          | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  SETTINGS FOR THIS APPLICATION                                   | |
|  |                                                                  | |
|  |  [x] Pause for review before submitting                          | |
|  |  [ ] Auto-submit if all fields are high confidence               | |
|  |  [x] Take screenshot of completed form                          | |
|  |  Resume to use: [resume_v3.pdf v]                                | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|         [Cancel]                          [Start Application]          |
|                                                                        |
+========================================================================+
```

**Key Elements:**

- **Job Preview Card**: Title, company, location, posting age, applicant count (if available from scraping).
- **Match Score**: Overall match percentage based on resume vs. job requirements. Broken into 4 sub-scores.
- **Pre-Fill Preview Table**: Every field we expect to fill, the value we will use, and the confidence score. This is the core transparency feature.
- **Per-Application Settings**: User can toggle review-before-submit, auto-submit, screenshots, and choose which resume to use (if multiple uploaded).

**Match Score Calculation (shown to user):**

- Skills Match: How many required skills are in the user's profile.
- Experience Match: Years of experience vs. job requirements.
- Location Match: User's location vs. job location (remote jobs = 100%).
- Education Match: Required degree level vs. user's education.

**User Actions:**
| Action | Response |
|--------|----------|
| Clicks "Start Application" | Application enters queue. Redirect to Application Progress view. Toast: "Application started!" |
| Clicks "Edit pre-fill values" | Inline editing of the pre-fill table. Any changes are saved as overrides for this application only. |
| Clicks "Cancel" | Return to dashboard. Nothing saved. |
| Clicks a confidence score | Tooltip explaining why confidence is at that level (e.g., "82%: Your resume mentions 6 years, but the question asks for a range. We selected '5-7 years'.") |
| Toggles settings | Saved for this application. Defaults come from global settings. |
| Changes resume dropdown | Pre-fill values update to reflect new resume's data. |

**Edge Cases:**

- **Job posting is expired**: Show warning banner: "This job posting may no longer be accepting applications. Try anyway?"
- **Job posting requires LinkedIn Premium**: Show error: "This job requires LinkedIn Premium to apply. Please upgrade your LinkedIn account."
- **Match score is very low (<40%)**: Show warning: "Your profile has a low match with this role. The application may be less effective. Continue anyway?"
- **Job page could not be scraped** (dynamic loading, auth wall): Show minimal preview with just URL and platform. Note: "We'll analyze the form when the application starts."
- **User has no resume uploaded**: Block "Start Application". Show: "Please upload a resume first." Link to settings.

### 6.3 Mobile Responsiveness

- Job preview card: full width, sub-scores stack 2x2.
- Pre-fill table: horizontal scroll, or value truncated with "..." and tap to expand.
- "Start Application" button: full width, sticky at bottom of screen.

---

## 7. Screen 5: Application Progress View

### 7.1 Wireframe

```
+========================================================================+
|  [<- Dashboard]              Application Progress                      |
+------------------------------------------------------------------------+
|                                                                        |
|  Senior Software Engineer at Stripe                                    |
|  Started 45 seconds ago                                                |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  STATUS BAR                                                      | |
|  |                                                                  | |
|  |  [*]---[*]---[*]---[*]---[>]---[ ]---[ ]---[ ]                 | |
|  |  Queue  Start  Nav  Analyze Fill  Review Submit Done             | |
|  |                                                                  | |
|  |  [================>                    ] 55%                     | |
|  |                                                                  | |
|  |  Currently: Filling fields (4 of 7 completed)                   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +--------------------------------+  +-------------------------------+ |
|  |  FIELD LOG                     |  |  BROWSER PREVIEW              | |
|  |                                |  |                               | |
|  |  [green] First Name            |  |  +-------------------------+  | |
|  |          "Adam"         99%    |  |  |                         |  | |
|  |                                |  |  |  [Live screenshot of    |  | |
|  |  [green] Last Name             |  |  |   the browser showing   |  | |
|  |          "Smith"        99%    |  |  |   the form being        |  | |
|  |                                |  |  |   filled in real time]  |  | |
|  |  [green] Email                 |  |  |                         |  | |
|  |          "adam@gmail.c" 99%    |  |  |                         |  | |
|  |                                |  |  |                         |  | |
|  |  [green] Phone                 |  |  |                         |  | |
|  |          "+1 555-123-"  95%    |  |  +-------------------------+  | |
|  |                                |  |                               | |
|  |  [blue]  Resume Upload         |  |  Last updated: 3s ago        | |
|  |          Uploading...          |  |  [Refresh Screenshot]        | |
|  |                                |  |                               | |
|  |  [ ]    Work Auth              |  +-------------------------------+ |
|  |         Pending...             |                                    |
|  |                                |                                    |
|  |  [ ]    Experience             |                                    |
|  |         Pending...             |                                    |
|  +--------------------------------+                                    |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  [Pause Application]              [Cancel Application]           | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+========================================================================+
```

### 7.2 Key UI Elements

**Status Bar:**

- 8-step progress indicator (horizontal stepper).
- Steps: Queued, Browser Starting, Navigating, Analyzing Form, Filling Fields, Reviewing, Submitting, Done.
- Completed steps: solid blue circle with checkmark.
- Current step: pulsing blue circle with activity indicator.
- Future steps: gray outline circles.
- Percentage progress bar below the stepper.
- "Currently" text with human-readable description of what is happening.

**Field Log (Left Panel):**

- Real-time list of every field the AI is filling.
- Each entry shows: status icon, field name, value used (truncated if long), confidence percentage.
- Status icons: green check (filled successfully), blue spinner (filling now), gray circle (pending), amber warning (low confidence), red X (failed).
- Entries appear in real-time as the AI fills each field (WebSocket updates).
- Clicking a field entry expands it to show: full value, AI reasoning, "Override" button.

**Browser Preview (Right Panel):**

- Live screenshot of the current browser state (updated every 3-5 seconds via WebSocket).
- Shows exactly what the browser looks like right now.
- "Last updated: Ns ago" timestamp.
- "Refresh Screenshot" button for manual refresh.
- On click: opens full-size screenshot in lightbox.
- When in CAPTCHA state: this panel is replaced by the noVNC viewer (Section 8).

**Control Buttons:**

- "Pause Application": Pauses the automation. Button changes to "Resume Application". Application state preserved.
- "Cancel Application": Confirmation dialog. Stops automation, closes browser session, marks as cancelled.

### 7.3 Status Transitions and UI Updates

| State        | Status Bar                                   | Field Log                     | Browser Preview            | Controls                   |
| ------------ | -------------------------------------------- | ----------------------------- | -------------------------- | -------------------------- |
| QUEUED       | Step 1 active, "Waiting in queue (2nd)"      | Empty, "Waiting to start..."  | Placeholder image          | Cancel only                |
| INITIALIZING | Step 2 active, "Starting browser..."         | Empty                         | Placeholder                | Cancel only                |
| NAVIGATING   | Step 3 active, "Opening job page..."         | Empty                         | Browser showing navigation | Pause, Cancel              |
| ANALYZING    | Step 4 active, "Analyzing form structure..." | "Detected N fields..."        | Browser on job page        | Pause, Cancel              |
| FILLING      | Step 5 active, "Filling fields (N of M)"     | Fields appearing in real-time | Browser showing fills      | Pause, Cancel              |
| REVIEWING    | Step 6 active, "Ready for your review"       | All fields shown with values  | Completed form screenshot  | Review, Cancel             |
| SUBMITTING   | Step 7 active, "Submitting..."               | All fields (read-only)        | Browser submitting         | Cancel only (with warning) |
| DONE         | Step 8 active, "Application submitted!"      | Final field summary           | Confirmation screenshot    | View Complete              |

### 7.4 Review State (Special)

When the application reaches the REVIEWING state (step 6), the view transforms:

```
+========================================================================+
|  [<- Dashboard]          Ready for Your Review                         |
+------------------------------------------------------------------------+
|                                                                        |
|  Senior Software Engineer at Stripe                                    |
|  All fields have been filled. Please review before submitting.        |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  FILLED FIELDS                                                   | |
|  |                                                                  | |
|  |  First Name        Adam                [green] 99%   [Override] | |
|  |  Last Name         Smith               [green] 99%   [Override] | |
|  |  Email             adam@gmail.com       [green] 99%   [Override] | |
|  |  Phone             +1 555-123-4567     [green] 95%   [Override] | |
|  |  Resume            resume_v3.pdf       [green] 99%   [Change]   | |
|  |  Work Auth         Yes                 [green] 99%   [Override] | |
|  |  Years of Exp.     5-7 years           [amber] 82%   [Override] | |
|  |                                                                  | |
|  |  [warning icon] 1 field has medium confidence. Please verify.   | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  FORM SCREENSHOT                                                 | |
|  |                                                                  | |
|  |  +----------------------------------------------------------+   | |
|  |  |                                                          |   | |
|  |  |  [Full screenshot of the completed application form]     |   | |
|  |  |                                                          |   | |
|  |  +----------------------------------------------------------+   | |
|  |                                                                  | |
|  |  [Open in Browser] (launches noVNC for manual edits)            | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|       [Go Back and Edit]        [Approve and Submit]                  |
|                                                                        |
+========================================================================+
```

**Override Flow:**
When user clicks "Override" on a field:

1. Field expands inline with an edit input.
2. User types new value.
3. System shows: "Original (AI): 5-7 years --> Your override: 7-10 years"
4. Click "Save Override" or press Enter.
5. System will use the overridden value when submitting.
6. Field now shows a "user override" badge instead of confidence score.

### 7.5 Edge Cases

- **Application takes longer than expected (>5 min)**: Show banner: "This is taking longer than usual. The job page may be complex. We're still working on it."
- **Browser crashes during fill**: Show error state with "Retry" button. System attempts to resume from last checkpoint. If checkpoint is recent (<30s old), retries seamlessly. If not, restarts from the beginning with note to user.
- **User closes browser tab during active application**: Application continues in the background. Dashboard shows active card. Push notification on completion.
- **Multiple applications running simultaneously**: Each has its own progress view. Dashboard shows all active cards. User can switch between them.
- **Field override conflicts with form validation**: System attempts to fill with overridden value. If form rejects it, show error: "The form did not accept your override value. Original AI value restored."

### 7.6 Mobile Responsiveness

- Two-panel layout (field log + browser preview) stacks vertically.
- Browser preview becomes a collapsible section (collapsed by default on mobile to save space).
- Status bar: simplified to current step name + progress bar (no full stepper).
- Control buttons: sticky at bottom of screen.

---

## 8. Screen 6: CAPTCHA / Human Takeover

### 8.1 Wireframe

```
+========================================================================+
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |                  ATTENTION NEEDED                                | |
|  |                                                                  | |
|  |  A CAPTCHA was detected on the application for:                 | |
|  |  Senior Software Engineer at Stripe                              | |
|  |                                                                  | |
|  |  Please solve it below to continue your application.            | |
|  |                                                                  | |
|  |  +----------------------------------------------------------+   | |
|  |  |                                                          |   | |
|  |  |                                                          |   | |
|  |  |                                                          |   | |
|  |  |          [noVNC Remote Browser Viewer]                   |   | |
|  |  |                                                          |   | |
|  |  |    You are controlling the browser directly.             |   | |
|  |  |    Click and type normally to interact.                  |   | |
|  |  |                                                          |   | |
|  |  |                                                          |   | |
|  |  |                                                          |   | |
|  |  |                                                          |   | |
|  |  +----------------------------------------------------------+   | |
|  |                                                                  | |
|  |  Connection: [green dot] Connected | Quality: High              | |
|  |                                                                  | |
|  |  Time remaining: 28:45                                          | |
|  |                                                                  | |
|  |  +-----------------------------+  +---------------------------+ | |
|  |  |   I've solved the CAPTCHA   |  |  Skip this application   | | |
|  |  |   [Resume Automation]       |  |  [Cancel]                | | |
|  |  +-----------------------------+  +---------------------------+ | |
|  |                                                                  | |
|  |  Having trouble? [Tips for solving CAPTCHAs]                    | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
+========================================================================+
```

### 8.2 Key UI Elements

**Modal Overlay:**

- Full-screen semi-transparent overlay (blocks interaction with dashboard behind it).
- Cannot be dismissed by clicking outside -- must take explicit action.
- Keyboard accessible: Escape key shows "Are you sure you want to skip?" confirmation.

**noVNC Viewer:**

- Embedded noVNC canvas showing the live browser.
- User can click, type, and interact directly with the remote browser.
- Cursor changes to indicate remote control is active.
- Full mouse and keyboard passthrough via VNC protocol.

**Connection Status:**

- Green dot + "Connected": VNC connection is active.
- Yellow dot + "Reconnecting...": Connection dropped, auto-reconnecting.
- Red dot + "Disconnected": Connection lost. "Retry Connection" button appears.

**Quality Indicator:**

- High / Medium / Low based on latency.
- High: <150ms latency. Medium: 150-300ms. Low: >300ms.

**Timeout Indicator:**

- Countdown from 30 minutes.
- At 25 minutes: turns amber.
- At 28 minutes: turns red, pulsing. "Hurry! Application will be cancelled in 2 minutes."
- At 30 minutes: application cancelled, modal closes, user notified.

**Action Buttons:**

- "Resume Automation" (primary): User signals they have solved the CAPTCHA. System takes over again.
- "Cancel" (secondary): Cancels this application entirely. Confirmation dialog first.

### 8.3 Takeover Reasons (Beyond CAPTCHA)

The same modal is used for other human takeover scenarios:

| Reason             | Title Text                          | Instructions                                                                   |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------ |
| CAPTCHA            | "A CAPTCHA was detected"            | "Please solve the CAPTCHA below to continue."                                  |
| Login required     | "LinkedIn session expired"          | "Please log into LinkedIn below. Your session will be saved."                  |
| Complex form       | "We need your help with a question" | "The AI is unsure about a form field. Please fill it in below."                |
| Ambiguous question | "Please answer this question"       | "We found a question we cannot confidently answer. Please type your response." |

### 8.4 User Actions

| Action                               | Response                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Interacts with noVNC (clicks, types) | Actions forwarded to remote browser in real-time.                                                                                     |
| Clicks "Resume Automation"           | Modal closes. Progress view returns. Status updates to "Resuming..." then continues filling.                                          |
| Clicks "Cancel"                      | Confirmation: "Cancel this application? The CAPTCHA timeout will not affect other applications." If confirmed, application cancelled. |
| Connection drops                     | Auto-reconnect (3 attempts, 2s interval). If fails: "Connection lost. The application is paused. You can retry or cancel."            |
| Timeout reaches 0                    | Modal auto-closes. Application marked as "Timed out -- CAPTCHA not solved." Notification sent.                                        |

### 8.5 Edge Cases

- **User solves CAPTCHA but does not click "Resume"**: System auto-detects CAPTCHA resolution by monitoring DOM changes (CAPTCHA element disappears, page navigates). Shows: "It looks like the CAPTCHA was solved! Resuming automation..." with 5-second countdown before auto-resuming.
- **noVNC fails to connect**: Show fallback with screenshot of current state + instructions: "Remote connection failed. Here is what the browser shows. You can try refreshing, or cancel this application."
- **User accidentally navigates away from the job page in noVNC**: System detects URL change. Warning: "You navigated away from the application page. Please go back to [URL] or click Resume to let us handle it."
- **Multiple CAPTCHAs in sequence**: Each triggers a new takeover. Counter shown: "CAPTCHA 2 of 2 detected."
- **Mobile user gets takeover notification**: noVNC works on mobile browsers but interaction is difficult. Show message: "For the best experience solving CAPTCHAs, use a desktop browser. You have 30 minutes."

### 8.6 Mobile Responsiveness

- noVNC viewer scales to fill available screen width.
- Pinch-to-zoom enabled for interacting with small elements.
- Buttons stack vertically below the viewer.
- Landscape orientation suggested via banner.

---

## 9. Screen 7: Application Complete

### 9.1 Wireframe

```
+========================================================================+
|  [<- Dashboard]            Application Complete                        |
+------------------------------------------------------------------------+
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |             [large green checkmark icon]                         | |
|  |                                                                  | |
|  |          Application Submitted Successfully                      | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  SUMMARY                                                         | |
|  |                                                                  | |
|  |  Position        Senior Software Engineer                        | |
|  |  Company         Stripe                                          | |
|  |  Location        San Francisco, CA (Hybrid)                      | |
|  |  Platform        LinkedIn Easy Apply                             | |
|  |  Applied On      Feb 11, 2026 at 2:34 PM                        | |
|  |  Duration        1 minute, 42 seconds                            | |
|  |  Fields Filled   7 of 7                                          | |
|  |  AI Confidence   94% average                                     | |
|  |  User Overrides  1 (Years of Experience: changed to 7-10)        | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  CONFIRMATION SCREENSHOT                                         | |
|  |                                                                  | |
|  |  +----------------------------------------------------------+   | |
|  |  |                                                          |   | |
|  |  |  [Screenshot of the confirmation page after submission]  |   | |
|  |  |                                                          |   | |
|  |  +----------------------------------------------------------+   | |
|  |                                                                  | |
|  |  [Download Screenshot]  [View Full Size]                         | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  FIELD DETAILS (Expandable)                         [Expand v]   | |
|  |                                                                  | |
|  |  Field              Value              Source       Confidence   | |
|  |  -----              -----              ------       ----------   | |
|  |  First Name         Adam               Resume       99%         | |
|  |  Last Name          Smith              Resume       99%         | |
|  |  Email              adam@gmail.com     Google       99%         | |
|  |  Phone              +1 555-123-4567   Resume       95%         | |
|  |  Resume             resume_v3.pdf     Upload       99%         | |
|  |  Work Auth          Yes               Q&A Bank     99%         | |
|  |  Years of Exp.      7-10 years        User Override  --        | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  WHAT'S NEXT                                                     | |
|  |                                                                  | |
|  |  [View on LinkedIn]  [Apply to Similar Jobs]  [+ New Application]| |
|  +------------------------------------------------------------------+ |
|                                                                        |
+========================================================================+
```

### 9.2 Key UI Elements

**Success Header:**

- Large green checkmark animation (Lottie or CSS animation).
- "Application Submitted Successfully" in large text.
- If the submission was unverified: amber header with "Application Submitted (Unverified)" and note: "We submitted the form but could not confirm success. Please check your email for a confirmation."

**Summary Card:**

- Clean, scannable key-value layout.
- Duration shown to demonstrate speed (value prop reinforcement).
- AI Confidence as an average across all fields.
- User Overrides count with details on what was changed.

**Confirmation Screenshot:**

- The screenshot taken immediately after form submission.
- Shows the "thank you" or confirmation page from the platform.
- Downloadable for user's records.
- Enlargeable in a lightbox.

**Field Details:**

- Collapsed by default (user can expand).
- Shows every field, the value used, where the value came from (Resume, Q&A Bank, AI Generated, User Override), and confidence score.
- "Source" column helps users understand and trust the system.

**What's Next Actions:**

| Button                  | Action                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| "View on LinkedIn"      | Opens the original job posting in a new tab.                                                         |
| "Apply to Similar Jobs" | Opens a search/suggestion view of similar jobs (v1.1 feature; for MVP, links to a dashboard search). |
| "+ New Application"     | Opens the New Application flow.                                                                      |

### 9.3 Failed Application State

If the application failed, this screen shows a different layout:

```
+========================================================================+
|  [<- Dashboard]            Application Failed                          |
+------------------------------------------------------------------------+
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |             [red X icon]                                         | |
|  |                                                                  | |
|  |          Application Could Not Be Submitted                      | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  WHAT HAPPENED                                                   | |
|  |                                                                  | |
|  |  [error icon] The form submission failed because:                | |
|  |                                                                  | |
|  |  "The application deadline has passed for this position."        | |
|  |                                                                  | |
|  |  Error occurred at step: Submitting (step 7 of 8)               | |
|  |  Time elapsed: 1 minute, 12 seconds                             | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  LAST SCREENSHOT                                                 | |
|  |                                                                  | |
|  |  [Screenshot of the browser at the time of failure]              | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  [Retry Application]   [Apply to Similar Jobs]   [Back to Dashboard]  |
|                                                                        |
+========================================================================+
```

**Failure Reasons and Messages:**

| Internal Error        | User-Facing Message                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Job posting expired   | "The application deadline has passed for this position."                                           |
| Session expired       | "Your LinkedIn session expired during the application. Please reconnect LinkedIn in Settings."     |
| Form validation error | "The form rejected one or more values. Please review and try again."                               |
| CAPTCHA timeout       | "A CAPTCHA appeared and was not solved within 30 minutes."                                         |
| Browser crash         | "An unexpected error occurred. Please try again."                                                  |
| Account restricted    | "Your LinkedIn account may have restrictions. Please check LinkedIn directly and contact support." |
| Network error         | "A network error occurred. Please check your connection and try again."                            |

### 9.4 Edge Cases

- **Screenshot not captured**: Show placeholder: "Screenshot unavailable. The confirmation page may have loaded too quickly."
- **Application partially submitted** (multi-page form, failed on page 3): Show fields filled so far with note: "The application was partially completed. Pages 1-2 were filled but page 3 encountered an error."
- **Duplicate application detected post-submit**: Show warning: "Note: LinkedIn may show a 'You already applied' message. This could be from a previous application."

---

## 10. Screen 8: Settings

### 10.1 Wireframe -- Settings Overview

```
+========================================================================+
| [Logo] WeKruit          [Search...]         [Bell icon] [Avatar v]     |
+========================================================================+
|                                                                        |
|  +----+  Settings                                                      |
|  |    |                                                                |
|  | S  |  +-----------------------------------------------------------+|
|  | e  |  |  [icon] Profile & Resume                              [>] ||
|  | t  |  +-----------------------------------------------------------+|
|  | t  |  |  [icon] Q&A Bank                                      [>] ||
|  | i  |  +-----------------------------------------------------------+|
|  | n  |  |  [icon] Notifications                                 [>] ||
|  | g  |  +-----------------------------------------------------------+|
|  | s  |  |  [icon] Automation Preferences                        [>] ||
|  |    |  +-----------------------------------------------------------+|
|  | N  |  |  [icon] Connected Accounts                            [>] ||
|  | a  |  +-----------------------------------------------------------+|
|  | v  |  |  [icon] Subscription & Billing                        [>] ||
|  |    |  +-----------------------------------------------------------+|
|  |    |  |  [icon] Data & Privacy                                [>] ||
|  |    |  +-----------------------------------------------------------+|
|  |    |                                                                |
|  +----+                                                                |
+========================================================================+
```

### 10.2 Settings -- Profile & Resume

```
+------------------------------------------------------------------+
|  Profile & Resume                                                |
|                                                                  |
|  PERSONAL INFORMATION                                            |
|  (Same as Onboarding Step 3 review screen, fully editable)       |
|  First Name, Last Name, Email, Phone, Location, URLs             |
|                                                                  |
|  RESUMES                                                         |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | resume_v3.pdf             [DEFAULT]                         | |
|  | Uploaded Feb 10, 2026     [Download] [Delete] [Set Default] | |
|  +------------------------------------------------------------+ |
|  | resume_design_v1.pdf                                        | |
|  | Uploaded Feb 5, 2026      [Download] [Delete] [Set Default] | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  [Upload New Resume]                                             |
|                                                                  |
|  WORK EXPERIENCE / EDUCATION / SKILLS                            |
|  (Same as Onboarding Step 3, fully editable)                     |
|                                                                  |
|  ADDITIONAL INFO                                                 |
|  Work Auth, Visa, Relocation, Salary                             |
+------------------------------------------------------------------+
```

### 10.3 Settings -- Q&A Bank

Same layout as Onboarding Step 4, with additions:

- "Import from previous applications" button -- shows questions the AI encountered in past applications that the user can now pre-answer.
- "Suggested questions" section -- AI suggests questions the user has not answered but are common for their field.
- Search/filter bar for questions.
- Each question shows: answer, usage mode, last used date, times used count.

### 10.4 Settings -- Notifications

```
+------------------------------------------------------------------+
|  Notifications                                                   |
|                                                                  |
|  CHANNELS                                                        |
|  [x] In-app notifications (always on)                            |
|  [x] Browser push notifications                                  |
|  [x] Email notifications                                         |
|  [ ] SMS notifications (Pro plan only)                            |
|                                                                  |
|  FREQUENCY                                                       |
|  (*) Real-time (notify immediately)                              |
|  ( ) Batch (hourly digest)                                       |
|  ( ) Daily digest (one email per day)                            |
|                                                                  |
|  NOTIFY ME WHEN                                                  |
|  [x] Application submitted successfully                          |
|  [x] Application failed                                          |
|  [x] CAPTCHA / human takeover needed                             |
|  [x] Application ready for review                                |
|  [ ] Application queued                                          |
|  [ ] Weekly summary report                                       |
|                                                                  |
|  QUIET HOURS                                                     |
|  [ ] Enable quiet hours                                          |
|      From [10:00 PM] to [8:00 AM]                                |
|      (Notifications are silenced but still recorded)             |
|                                                                  |
|  [Save Changes]                                                  |
+------------------------------------------------------------------+
```

### 10.5 Settings -- Automation Preferences

```
+------------------------------------------------------------------+
|  Automation Preferences                                          |
|                                                                  |
|  REVIEW MODE                                                     |
|  (*) Review before submit (recommended)                          |
|      AI fills the form, then pauses for you to review            |
|      and approve before submission.                              |
|                                                                  |
|  ( ) Auto-submit if high confidence                              |
|      Auto-submit when all fields are above [90%] confidence.     |
|      Pause for review otherwise.                                 |
|      Confidence threshold: [=====>    ] 90%                      |
|                                                                  |
|  ( ) Always auto-submit                                          |
|      [!] Not recommended. Applications may contain errors.       |
|      [checkbox] I understand the risks of auto-submit.           |
|                                                                  |
|  CAPTCHA HANDLING                                                |
|  (*) Notify me and wait (up to [30] minutes)                     |
|  ( ) Skip application if CAPTCHA appears                         |
|                                                                  |
|  RATE LIMITING                                                   |
|  Maximum applications per day: [___20___]                        |
|  (LinkedIn recommended limit: 20/day)                            |
|                                                                  |
|  Minimum time between applications: [___2___] minutes            |
|                                                                  |
|  SCREENSHOTS                                                     |
|  [x] Take screenshot before submission                           |
|  [x] Take screenshot of confirmation page                        |
|  [ ] Take screenshot at each step                                |
|                                                                  |
|  [Save Changes]                                                  |
+------------------------------------------------------------------+
```

### 10.6 Settings -- Connected Accounts

```
+------------------------------------------------------------------+
|  Connected Accounts                                              |
|                                                                  |
|  GOOGLE ACCOUNT                                                  |
|  [Google icon] adam@gmail.com                [Connected]          |
|  Scopes: Sign-in                                                 |
|  [Disconnect]                                                    |
|                                                                  |
|  LINKEDIN                                                        |
|  [LinkedIn icon] linkedin.com/in/adamsmith  [Connected]          |
|  Session status: Active (expires ~Feb 18)                        |
|  Last verified: 2 hours ago                                      |
|  [Refresh Session] [Disconnect]                                  |
|                                                                  |
|  GMAIL (for email verification)                          [v1.1]  |
|  [Gmail icon] Not connected                                      |
|  Used to automatically handle email verification codes            |
|  during applications.                                            |
|  [Connect Gmail] (requires gmail.readonly scope)                 |
|                                                                  |
+------------------------------------------------------------------+
```

### 10.7 Settings -- Data & Privacy

```
+------------------------------------------------------------------+
|  Data & Privacy                                                  |
|                                                                  |
|  DATA RETENTION                                                  |
|  Screenshots retained for: [30 days v]                           |
|  Form data retained for:   [90 days v]                           |
|  Audit logs retained for:  [90 days v]                           |
|                                                                  |
|  YOUR DATA                                                       |
|  [Export All My Data] (JSON/CSV download)                        |
|  [Delete All My Data] (irreversible, requires confirmation)      |
|                                                                  |
|  WHAT WE STORE                                                   |
|  - Resume content (encrypted, AES-256)                           |
|  - Application history and form answers                          |
|  - Screenshots (encrypted, separate storage)                     |
|  - Q&A bank answers                                              |
|                                                                  |
|  WHAT WE DON'T STORE                                             |
|  - LinkedIn password                                             |
|  - Sensitive EEO data (auto-deleted after submission)            |
|  - Email content (only verification codes are extracted)         |
|                                                                  |
|  AI DATA PROCESSING                                              |
|  Resume text is processed by AI (Anthropic Claude / OpenAI).     |
|  These providers do NOT train on API data.                       |
|  Data is processed and not retained beyond the request.          |
|                                                                  |
|  [Read Full Privacy Policy]                                      |
+------------------------------------------------------------------+
```

### 10.8 Edge Cases for Settings

- **User deletes all data**: Confirmation flow: "Type DELETE to confirm. This will permanently remove all your data including application history, resumes, Q&A answers, and screenshots. This cannot be undone." After deletion, user is logged out and account is deactivated.
- **LinkedIn session expires while user is in settings**: Banner at top of Connected Accounts: "Your LinkedIn session has expired. Please reconnect to continue applying to LinkedIn jobs."
- **User changes email**: Not allowed directly (tied to Google OAuth). Note: "Your email is linked to your Google account. To change it, sign up with a different Google account."
- **Multiple resumes**: Max 5 resumes. If user tries to upload 6th: "You have reached the maximum of 5 resumes. Please delete one before uploading a new one."

---

## 11. Screen 9: Subscription / Pricing

### 11.1 Wireframe

```
+========================================================================+
| [Logo] WeKruit          [Dashboard]         [Bell icon] [Avatar v]     |
+========================================================================+
|                                                                        |
|                   Choose Your Plan                                     |
|                                                                        |
|  +-------------+  +-------------+  +-------------+  +-------------+   |
|  |    FREE     |  |   STARTER   |  |     PRO     |  | ENTERPRISE  |   |
|  |             |  |             |  |  [Popular]  |  |             |   |
|  |    $0/mo    |  |   $19/mo    |  |   $49/mo    |  |   $99/mo    |   |
|  |             |  |             |  |             |  |             |   |
|  | 5 apps/mo   |  | 50 apps/mo  |  | 200 apps/mo |  | 500+ apps/mo|  |
|  |             |  |             |  |             |  |             |   |
|  | LinkedIn    |  | LinkedIn    |  | LinkedIn    |  | All         |   |
|  | Easy Apply  |  | Easy Apply  |  | + Greenhouse|  | platforms   |   |
|  |             |  |             |  | + Lever     |  |             |   |
|  | Basic       |  | Full        |  | AI cover    |  | Priority    |   |
|  | dashboard   |  | dashboard   |  | letters     |  | processing  |   |
|  |             |  | Q&A bank    |  | Analytics   |  | API access  |   |
|  |             |  |             |  | Bulk apply  |  | Team mgmt   |   |
|  |             |  |             |  |             |  |             |   |
|  | [Current]   |  | [Upgrade]   |  | [Upgrade]   |  | [Contact]   |   |
|  +-------------+  +-------------+  +-------------+  +-------------+   |
|                                                                        |
|  [Toggle: Monthly / Annual (save 20%)]                                |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|  DETAILED COMPARISON                                                   |
|                                                                        |
|  Feature                    Free   Starter  Pro    Enterprise         |
|  -------------------------  -----  -------  ----   ----------         |
|  Applications / month       5      50       200    500+               |
|  LinkedIn Easy Apply        [x]    [x]      [x]    [x]               |
|  Greenhouse / Lever         [ ]    [ ]      [x]    [x]               |
|  Workday / iCIMS            [ ]    [ ]      [ ]    [x]               |
|  Q&A Bank                   5 Q    Unlim.   Unlim. Unlim.            |
|  AI Cover Letters           [ ]    [ ]      [x]    [x]               |
|  Multiple Resumes           1      3        5      10                |
|  Analytics Dashboard        [ ]    [ ]      [x]    [x]               |
|  Bulk URL Submission        [ ]    [ ]      [x]    [x]               |
|  Priority Processing        [ ]    [ ]      [ ]    [x]               |
|  API Access                 [ ]    [ ]      [ ]    [x]               |
|  Email Support              [ ]    [x]      [x]    [x]               |
|  Priority Support           [ ]    [ ]      [x]    [x]               |
|  Dedicated Account Mgr.     [ ]    [ ]      [ ]    [x]               |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|  FREQUENTLY ASKED QUESTIONS                                            |
|                                                                        |
|  [v] What happens when I hit my monthly limit?                        |
|      You can purchase additional applications at $0.50 each,          |
|      or upgrade to a higher plan.                                     |
|                                                                        |
|  [v] Can I cancel anytime?                                            |
|      Yes. No long-term contracts. Cancel from your account            |
|      settings at any time.                                            |
|                                                                        |
|  [v] Do unused applications roll over?                                |
|      No. Application counts reset each billing cycle.                 |
|                                                                        |
|  [v] What is the refund policy?                                       |
|      We offer a full refund within the first 7 days if you            |
|      are not satisfied. After that, you can cancel but we do          |
|      not issue partial refunds.                                       |
|                                                                        |
+========================================================================+
```

### 11.2 Key UI Elements

- **Popular badge**: "Pro" plan highlighted with a badge and subtle border emphasis.
- **Current plan indicator**: The user's current plan shows "Current Plan" instead of "Upgrade" button.
- **Annual toggle**: Shows 20% discount. Price updates dynamically when toggled.
- **Enterprise CTA**: "Contact Sales" instead of direct upgrade.

### 11.3 Upgrade Flow

| Action                     | Response                                                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Clicks "Upgrade" on a plan | Opens Stripe Checkout (or embedded payment form).                                                                                  |
| Completes payment          | Success screen: "Welcome to [Plan]! You now have [N] applications per month." Redirect to dashboard.                               |
| Payment fails              | Error: "Payment could not be processed. Please check your card details and try again."                                             |
| Downgrades plan            | Confirmation: "Your plan will change at the end of your current billing period. You will keep your current features until [date]." |
| Hits monthly limit         | Banner on dashboard: "You have used all 5 applications this month. [Upgrade] or wait until [date]."                                |

### 11.4 Edge Cases

- **User on annual plan wants to switch to monthly**: Show: "You are on an annual plan paid until [date]. You can switch to monthly billing when your annual term ends."
- **Enterprise user needs more than 500**: "Contact sales for custom volume pricing. Additional applications are $0.25 each."
- **Free user tries to access Pro feature**: Feature is visible but disabled with lock icon. Tooltip: "Available on Pro plan. [Upgrade]."

---

## 12. Screen 10: Browser Extension UI

### 12.1 Overview

**Scope:** v1.1 feature. Designing it now for architecture alignment.

The browser extension has three components:

1. **Floating Apply Button** (content script, injected on job pages).
2. **Popup Panel** (extension popup, accessible from toolbar icon).
3. **Options Page** (full settings page, links to web dashboard).

### 12.2 Floating Apply Button

Appears on supported job pages (LinkedIn, Greenhouse, Lever).

```
+------------------------------------------+
|  Job posting page content                |
|                                          |
|  Senior Software Engineer                |
|  Stripe | San Francisco, CA              |
|                                          |
|  [Apply] [Save]    +------------------+ |
|                     | [W] Apply with   | |
|                     |     WeKruit      | |
|                     +------------------+ |
|                                          |
|  Job description continues...            |
+------------------------------------------+
```

**Button States:**

| State           | Visual                             | Text                                          |
| --------------- | ---------------------------------- | --------------------------------------------- |
| Default         | Blue pill button with WeKruit icon | "Apply with WeKruit"                          |
| Hover           | Darker blue, slight scale up       | "Apply with WeKruit"                          |
| Clicked         | Spinner replaces icon              | "Starting..."                                 |
| Queued          | Green check replaces icon          | "Queued! View in Dashboard"                   |
| Already applied | Gray, disabled                     | "Already Applied (Feb 10)"                    |
| Not logged in   | Amber                              | "Sign in to WeKruit"                          |
| Not supported   | Hidden                             | (Button does not appear on unsupported pages) |

**Position:** Fixed, bottom-right of the viewport. Draggable to reposition. Remembers position across pages.

**User Actions:**
| Action | Response |
|--------|----------|
| Clicks "Apply with WeKruit" | Job URL sent to backend. Button changes to "Starting..." then "Queued!" Toast notification: "Application started! Track progress in your dashboard." |
| Clicks "View in Dashboard" | Opens dashboard in new tab, navigates to this application's progress view. |
| Clicks "Sign in to WeKruit" | Opens extension popup with sign-in flow. |

### 12.3 Extension Popup

Accessible from the browser toolbar icon.

```
+----------------------------------+
|  [WeKruit Logo]        [gear]    |
+----------------------------------+
|                                  |
|  Hi, Adam!                       |
|  Plan: Starter (37/50 remaining) |
|                                  |
+----------------------------------+
|  ACTIVE (2)                      |
|                                  |
|  Senior SWE at Stripe            |
|  [====>     ] 42% - Filling...   |
|                                  |
|  PM at Notion                    |
|  [========> ] 85% - Reviewing    |
|  [Review Now]                    |
|                                  |
+----------------------------------+
|  RECENT                          |
|                                  |
|  [green] Frontend Eng @ Google   |
|  [green] Full Stack @ Meta       |
|  [red]   Backend Eng @ Apple     |
|                                  |
+----------------------------------+
|  [Open Dashboard]                |
+----------------------------------+
```

**Width:** 360px. **Max height:** 500px (scrollable).

**Key Elements:**

- User greeting with remaining application count.
- Active applications mini-list with progress bars.
- "Review Now" button for applications in review state.
- Recent applications with status icons.
- "Open Dashboard" link at the bottom.

### 12.4 Edge Cases

- **Page is not a job listing**: Floating button is hidden. Extension popup still works.
- **User is on a Workday page (not yet supported)**: Button shows with "Coming Soon" label, disabled.
- **User has no remaining applications**: Button shows "Limit Reached. Upgrade?" in amber.
- **Extension is installed but user is not logged in**: Popup shows sign-in button. Floating button shows "Sign in to WeKruit."
- **Extension conflicts with other extensions**: Floating button uses shadow DOM to avoid CSS conflicts. Z-index set high (999999) but configurable.

---

## 13. Notification System

### 13.1 Notification Triggers

| Event                     | Priority | Channels                   | Message Template                                                                     |
| ------------------------- | -------- | -------------------------- | ------------------------------------------------------------------------------------ |
| Application submitted     | Normal   | In-app, push, email        | "Your application to [Role] at [Company] was submitted successfully."                |
| Application failed        | High     | In-app, push, email        | "Your application to [Role] at [Company] failed. [Reason]. Tap to retry."            |
| CAPTCHA detected          | Urgent   | In-app, push, email, sound | "A CAPTCHA was detected for [Role] at [Company]. Solve it within 30 min."            |
| Ready for review          | High     | In-app, push               | "Your application to [Role] at [Company] is ready for review."                       |
| Application queued        | Low      | In-app only                | "[Role] at [Company] is queued. Position: [N] in line."                              |
| Session expired           | High     | In-app, push, email        | "Your LinkedIn session expired. Reconnect to continue applying."                     |
| Account restriction       | Critical | In-app, push, email        | "We detected possible restrictions on your LinkedIn account. All automation paused." |
| Weekly summary            | Low      | Email only                 | "This week: [N] applications submitted, [N] successful, [N] interviews."             |
| Monthly limit approaching | Normal   | In-app, push               | "You have [N] applications remaining this month. Upgrade for more."                  |
| Monthly limit reached     | High     | In-app, push, email        | "You've reached your monthly limit. Upgrade or wait until [date]."                   |

### 13.2 Notification Frequency Limits

- Max 1 notification per application per status change (no duplicate notifications).
- During quiet hours: notifications are queued and delivered at end of quiet period.
- CAPTCHA notifications: send at 0 min, 5 min, 15 min, 25 min (escalating urgency).
- Weekly summary: sent on Monday at 9 AM user local time.
- Max 10 push notifications per day (aggregate if more).

### 13.3 In-App Notification Center

```
+----------------------------------+
|  Notifications             [x]   |
+----------------------------------+
|  TODAY                           |
|                                  |
|  [green dot] 2:34 PM            |
|  Application submitted           |
|  Senior SWE at Stripe           |
|                                  |
|  [red dot] 2:30 PM              |
|  Application failed              |
|  Backend Eng at Apple            |
|  Reason: Job posting expired    |
|                                  |
|  [blue dot] 2:15 PM             |
|  Application queued              |
|  Data Analyst at Airbnb         |
|                                  |
|  YESTERDAY                       |
|  ...                             |
|                                  |
+----------------------------------+
|  [Mark All as Read]              |
+----------------------------------+
```

- Dropdown from bell icon in the top navigation.
- Grouped by day.
- Unread notifications have colored dot. Count badge on bell icon.
- Click notification to navigate to relevant application view.
- "Mark All as Read" at the bottom.

### 13.4 Push Notification Format

```
[WeKruit icon]
Application Submitted
Senior SWE at Stripe - submitted successfully in 1m 42s.
[Tap to view details]
```

- Title: Event type.
- Body: Role at Company + brief detail.
- Action: Deep link to the relevant screen.

### 13.5 Email Notification Format

Subject: "[WeKruit] Application to Senior SWE at Stripe - Submitted"

Body:

- Header with WeKruit logo.
- Event summary (same as push notification).
- Quick action buttons: "View Application" | "Open Dashboard".
- Footer with unsubscribe link and notification preferences link.

---

## 14. Empty States

### 14.1 Dashboard -- No Applications

```
+------------------------------------------------------------------+
|                                                                  |
|  +----------------------------------------------------------+   |
|  |                                                          |   |
|  |            [illustration: person at laptop]              |   |
|  |                                                          |   |
|  |       No applications yet                                |   |
|  |                                                          |   |
|  |       Paste a job URL to submit your first               |   |
|  |       application in under 2 minutes.                    |   |
|  |                                                          |   |
|  |       [+ Start Your First Application]                   |   |
|  |                                                          |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+------------------------------------------------------------------+
```

### 14.2 Dashboard -- No Active Applications

```
+------------------------------------------------------------------+
|  ACTIVE APPLICATIONS (0)                                         |
|                                                                  |
|  No applications running right now.                              |
|  [+ New Application]                                             |
+------------------------------------------------------------------+
```

### 14.3 Application History -- No Results After Filter

```
+------------------------------------------------------------------+
|  No applications match your filters.                             |
|  [Clear Filters]                                                 |
+------------------------------------------------------------------+
```

### 14.4 Q&A Bank -- No Questions Answered

```
+------------------------------------------------------------------+
|                                                                  |
|  [illustration: clipboard with checkmarks]                       |
|                                                                  |
|  No screening questions answered yet                             |
|                                                                  |
|  Answer common questions here so our AI can fill                 |
|  them automatically on your applications.                        |
|                                                                  |
|  [Answer Common Questions]                                       |
|                                                                  |
+------------------------------------------------------------------+
```

### 14.5 Settings -- No Resume Uploaded

```
+------------------------------------------------------------------+
|  RESUMES                                                         |
|                                                                  |
|  No resume uploaded yet.                                         |
|                                                                  |
|  Upload your resume so we can fill applications                  |
|  for you. We support PDF and DOCX.                               |
|                                                                  |
|  [Upload Resume]                                                 |
+------------------------------------------------------------------+
```

### 14.6 Settings -- No LinkedIn Connected

```
+------------------------------------------------------------------+
|  LINKEDIN                                                        |
|                                                                  |
|  [LinkedIn icon] Not connected                                   |
|                                                                  |
|  Connect your LinkedIn to apply to LinkedIn Easy Apply jobs.     |
|                                                                  |
|  [Connect LinkedIn]                                              |
+------------------------------------------------------------------+
```

### 14.7 Notification Center -- No Notifications

```
+----------------------------------+
|  Notifications             [x]   |
+----------------------------------+
|                                  |
|  No notifications yet.           |
|                                  |
|  You'll see updates here when    |
|  you start applying to jobs.     |
|                                  |
+----------------------------------+
```

---

## 15. Error States

### 15.1 Global Error States

**Network Disconnected (persistent banner):**

```
+------------------------------------------------------------------+
|  [warning icon] You're offline. Some features may not work.      |
|  Reconnecting...                                       [Dismiss] |
+------------------------------------------------------------------+
```

**WebSocket Disconnected:**

```
+------------------------------------------------------------------+
|  [warning icon] Live updates paused. Reconnecting...             |
|  Application progress may be delayed.                  [Refresh] |
+------------------------------------------------------------------+
```

**Session Expired:**

```
+========================================================================+
|                                                                        |
|           Your session has expired.                                    |
|                                                                        |
|           Please sign in again to continue.                            |
|                                                                        |
|           [Sign In with Google]                                        |
|                                                                        |
|           Your applications in progress will continue                  |
|           running in the background.                                   |
|                                                                        |
+========================================================================+
```

**Server Error (500):**

```
+========================================================================+
|                                                                        |
|           [illustration: construction/wrench]                          |
|                                                                        |
|           Something went wrong on our end.                             |
|                                                                        |
|           Our team has been notified. Please try again                 |
|           in a few minutes.                                            |
|                                                                        |
|           Error ID: WK-2026-0211-A3F7                                 |
|           [Retry] [Contact Support]                                    |
|                                                                        |
+========================================================================+
```

### 15.2 Application-Specific Error States

**LinkedIn Account Restricted:**

```
+------------------------------------------------------------------+
|  [red alert icon] Account Restriction Detected                   |
|                                                                  |
|  We detected a possible restriction on your LinkedIn account.    |
|  All automation has been paused immediately.                     |
|                                                                  |
|  What to do:                                                     |
|  1. Go to LinkedIn directly and check for any alerts             |
|  2. Complete any verification steps LinkedIn requires            |
|  3. Wait 24-48 hours before re-enabling automation               |
|  4. Consider reducing your daily application limit               |
|                                                                  |
|  Your queued applications have been cancelled.                   |
|  Completed applications are unaffected.                          |
|                                                                  |
|  [Go to LinkedIn]  [Adjust Settings]  [Contact Support]         |
+------------------------------------------------------------------+
```

**Resume Parse Failed:**

```
+------------------------------------------------------------------+
|  [warning icon] We had trouble reading your resume.              |
|                                                                  |
|  Possible reasons:                                               |
|  - The file may be a scanned image (not text-based)              |
|  - The file may be corrupted                                     |
|  - The format may be unsupported                                 |
|                                                                  |
|  [Try Another File]  [Fill In Manually]                          |
+------------------------------------------------------------------+
```

**Application Stuck (no progress for 2+ minutes):**

```
+------------------------------------------------------------------+
|  [warning icon] This application seems stuck.                    |
|                                                                  |
|  No progress in the last 2 minutes. This might be due to:       |
|  - A slow-loading page                                           |
|  - An unexpected form layout                                     |
|  - A browser issue                                               |
|                                                                  |
|  [Retry from Last Step]  [Open in Browser]  [Cancel]            |
+------------------------------------------------------------------+
```

### 15.3 Form Error Handling During Application

When the AI encounters a form validation error during filling:

```
+------------------------------------------------------------------+
|  FIELD LOG                                                       |
|                                                                  |
|  [green] First Name       "Adam"                99%              |
|  [green] Last Name        "Smith"               99%              |
|  [red]   Phone            "+1 555-123-4567"     REJECTED         |
|          Form says: "Please enter a valid US phone number"       |
|          Retrying with: "(555) 123-4567"                         |
|  [green] Phone            "(555) 123-4567"      95%   (Retry 1) |
|  ...                                                             |
+------------------------------------------------------------------+
```

The AI attempts self-correction:

1. Read the error message.
2. Reformat the value.
3. Retry the field (max 3 attempts).
4. If all retries fail: mark field as needing human intervention.

---

## 16. Loading States

### 16.1 Dashboard Loading (Skeleton Screen)

```
+------------------------------------------------------------------+
|                                                                  |
|  STATS BAR                                                       |
|  [====] [====] [====] [====]  (gray rectangles pulsing)         |
|                                                                  |
|  ACTIVE APPLICATIONS                                             |
|  +--------------------+  +--------------------+                  |
|  | [====]             |  | [====]             |                  |
|  | [===========]      |  | [===========]      |                  |
|  | [====]             |  | [====]             |                  |
|  +--------------------+  +--------------------+                  |
|                                                                  |
|  RECENT APPLICATIONS                                             |
|  [o] [====================] [======] [====]                      |
|  [o] [====================] [======] [====]                      |
|  [o] [====================] [======] [====]                      |
|                                                                  |
+------------------------------------------------------------------+
```

All placeholders use the same gray (#E2E8F0) with a subtle pulse animation (opacity 0.6 to 1.0, 1.5s cycle).

### 16.2 Job Preview Loading

```
+------------------------------------------------------------------+
|  Analyzing job posting...                                        |
|                                                                  |
|  +----------------------------------------------------------+   |
|  |  [spinner]                                                |   |
|  |                                                           |   |
|  |  Detecting platform...                                    |   |
|  |  Scraping job details...                                  |   |
|  |  Calculating match score...                               |   |
|  |                                                           |   |
|  |  [=====>              ] 35%                               |   |
|  +----------------------------------------------------------+   |
|                                                                  |
+------------------------------------------------------------------+
```

Three-step progress: detect platform, scrape details, calculate match. Each step shows when it completes.

### 16.3 Resume Parsing Loading

```
+------------------------------------------------------------------+
|                                                                  |
|  [document icon with sparkles animation]                         |
|                                                                  |
|  AI is reading your resume...                                    |
|                                                                  |
|  [===>                ] 25%                                      |
|                                                                  |
|  Extracting personal information...                              |
|                                                                  |
+------------------------------------------------------------------+
```

Steps: Extracting personal info, Parsing work experience, Parsing education, Identifying skills. Each step shows as it completes.

### 16.4 Application Queue Loading

When an application is queued but not yet started:

```
+------------------+
| Data Analyst     |
| Airbnb           |
|                  |
| [clock icon]     |
| Queued           |
| Position: 3rd    |
| Est. wait: ~4min |
+------------------+
```

### 16.5 Button Loading States

All action buttons show a spinner inside the button when an action is processing:

| Button               | Loading Text    | Duration |
| -------------------- | --------------- | -------- |
| "Start Application"  | "Starting..."   | 1-3s     |
| "Approve and Submit" | "Submitting..." | 2-5s     |
| "Upload Resume"      | "Uploading..."  | 1-10s    |
| "Save Changes"       | "Saving..."     | 0.5-2s   |
| "Connect LinkedIn"   | "Connecting..." | 2-10s    |

Buttons are disabled during loading to prevent double-submission.

---

## 17. Accessibility Specification

### 17.1 Global Standards

- **WCAG 2.1 Level AA** compliance target.
- All interactive elements have visible focus indicators (2px blue outline).
- Color is never the only means of conveying information (always paired with icons or text).
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text.

### 17.2 Per-Screen Considerations

**Landing Page:**

- All images have alt text.
- CTA buttons have descriptive labels ("Get started with a free account" not just "Start").
- Pricing comparison table uses proper `<th>` scope attributes.
- Animation (count-up stats) has `prefers-reduced-motion` support.

**Onboarding:**

- Progress stepper has ARIA labels: `aria-label="Step 2 of 5: Upload Resume"`.
- File upload zone has keyboard interaction: Enter or Space to open file picker.
- Drag and drop has keyboard alternative (the browse button).
- Form fields have associated `<label>` elements.
- Error messages are announced via `aria-live="assertive"`.

**Dashboard:**

- Active application cards are keyboard navigable with Tab/Shift+Tab.
- Progress bars have `role="progressbar"`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.
- Status updates announced via `aria-live="polite"` region.
- Table rows are selectable with Enter key.
- Stats bar values have screen reader text: "Total applications: 127".

**Application Progress:**

- Live status updates use `aria-live="polite"` so screen readers announce changes without interrupting.
- Field log items are in a list with `role="list"`.
- Screenshot preview has alt text: "Current state of the browser showing the application form".
- Pause/Cancel buttons have clear labels and keyboard shortcuts.

**CAPTCHA Takeover:**

- noVNC viewer has `role="application"` to signal to screen readers that keyboard handling is different.
- Clear text instructions outside the VNC viewer for screen reader users.
- Timeout countdown is announced at 5-minute intervals.
- "Resume Automation" button is keyboard-focusable and clearly labeled.

**Settings:**

- All form inputs have labels.
- Toggle switches have `role="switch"` with `aria-checked`.
- Dropdown menus have `role="listbox"`.
- Destructive actions (Delete All Data) have confirmation dialogs with focus trapped inside.

**Notifications:**

- Notification dropdown is a `role="dialog"` with focus management.
- New notifications are announced via `aria-live`.
- Each notification is a `role="listitem"` that is keyboard navigable.

### 17.3 Keyboard Navigation

| Screen    | Key Shortcuts                                   |
| --------- | ----------------------------------------------- |
| Global    | Ctrl+Shift+N: New Application                   |
| Global    | Ctrl+Shift+D: Go to Dashboard                   |
| Global    | Ctrl+Shift+K: Kill switch (stop all automation) |
| Dashboard | Enter on card: Open application                 |
| Progress  | Escape: Back to dashboard                       |
| CAPTCHA   | Escape: Show "skip?" confirmation               |
| Settings  | Ctrl+S: Save changes                            |

### 17.4 Screen Reader Announcements

| Event                 | Announcement                                                  |
| --------------------- | ------------------------------------------------------------- |
| Application queued    | "Application to [Role] at [Company] has been queued."         |
| Application filling   | "Now filling [Field Name]."                                   |
| Application reviewing | "Application ready for review. [N] fields filled."            |
| CAPTCHA detected      | "Attention: CAPTCHA detected. Human intervention required."   |
| Application complete  | "Application to [Role] at [Company] submitted successfully."  |
| Application failed    | "Alert: Application to [Role] at [Company] failed. [Reason]." |

---

## 18. Mobile Responsiveness Strategy

### 18.1 Breakpoints

| Breakpoint | Width       | Layout Strategy                  |
| ---------- | ----------- | -------------------------------- |
| Mobile S   | < 375px     | Single column, compact           |
| Mobile M   | 375-639px   | Single column, standard          |
| Tablet     | 640-1023px  | Flexible columns                 |
| Desktop    | 1024-1439px | Full layout with sidebar         |
| Desktop L  | 1440px+     | Full layout, max-width container |

### 18.2 Component Behavior by Breakpoint

| Component         | Mobile                          | Tablet             | Desktop            |
| ----------------- | ------------------------------- | ------------------ | ------------------ |
| Navigation        | Hamburger menu                  | Side nav collapsed | Side nav expanded  |
| Stats bar         | 2x2 grid                        | 4 across           | 4 across           |
| Active app cards  | 1 column                        | 2 columns          | 3 columns          |
| Application table | Card layout                     | Scrollable table   | Full table         |
| Progress view     | Stacked (log above preview)     | Side-by-side       | Side-by-side       |
| noVNC viewer      | Full width, landscape suggested | Full width         | 80% width centered |
| Settings          | Accordion sections              | Tabs or sidebar    | Sidebar + content  |
| Extension popup   | N/A                             | N/A                | 360px fixed        |
| Pricing cards     | 1 column, swipeable             | 2x2 grid           | 4 across           |

### 18.3 Touch-Specific Considerations

- All touch targets minimum 44x44px (iOS) / 48x48dp (Android).
- Swipe gestures: Left swipe on application card to reveal "Cancel" action (mobile only).
- Pull-to-refresh on dashboard to reload data.
- No hover-dependent interactions (all hover states have tap equivalents).
- noVNC on mobile: pinch-to-zoom enabled, suggest landscape orientation.

### 18.4 Mobile-First Features

- Push notifications are the primary notification channel on mobile.
- CAPTCHA notifications include a deep link that opens the takeover view directly.
- "Apply with WeKruit" browser extension button works on mobile browsers that support extensions (currently limited to Kiwi Browser on Android; plan for Safari extension on iOS in v2.0).

---

## Appendix A: State Machine Reference

```
                                  User Pastes URL
                                       |
                                       v
                                   [CREATED]
                                       |
                                       v
                                   [QUEUED]
                                       |
                                       v
                                 [INITIALIZING]
                                       |
                                       v
                                  [NAVIGATING]
                                       |
                                       v
                                  [ANALYZING]
                                       |
                                       v
                                   [FILLING]
                                    /     \
                                   /       \
                                  v         v
                           [REVIEWING]   [CAPTCHA] -----> [TIMED_OUT]
                               |             |
                               v             v
                          [SUBMITTING]   [RESUMING]
                               |             |
                               v             v
                           [VERIFYING]   (back to FILLING)
                               |
                              / \
                             /   \
                            v     v
                      [COMPLETED] [FAILED]

         (From any state):
              |
              v
         [CANCELLED] (user-initiated)
```

## Appendix B: Design Token Reference

```
Colors:
  --color-primary:        #1E40AF
  --color-primary-hover:  #1E3A8A
  --color-primary-light:  #DBEAFE
  --color-success:        #059669
  --color-success-light:  #D1FAE5
  --color-warning:        #D97706
  --color-warning-light:  #FEF3C7
  --color-error:          #DC2626
  --color-error-light:    #FEE2E2
  --color-bg:             #F8FAFC
  --color-surface:        #FFFFFF
  --color-text-primary:   #1E293B
  --color-text-secondary: #64748B
  --color-border:         #E2E8F0

Typography:
  --font-heading:         'Inter', system-ui, sans-serif
  --font-body:            system-ui, -apple-system, sans-serif
  --font-mono:            'JetBrains Mono', monospace

  --text-xs:              12px / 16px
  --text-sm:              14px / 20px
  --text-base:            16px / 24px
  --text-lg:              18px / 28px
  --text-xl:              20px / 28px
  --text-2xl:             24px / 32px
  --text-3xl:             30px / 36px
  --text-4xl:             36px / 40px

Spacing:
  --space-1:              4px
  --space-2:              8px
  --space-3:              12px
  --space-4:              16px
  --space-6:              24px
  --space-8:              32px
  --space-12:             48px
  --space-16:             64px

Shadows:
  --shadow-sm:            0 1px 2px rgba(0,0,0,0.05)
  --shadow-md:            0 4px 6px -1px rgba(0,0,0,0.1)
  --shadow-lg:            0 10px 15px -3px rgba(0,0,0,0.1)

Borders:
  --radius-sm:            4px
  --radius-md:            6px
  --radius-lg:            8px
  --radius-xl:            12px
  --radius-full:          9999px

Animation:
  --transition-fast:      150ms ease
  --transition-base:      200ms ease
  --transition-slow:      300ms ease
  --pulse-duration:       1.5s

Z-Index:
  --z-dropdown:           1000
  --z-sticky:             1020
  --z-fixed:              1030
  --z-modal-backdrop:     1040
  --z-modal:              1050
  --z-popover:            1060
  --z-tooltip:            1070
  --z-extension-float:    999999
```

## Appendix C: Notification Decision Matrix

```
+---------------------+--------+------+-------+-------+--------+
| Event               | In-App | Push | Email | Sound | Banner |
+---------------------+--------+------+-------+-------+--------+
| App submitted       |  YES   | YES  | YES   |  no   |   no   |
| App failed          |  YES   | YES  | YES   |  no   |  YES   |
| CAPTCHA detected    |  YES   | YES  | YES   | YES   |  YES   |
| Ready for review    |  YES   | YES  |  no   |  no   |  YES   |
| App queued          |  YES   |  no  |  no   |  no   |   no   |
| Session expired     |  YES   | YES  | YES   |  no   |  YES   |
| Account restricted  |  YES   | YES  | YES   | YES   |  YES   |
| Weekly summary      |   no   |  no  | YES   |  no   |   no   |
| Limit approaching   |  YES   | YES  |  no   |  no   |   no   |
| Limit reached       |  YES   | YES  | YES   |  no   |  YES   |
+---------------------+--------+------+-------+-------+--------+
```

---

_End of UX Design Specification. This document covers all 10 screens, notification systems, empty states, error states, loading states, accessibility, and mobile responsiveness for the WeKruit AutoApply Copilot MVP and v1.1._
