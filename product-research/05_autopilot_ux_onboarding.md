# WeKruit Valet -- Autopilot & Copilot Mode Selection, Onboarding, and Trust UX

**Version:** 1.0
**Date:** 2026-02-11
**Author:** UX/PM Research
**Status:** Design Specification -- Ready for Review
**Depends on:** 01_competitor_ux_analysis.md, 02_user_flows_and_ux_design.md, 03_complete_prd.md

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Strategic Context: Why Two Modes](#2-strategic-context-why-two-modes)
3. [Onboarding Flow (Under 3 Minutes)](#3-onboarding-flow-under-3-minutes)
4. [Mode Selection UX](#4-mode-selection-ux)
5. [Autopilot Dashboard & Runtime UX](#5-autopilot-dashboard--runtime-ux)
6. [Trust-Building Progressive Disclosure](#6-trust-building-progressive-disclosure)
7. [Notification Strategy](#7-notification-strategy)
8. [Edge Cases & Error Handling](#8-edge-cases--error-handling)
9. [Metrics & Measurement](#9-metrics--measurement)
10. [Appendix: Full UI Copy Library](#10-appendix-full-ui-copy-library)

---

## 1. Executive Summary

WeKruit's dual-mode architecture (Copilot + Autopilot) is the product's core differentiator. Every competitor is either fully manual (Simplify, Teal, Huntr) or fully automated with no control (LazyApply, Sonara, Massive). None offer a graduated spectrum of automation where the user chooses their comfort level.

This document specifies:
- An onboarding flow that gets a user from zero to first application in under 3 minutes
- A mode selection UX that makes Copilot vs. Autopilot instantly comprehensible
- An Autopilot runtime experience that maintains trust through transparency
- A progressive disclosure system that earns trust incrementally and moves users toward Autopilot adoption organically

**Design thesis:** Copilot is the gateway drug. Every user starts in Copilot. Autopilot is earned, not given. The transition from Copilot to Autopilot should feel like the user decided to trust us -- not like we pushed them.

---

## 2. Strategic Context: Why Two Modes

### 2.1 The Market Gap

From the competitor analysis (doc 01), the auto-apply market is polarized:

```
                    FULL AUTOMATION
                         |
         LazyApply       |       Massive
         (2.1 stars)     |       (2.3 stars)
         Sonara          |       AutoApplier
                         |
                         |
    =====================+=====================
    NO TRUST                            HIGH TRUST
                         |
                         |
         AIHawk          |       Simplify (4.9 stars)
         (dev only)      |       Teal (4.9 stars)
                         |       Huntr (4.5 stars)
                         |
                    NO AUTOMATION
```

**Nobody occupies the high-automation, high-trust quadrant.** WeKruit's two-mode system is built to own that space. Copilot establishes trust (upper-right, moderate automation). Autopilot delivers on the promise of full automation once trust is established.

### 2.2 Behavioral Insight

User research across competitor review data reveals a consistent pattern:

1. Users **want** full automation ("I wish it could just do everything for me")
2. Users **distrust** full automation ("I can't tell if it actually applied")
3. Users who **see proof** of correct behavior increase their comfort ("After watching it fill 5 apps perfectly, I would trust it to run on its own")

This means: **transparency creates trust, and trust enables automation.** The UX must be designed as a trust escalator.

### 2.3 The Two Modes Defined

| Dimension | Copilot Mode | Autopilot Mode |
|-----------|-------------|----------------|
| **Who submits** | User clicks "Approve & Submit" | System auto-submits |
| **When it pauses** | Before every submission + CAPTCHAs + low-confidence fields | CAPTCHAs only + critical blockers |
| **User involvement** | Active review per application | Post-submission review (batch) |
| **Best for** | First-time users, high-stakes applications, building trust | Volume applications, recurring job searches, power users |
| **Metaphor** | Co-pilot in the cockpit -- you fly, AI assists | Cruise control on the highway -- car drives, you monitor |
| **Visual icon** | Steering wheel | Autopilot gauge needle |
| **Risk level** | Lowest -- you see everything before it goes | Low -- system is proven, but errors are corrected after the fact |

---

## 3. Onboarding Flow (Under 3 Minutes)

### 3.1 Design Philosophy

**Minimum viable onboarding:** What is the absolute least we need before a user can submit their first application?

| Required | Why | Time |
|----------|-----|------|
| Google sign-in | Authentication, email for applications | 15 seconds |
| Resume upload | Source of truth for form filling | 20 seconds |
| Quick review of parsed data | Catch parsing errors before they propagate | 45 seconds |

**Total minimum: ~80 seconds.** Everything else (Q&A bank, LinkedIn connection, mode selection) is progressively disclosed after the magic moment.

**Magic moment:** The user pastes a job URL and watches WeKruit fill out the first 3-4 fields of an application in real time. This is when the user first feels value -- "oh, it actually works."

### 3.2 Revised Onboarding Architecture

The existing 5-step onboarding (doc 02, Section 4) is good but too front-loaded. Users must complete Q&A bank and LinkedIn connection before they ever see the product work. The revised flow moves the magic moment earlier.

```
REVISED FLOW:

Step 1: Google Sign-In                    [15 sec]
   |
Step 2: Resume Upload + Auto-Parse        [20 sec]
   |
Step 3: Quick Review (name, email, phone) [45 sec]
   |
   +--> MAGIC MOMENT: "Paste a URL to try your first application"
   |
Step 4: First Application (Copilot mode)  [90 sec]
   |    AI fills fields, user reviews, user submits.
   |    System learns which screening questions appear.
   |
Step 5: Post-First-App: "Want faster next time?"
   |    Prompt to complete Q&A bank (pre-filled from first app questions)
   |    Prompt to connect LinkedIn (if first app was LinkedIn)
   |
Step 6: Second application onward
        System increasingly suggests Autopilot as confidence builds
```

### 3.3 Step-by-Step Wireframes

#### Step 1: Google Sign-In (15 seconds)

No changes from existing design (doc 02, Section 4.2). Single "Continue with Google" button, trust signals below.

#### Step 2: Resume Upload (20 seconds)

Minor revision: Add a "speed promise" above the upload zone.

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]-------[o]---------[o]                                             |
|  Sign Up   Resume      Quick Review                                   |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|              Upload Your Resume                                        |
|              This is all we need to get started.                       |
|                                                                        |
|   +------------------------------------------------------+            |
|   |                                                      |            |
|   |              [cloud upload icon]                     |            |
|   |                                                      |            |
|   |         Drag and drop your resume here               |            |
|   |         or click to browse                           |            |
|   |                                                      |            |
|   |         PDF or DOCX, max 10MB                        |            |
|   +------------------------------------------------------+            |
|                                                                        |
|   [clock icon] You'll be applying to your first job                   |
|   in about 2 minutes.                                                 |
|                                                                        |
+========================================================================+
```

**Key change:** Only 3 progress dots, not 5. The user sees a shorter tunnel.

#### Step 3: Quick Review (45 seconds)

**Critical revision:** Show only the fields that matter for applications. Do not show the full profile editor during onboarding. Save the detailed review for Settings.

```
+========================================================================+
|                         [WeKruit Logo]                                 |
|                                                                        |
|  [*]-------[*]---------[*]                                             |
|  Sign Up   Resume      Quick Review                                   |
|                                                                        |
+------------------------------------------------------------------------+
|                                                                        |
|          Does this look right?                                         |
|          We'll use this to fill your applications.                     |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  YOUR BASICS                                                      | |
|  |                                                                   | |
|  |  Name       [Adam Smith           ]                               | |
|  |  Email      [adam@gmail.com       ]  (from Google)                | |
|  |  Phone      [+1 555-123-4567     ]                                | |
|  |  Location   [San Francisco, CA   ]                                | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |  YOUR EXPERIENCE  (parsed from resume)           [Edit details]  | |
|  |                                                                   | |
|  |  Senior Software Engineer at Acme Corp (2022 - Present)          | |
|  |  Software Engineer at StartupXYZ (2019 - 2021)                   | |
|  |                                                                   | |
|  |  B.S. Computer Science, MIT (2019)                                | |
|  |                                                                   | |
|  |  Skills: Python, TypeScript, React, AWS, Docker + 4 more         | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|        Everything else can be fine-tuned later in Settings.           |
|                                                                        |
|                          [Looks Good -- Let's Go]                     |
|                                                                        |
+========================================================================+
```

**Key differences from existing design (doc 02, Section 4.4):**
- **Collapsed experience section.** No expand/edit inline. Just verify it parsed correctly at a glance.
- **"Edit details" link** goes to a modal or defers to Settings, not inline editing.
- **Removed:** Work authorization, visa, salary, relocation fields. These belong in the Q&A bank, prompted after the first application when the user has context for why they matter.
- **Removed:** Additional info section entirely. Moved to post-first-app Q&A prompt.
- **Single CTA:** "Looks Good -- Let's Go" (not "Looks Good, Continue" -- the language implies arrival, not continuation).

#### Step 4: Magic Moment -- First Application

Immediately after "Looks Good -- Let's Go," the user lands on the dashboard in a "first-time" state:

```
+========================================================================+
| [Logo] WeKruit                                          [Avatar v]     |
+========================================================================+
|                                                                        |
|  +------------------------------------------------------------------+ |
|  |                                                                  | |
|  |     [sparkle icon]  Ready to apply to your first job!           | |
|  |                                                                  | |
|  |     Paste a job URL below. We'll fill the application           | |
|  |     and show you every field before submitting.                 | |
|  |                                                                  | |
|  |  +------------------------------------------------------------+ | |
|  |  |  [paste icon]  Paste a job URL here...                     | | |
|  |  +------------------------------------------------------------+ | |
|  |                                                                  | |
|  |     [lightning icon] Your first application is in               | |
|  |     Copilot mode -- you review everything before submit.        | |
|  |                                                                  | |
|  +------------------------------------------------------------------+ |
|                                                                        |
|  Try one of these to see how it works:                                |
|  [LinkedIn Easy Apply]  [Greenhouse]  [Lever]                        |
|  (links to sample job postings for each platform)                    |
|                                                                        |
+========================================================================+
```

**Why sample jobs?** If the user does not have a URL ready, we provide curated sample job postings (real, active postings on supported platforms) so they can immediately experience the product without leaving the page to go find a job first. This eliminates the cold-start problem.

### 3.4 Pre-Filling Q&A Bank from Resume Parsing

The existing Q&A bank onboarding step (doc 02, Section 4.5) asks 20+ questions before the user has ever seen the product work. This is high-friction and low-context. The revised approach:

**Phase 1: During resume parsing** (automatic, no user action)
The LLM that parses the resume also extracts answers to common screening questions:

| Question | Extracted Answer | Source |
|----------|-----------------|--------|
| Years of relevant experience | 7 | Resume work history dates |
| Highest education level | Bachelor's | Resume education section |
| Work authorization | (not found) | -- |
| Willing to relocate | (not found) | -- |
| Expected salary | (not found) | -- |

These are stored silently in the Q&A bank with a "resume-inferred" source tag and medium confidence.

**Phase 2: After first application** (prompted, contextual)
After the first Copilot application completes, the system knows which screening questions appeared. It presents a focused prompt:

```
+------------------------------------------------------------------+
|                                                                    |
|  [lightbulb icon]  Save time on your next application             |
|                                                                    |
|  During your first app, we asked you 3 screening questions.       |
|  Save your answers so we can fill them automatically next time:   |
|                                                                    |
|  "Are you authorized to work in the US?"                          |
|  Your answer: [Yes]                               [Save]          |
|                                                                    |
|  "Do you require visa sponsorship?"                               |
|  Your answer: [No]                                [Save]          |
|                                                                    |
|  "What is your expected salary range?"                            |
|  Your answer: [$______ - $______]                 [Save]          |
|                                                                    |
|  [Save All]                          [Skip -- I'll do this later] |
|                                                                    |
+------------------------------------------------------------------+
```

**Phase 3: Progressive accumulation** (ongoing)
Every time a new question appears that is not in the Q&A bank, the system adds it as a "suggested" entry after the application. Over 5-10 applications, the Q&A bank fills itself through actual usage, not upfront guessing.

### 3.5 Onboarding Timing Budget

| Step | Target Time | Mechanism |
|------|-------------|-----------|
| Google Sign-In | 15 sec | Single click + OAuth popup |
| Resume Upload | 20 sec | Drag-and-drop or click |
| Resume Parsing | 5 sec | Server-side, shown as loading animation |
| Quick Review | 45 sec | Scan and verify, single CTA |
| **Total to Dashboard** | **~85 sec** | |
| First Application (Copilot) | 90 sec | Paste URL, watch fill, review, submit |
| **Total to Magic Moment** | **~3 min** | |

---

## 4. Mode Selection UX

### 4.1 When Does Mode Selection Happen?

**Not during onboarding.** Every user starts in Copilot mode. Mode selection is introduced after trust is established.

**Trust gate:** Autopilot unlocks after the user has completed **3 successful Copilot applications** with no critical overrides. This is not punitive -- it is protective. The reasoning:

1. After 3 apps, the Q&A bank has real data (not guesses)
2. After 3 apps, the user has seen the system work correctly
3. After 3 apps, the system has learned the user's override patterns
4. 3 is low enough to not feel like a grind, high enough to build real confidence

**The unlock moment:**

```
+------------------------------------------------------------------+
|                                                                    |
|  [rocket icon]  Autopilot Mode Unlocked!                          |
|                                                                    |
|  You've completed 3 applications with 96% average confidence      |
|  and zero critical errors. You've earned Autopilot mode.          |
|                                                                    |
|  In Autopilot, the AI fills AND submits automatically.            |
|  It only pauses for CAPTCHAs and critical blockers.               |
|  You get a summary after each submission.                         |
|                                                                    |
|  +-----------------------------+  +----------------------------+  |
|  |  [steering wheel icon]      |  |  [gauge icon]              |  |
|  |                             |  |                            |  |
|  |  COPILOT                    |  |  AUTOPILOT                 |  |
|  |  You review every app       |  |  AI submits, you review    |  |
|  |  before it goes out.        |  |  the summary after.        |  |
|  |                             |  |                            |  |
|  |  Best for:                  |  |  Best for:                 |  |
|  |  - Important roles          |  |  - Volume applying         |  |
|  |  - New job types            |  |  - Familiar job boards     |  |
|  |  - Maximum control          |  |  - Maximum speed           |  |
|  |                             |  |                            |  |
|  |  [Keep Using Copilot]       |  |  [Try Autopilot]           |  |
|  +-----------------------------+  +----------------------------+  |
|                                                                    |
|  You can switch between modes anytime, even per-application.      |
|                                                                    |
+------------------------------------------------------------------+
```

### 4.2 Visual Metaphors

The two modes use consistent visual language throughout the product:

| Element | Copilot | Autopilot |
|---------|---------|-----------|
| **Icon** | Steering wheel (you are driving) | Gauge needle at "auto" (cruise control) |
| **Color accent** | Blue (#1E40AF) -- the existing primary | Purple (#7C3AED) -- distinct but premium-feeling |
| **Badge shape** | Rounded rectangle, outlined | Rounded rectangle, filled |
| **Animation** | Steady pulse (heartbeat of human review) | Smooth continuous sweep (constant forward motion) |
| **Tooltip** | "Copilot: You review before submit" | "Autopilot: AI submits, you review after" |

### 4.3 Mode Selection Surfaces

Mode can be set at three levels, with clear hierarchy:

**Level 1: Global default** (Settings > Automation Preferences)

```
+------------------------------------------------------------------+
|  AUTOMATION MODE                                                   |
|                                                                    |
|  +----------------------------+  +-----------------------------+  |
|  | [steering wheel]           |  | [gauge]                     |  |
|  | COPILOT (selected)         |  | AUTOPILOT                   |  |
|  |                            |  |                             |  |
|  | AI fills, you review       |  | AI fills AND submits        |  |
|  | and submit.                |  | automatically. Only pauses  |  |
|  |                            |  | for CAPTCHAs.              |  |
|  +----------------------------+  +-----------------------------+  |
|                                                                    |
|  This sets your default. You can override per-application.        |
|                                                                    |
|  AUTOPILOT SETTINGS (visible when Autopilot is selected)          |
|  Confidence threshold: [======>     ] 85%                          |
|  Auto-submit only when ALL fields are above this confidence.      |
|  Below this threshold, the system pauses for your review.         |
|                                                                    |
|  Consecutive failure limit: [__3__]                                |
|  If this many applications fail in a row, pause all Autopilot     |
|  applications and notify you.                                     |
|                                                                    |
+------------------------------------------------------------------+
```

**Level 2: Per-application override** (New Application flow, Step 2)

When starting a new application, the mode toggle appears in the "Settings for this application" section:

```
+------------------------------------------------------------------+
|  MODE FOR THIS APPLICATION                                         |
|                                                                    |
|  [steering wheel] Copilot  <--toggle-->  Autopilot [gauge]        |
|                                                                    |
|  Currently: Copilot (your global default)                         |
|  [switch icon] Switch to Autopilot for this application           |
+------------------------------------------------------------------+
```

**Level 3: Batch mode override** (Bulk URL submission, v1.1+)

When submitting multiple URLs, the user can set mode for the entire batch or per-URL:

```
+------------------------------------------------------------------+
|  BATCH MODE                                                        |
|                                                                    |
|  Apply all 8 jobs in: [Copilot v] / [Autopilot v] / [Mixed v]    |
|                                                                    |
|  (When "Mixed": each row shows a mode toggle)                    |
|                                                                    |
|  URL                              Mode         Action              |
|  linkedin.com/jobs/view/123...    [Copilot v]  [Remove]           |
|  linkedin.com/jobs/view/456...    [Autopilot v] [Remove]          |
|  greenhouse.io/boards/acme/j...   [Copilot v]  [Remove]           |
+------------------------------------------------------------------+
```

### 4.4 The Risk/Control Tradeoff Communication

The mode selection UI must make the tradeoff instantly clear without being scary. The language avoids words like "risk" or "danger" and instead frames it as a control spectrum:

```
+------------------------------------------------------------------+
|                                                                    |
|  CONTROL SPECTRUM                                                  |
|                                                                    |
|  More control                              More speed              |
|  [=======|==========]                                              |
|       Copilot    Autopilot                                        |
|                                                                    |
|  Copilot:    You see every field before submit.                   |
|              Average: 2 min 30 sec per app.                       |
|              Requires your attention per app.                     |
|                                                                    |
|  Autopilot:  AI submits when confident.                           |
|              Average: 1 min 15 sec per app.                       |
|              Review summaries after the fact.                     |
|              Pauses if confidence drops below 85%.                |
|                                                                    |
+------------------------------------------------------------------+
```

**Key copy principles:**
- Never say "risk." Say "control."
- Never say "automatic." Say "confident enough to proceed."
- Always mention the confidence threshold as a safety net.
- Always mention that Autopilot still pauses for CAPTCHAs.
- Frame Autopilot as "you trained it well enough to trust it" -- the user gets credit.

---

## 5. Autopilot Dashboard & Runtime UX

### 5.1 Dashboard When 10 Applications Are Running in Autopilot

The existing dashboard (doc 02, Section 5) shows active applications as individual cards with progress bars. This works for 1-3 Copilot apps. For 10 Autopilot apps, individual cards create visual chaos. The Autopilot dashboard uses a **batch progress view**.

```
+========================================================================+
| [Logo] WeKruit                              [Pause All] [Avatar v]     |
+========================================================================+
|                                                                        |
|  +----+                                                                |
|  | D  |  +------------------------------------------------------------+|
|  | a  |  |  AUTOPILOT BATCH                    [gauge icon] Running   ||
|  | s  |  |                                                            ||
|  | h  |  |  10 applications   7 submitted   2 in progress   1 queued ||
|  | b  |  |                                                            ||
|  | o  |  |  [=============================>          ] 70%            ||
|  | a  |  |                                                            ||
|  | r  |  |  Estimated completion: ~4 minutes                          ||
|  | d  |  +------------------------------------------------------------+|
|  |    |                                                                |
|  |    |  +------------------------------------------------------------+|
|  |    |  |  LIVE FEED                                   [Compact v]   ||
|  |    |  |                                                            ||
|  |    |  |  2:34 PM  [green] Senior SWE at Stripe      Submitted     ||
|  |    |  |           94% confidence | 1m 42s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  2:33 PM  [green] PM at Notion              Submitted     ||
|  |    |  |           97% confidence | 1m 18s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  2:32 PM  [green] Data Eng at Airbnb        Submitted     ||
|  |    |  |           91% confidence | 2m 01s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  2:31 PM  [green] SRE at Netflix            Submitted     ||
|  |    |  |           96% confidence | 1m 22s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  2:31 PM  [green] Backend at Google         Submitted     ||
|  |    |  |           89% confidence | 1m 55s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  2:30 PM  [green] Frontend at Meta          Submitted     ||
|  |    |  |           93% confidence | 1m 34s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  2:30 PM  [green] ML Eng at OpenAI          Submitted     ||
|  |    |  |           88% confidence | 2m 12s | [View Summary]        ||
|  |    |  |                                                            ||
|  |    |  |  NOW      [blue]  Full Stack at Figma       Filling...    ||
|  |    |  |           Step 4/8 | 45 sec elapsed                       ||
|  |    |  |                                                            ||
|  |    |  |  NOW      [blue]  DevOps at Datadog         Navigating... ||
|  |    |  |           Step 3/8 | 22 sec elapsed                       ||
|  |    |  |                                                            ||
|  |    |  |  NEXT     [gray]  Platform Eng at Vercel    Queued (1st)  ||
|  |    |  |                                                            ||
|  |    |  +------------------------------------------------------------+|
|  |    |                                                                |
|  |    |  +------------------------------------------------------------+|
|  |    |  |  BATCH STATS                                               ||
|  |    |  |                                                            ||
|  |    |  |  Avg confidence: 93%  |  Avg time: 1m 41s  |  Errors: 0  ||
|  |    |  |  Q&A bank hits: 34/38 (89%)  |  AI-generated: 4          ||
|  |    |  +------------------------------------------------------------+|
|  +----+                                                                |
+========================================================================+
```

**Key design decisions:**

1. **Batch progress bar at top.** The user sees one holistic progress indicator, not 10 individual cards. This reduces cognitive load.
2. **Live feed replaces card grid.** Chronological feed shows each application as a single row. Completed apps show summary stats inline. Active apps show current step.
3. **Compact mode toggle.** "Compact" shows one line per app. "Expanded" shows card-style with more detail.
4. **"Pause All" button in the header.** This is the emergency brake. One click pauses everything.
5. **Batch stats footer.** Aggregate metrics reinforce that the system is working well.

### 5.2 Post-Submission Summary (Autopilot)

In Copilot mode, the user reviews before submission. In Autopilot, the review happens after. The post-submission summary must provide the same level of transparency retroactively.

**Inline summary (accessed via "View Summary" in the live feed):**

```
+------------------------------------------------------------------+
|  APPLICATION SUMMARY                                  [Close X]   |
|                                                                    |
|  Senior Software Engineer at Stripe                               |
|  Submitted: Feb 11, 2026 at 2:34 PM | Duration: 1m 42s           |
|                                                                    |
|  CONFIDENCE: 94% overall                                          |
|  [============================================>    ] 94%          |
|                                                                    |
|  FIELDS FILLED (7 of 7)                                           |
|                                                                    |
|  [green] First Name       Adam               Resume    99%       |
|  [green] Last Name        Smith              Resume    99%       |
|  [green] Email            adam@gmail.com     Google    99%       |
|  [green] Phone            +1 555-123-4567   Resume    95%       |
|  [green] Resume           resume_v3.pdf     Upload    99%       |
|  [green] Work Auth        Yes               Q&A Bank  99%       |
|  [amber] Years of Exp.    5-7 years         AI        82%       |
|                                                                    |
|  SCREENING QUESTIONS                                              |
|                                                                    |
|  Q: "Why are you interested in this role?"                        |
|  A: "I'm drawn to Stripe's mission of increasing the GDP of      |
|      the internet. My 7 years of backend experience with          |
|      payment systems at Acme Corp directly aligns with..."        |
|  Source: AI-generated | Confidence: 78%                           |
|  [View full answer]                                               |
|                                                                    |
|  SCREENSHOTS                                                      |
|  [Thumbnail: completed form] [Thumbnail: confirmation page]      |
|  [View full size]            [View full size]                     |
|                                                                    |
|  ACTIONS                                                          |
|  [View on LinkedIn]  [Report Issue]  [Add to Q&A Bank]           |
|                                                                    |
+------------------------------------------------------------------+
```

**Key elements:**
- **Field-by-field breakdown** identical to Copilot review screen, but shown after the fact.
- **Source column** (Resume, Google, Q&A Bank, AI, User Override) builds trust by showing WHERE each answer came from.
- **Screenshot proof** -- thumbnails of the completed form and confirmation page, same as Copilot mode.
- **"Report Issue" button** -- if the user spots an error in the summary, they can flag it. This trains the system and adjusts future confidence thresholds.
- **"Add to Q&A Bank" button** -- for AI-generated answers the user likes, one click saves them to the Q&A bank for future reuse.

### 5.3 Pause All / Emergency Brake

**Location:** Persistent in the top navigation bar when any Autopilot application is running.

```
+========================================================================+
| [Logo] WeKruit          [Autopilot: 3 running]  [Pause All]  [Avatar] |
+========================================================================+
```

**"Pause All" behavior:**
1. Click "Pause All"
2. Confirmation: "Pause all 3 running Autopilot applications? Applications in progress will pause at the next safe checkpoint (between form fields). No data will be lost."
3. User confirms
4. All running applications pause. Status changes to "Paused by user."
5. Button changes to "Resume All" with count: "Resume All (3 paused)"
6. Each paused application can also be individually resumed or cancelled.

**"Pause All" does NOT:**
- Cancel any application (data is preserved)
- Close any browser sessions (they stay open, just idle)
- Affect Copilot-mode applications (those are already user-driven)

### 5.4 Switching from Autopilot to Copilot Mid-Application

If a user pauses an Autopilot application and wants to take over:

```
+------------------------------------------------------------------+
|  PAUSED: Full Stack Engineer at Figma                             |
|                                                                    |
|  Paused at step 4/8 (Filling fields). 3 of 7 fields completed.  |
|                                                                    |
|  [Resume in Autopilot]  [Switch to Copilot]  [Cancel Application] |
+------------------------------------------------------------------+
```

Clicking "Switch to Copilot" changes the mode for this single application. The system will now pause before submitting for user review, even though the global default is Autopilot.

### 5.5 Confidence Threshold UI

The confidence threshold is the key safety lever for Autopilot. It determines when the system auto-submits vs. pauses for human review.

**Settings view:**

```
+------------------------------------------------------------------+
|  AUTOPILOT CONFIDENCE THRESHOLD                                    |
|                                                                    |
|  Auto-submit when ALL fields are above:                           |
|                                                                    |
|  [==========|=========>         ] 85%                              |
|   70%    80%   85%   90%   95%  100%                              |
|                                                                    |
|  What this means:                                                 |
|  - At 85%: ~90% of your applications will auto-submit.            |
|    The other ~10% will pause for your review.                     |
|  - Lower = more auto-submits, less control                        |
|  - Higher = fewer auto-submits, more control                      |
|                                                                    |
|  Based on your last 20 applications:                              |
|  At 85%: 18 would have auto-submitted, 2 would have paused       |
|  At 90%: 15 would have auto-submitted, 5 would have paused       |
|  At 95%: 8 would have auto-submitted, 12 would have paused       |
|                                                                    |
|  Recommended: 85% (balances speed and accuracy)                   |
|                                                                    |
+------------------------------------------------------------------+
```

**Key design decisions:**
- **Slider, not text input.** Prevents invalid values and provides immediate visual feedback.
- **Minimum: 70%.** Below this, the system cannot meaningfully guarantee quality.
- **"Based on your last 20 applications" section.** This is a personalized, data-driven recommendation. It uses the user's own history to show what WOULD have happened at different thresholds. This builds trust in the threshold by grounding it in real data.
- **No "0% threshold" option.** Unlike the existing "Always auto-submit" option (doc 02, Section 10.5), we do not allow disabling the confidence check entirely. The minimum is 70%.

### 5.6 Per-Application Confidence Breakdown (Autopilot)

When an Autopilot application pauses because one or more fields fell below the threshold, the user sees:

```
+------------------------------------------------------------------+
|  [gauge icon] AUTOPILOT PAUSED                                    |
|                                                                    |
|  Full Stack Engineer at Figma                                     |
|                                                                    |
|  1 field needs your attention.                                    |
|  All other fields were filled with high confidence.               |
|                                                                    |
|  +--------------------------------------------------------------+ |
|  |  [amber] "Describe a time you led a cross-functional team"   | |
|  |                                                               | |
|  |  AI's answer:                                                 | |
|  |  "At Acme Corp, I led a cross-functional team of 5           | |
|  |   engineers and 2 designers to deliver a payment              | |
|  |   processing feature that reduced checkout time by 40%..."    | |
|  |                                                               | |
|  |  Confidence: 72% (below your 85% threshold)                  | |
|  |  Why low: This question is not in your Q&A bank, and the     | |
|  |  AI generated the answer from resume context alone.           | |
|  |                                                               | |
|  |  [Approve this answer]  [Edit answer]  [Skip question]       | |
|  |                                                               | |
|  |  [ ] Save to Q&A bank for future use                         | |
|  +--------------------------------------------------------------+ |
|                                                                    |
|  After approving, this application will auto-submit.              |
|                                                                    |
+------------------------------------------------------------------+
```

**"Save to Q&A bank" checkbox** is the progressive disclosure mechanism. Each time the user approves an answer and saves it, the Q&A bank grows, and future applications have higher confidence -- which means fewer pauses, which means more auto-submits, which means Autopilot gets smoother over time. The system literally trains itself through usage.

---

## 6. Trust-Building Progressive Disclosure

### 6.1 The Trust Escalator

Trust is built incrementally through a defined sequence of transparency features. Each feature demonstrates competence at the current level and unlocks the next level of automation.

```
TRUST ESCALATOR

Level 0: Onboarding
  |  User uploads resume, sees parsed data
  |  Trust signal: "It understood my resume correctly"
  |
Level 1: First Copilot Application (App 1)
  |  User watches AI fill fields in real time
  |  User reviews every field before submit
  |  User sees confirmation screenshot
  |  Trust signal: "It filled the form correctly"
  |
Level 2: Learning Phase (Apps 2-3)
  |  Q&A bank grows from real questions
  |  Confidence scores consistently high
  |  Zero or few overrides needed
  |  Trust signal: "It gets my answers right"
  |
Level 3: Autopilot Unlock (After App 3)
  |  User presented with mode choice
  |  System shows stats: "94% avg confidence, 0 errors"
  |  Trust signal: "I've seen enough to let it run"
  |
Level 4: First Autopilot Application (App 4+)
  |  User sees post-submission summary
  |  Screenshot proof of correct submission
  |  Trust signal: "It submitted correctly without me"
  |
Level 5: Autopilot Batch (App 10+)
  |  User submits 5-10 URLs at once
  |  Batch progress dashboard
  |  Digest notifications
  |  Trust signal: "It can handle volume reliably"
  |
Level 6: Confidence Threshold Lowering (App 20+)
  |  System suggests: "Based on your history, you could
  |  lower your threshold to 80% with minimal risk"
  |  User adjusts slider
  |  Trust signal: "I barely need to intervene anymore"
```

### 6.2 Transparency Features That Build Toward Autopilot

Each of these features is available from day one in Copilot mode. They exist to build the trust that makes Autopilot feel safe.

#### 6.2.1 Screenshot Proof

**What:** Before-and-after screenshots of every application (form completed + confirmation page).

**How it builds trust:** The user can verify that the AI filled the form correctly by comparing the screenshot to what they expected. After seeing 3-5 correct screenshots, the user trusts that the AI knows what it is doing.

**Autopilot connection:** In Autopilot mode, screenshots become the primary verification mechanism. The user reviews screenshots after submission rather than reviewing fields before.

**UI in Copilot mode:**
```
After submission: "Here's proof your application was submitted."
[Screenshot: Completed form]  [Screenshot: Confirmation page]
```

**UI in Autopilot mode (batch digest):**
```
"5 applications submitted. Here are your proofs."
[Grid of 5 confirmation screenshots, click to expand]
```

#### 6.2.2 Confidence Scores

**What:** Per-field percentage showing how certain the AI is about each answer.

**How it builds trust:** By showing the AI's uncertainty, we demonstrate honesty. A system that says "I'm 100% confident on everything" is less trustworthy than one that says "I'm 99% on your name, 82% on years of experience, and 72% on this open-ended question."

**Autopilot connection:** Confidence scores become the gating mechanism for Autopilot. The user sets a threshold, and the scores determine whether auto-submit happens. This gives the user a tangible lever of control.

**Progressive behavior:**
- Apps 1-3 (Copilot): Scores shown per-field in the review screen. User learns what high/medium/low confidence means.
- Apps 4-10 (Early Autopilot): Scores appear in post-submission summaries. User sees that high-confidence fields were filled correctly.
- Apps 10+ (Mature Autopilot): Aggregate confidence scores in batch digest. User trusts the threshold and stops checking individual fields.

#### 6.2.3 Q&A Bank Growth

**What:** A growing database of the user's answers to screening questions, built from actual applications.

**How it builds trust:** Every application makes the Q&A bank smarter. The user sees questions move from "AI-guessed (72%)" to "From Q&A bank (99%)" as they save answers. This creates a visible flywheel.

**Autopilot connection:** A well-populated Q&A bank is the prerequisite for high Autopilot confidence scores. The system can explicitly show this:

```
"Your Q&A bank covers 89% of common screening questions.
With 4 more answers, you could reach 95% coverage,
which means fewer Autopilot pauses."
```

#### 6.2.4 Application Audit Trail

**What:** A complete record of every field filled, every value used, every source, and every decision the AI made.

**How it builds trust:** The user can retroactively verify any application. This is the "black box recorder" that competitors lack (the #1 complaint from doc 01: "I can't tell if my applications were actually submitted").

**Autopilot connection:** The audit trail is the safety net that makes Autopilot psychologically acceptable. "Even if I'm not watching live, I can always go back and check."

### 6.3 Trust Nudges (System-Initiated Prompts)

At strategic moments, the system nudges the user toward greater automation:

**After 3 Copilot apps with high confidence:**
```
"You've had 3 flawless applications with 94% average confidence.
Ready to try Autopilot? [Try Autopilot] [Not yet]"
```

**After 5 Autopilot apps with zero issues:**
```
"Your Autopilot applications are running smoothly.
You could lower your confidence threshold from 90% to 85%
and auto-submit ~15% more applications. [Adjust] [Keep at 90%]"
```

**After user manually reviews an Autopilot-paused field and approves the AI's answer unchanged:**
```
"The AI got it right! Save this answer to your Q&A bank
so Autopilot doesn't need to pause for this question next time.
[Save to Q&A Bank] [Dismiss]"
```

**After 10 apps with no overrides needed:**
```
"You haven't needed to override anything in your last 10
applications. Your profile and Q&A bank are well-trained.
Consider batch-applying to save even more time. [Try Batch Apply]"
```

---

## 7. Notification Strategy

### 7.1 Copilot vs. Autopilot Notification Differences

| Event | Copilot Notification | Autopilot Notification |
|-------|---------------------|----------------------|
| Application ready for review | **Immediate push + in-app** (blocking -- app waits for user) | N/A (no pre-submit review) |
| CAPTCHA detected | **Immediate push + in-app + email** (blocking -- app waits for user) | **Same** (blocking in both modes) |
| Application submitted | In-app toast | **Batched** (see below) |
| Application failed | Immediate push + in-app | **Immediate push + in-app** (failure always gets real-time alert) |
| Low-confidence field | **Immediate push** (blocking in Copilot) | **Immediate push if below threshold** (blocking until resolved) |
| Batch complete | N/A | **Single digest notification** (see below) |

### 7.2 Autopilot Batch Digest

When multiple Autopilot applications complete, they are grouped into a single notification rather than individual alerts:

**Push notification:**
```
WeKruit: 5 applications submitted
Stripe, Notion, Airbnb, Netflix, Google
Average confidence: 93% | All successful
[View Summary]
```

**Email digest (if enabled):**
```
Subject: 5 applications submitted via Autopilot

Hi Adam,

Your Autopilot batch completed. Here's the summary:

| # | Role                  | Company  | Confidence | Status    |
|---|-----------------------|----------|------------|-----------|
| 1 | Senior SWE            | Stripe   | 94%        | Submitted |
| 2 | Product Manager       | Notion   | 97%        | Submitted |
| 3 | Data Engineer         | Airbnb   | 91%        | Submitted |
| 4 | SRE                   | Netflix  | 96%        | Submitted |
| 5 | Backend Engineer      | Google   | 89%        | Submitted |

Average confidence: 93%
Total time: 8 min 32 sec
Q&A bank hit rate: 89%

[View Full Details in Dashboard]

Proof screenshots are available in your dashboard.
```

### 7.3 Notification Frequency Settings (Autopilot-Specific)

```
+------------------------------------------------------------------+
|  AUTOPILOT NOTIFICATIONS                                           |
|                                                                    |
|  When applications are submitted:                                 |
|  ( ) Real-time (one notification per app)                         |
|  (*) Batch digest (one notification per batch)                    |
|  ( ) Hourly digest                                                |
|  ( ) Daily digest                                                 |
|                                                                    |
|  Always notify immediately for:                                   |
|  [x] CAPTCHAs and blockers (cannot be disabled)                  |
|  [x] Application failures                                         |
|  [x] Low-confidence pauses                                        |
|  [ ] Session expirations                                          |
+------------------------------------------------------------------+
```

**Design principle:** Autopilot success notifications can be batched (they are informational). Autopilot failure/blocker notifications are always real-time (they are actionable).

---

## 8. Edge Cases & Error Handling

### 8.1 User Switches from Autopilot to Copilot Mid-Batch

**Scenario:** User starts a batch of 10 applications in Autopilot. After 4 are submitted, user decides to switch to Copilot for the remaining 6.

**Behavior:**
1. User clicks "Pause All" or navigates to batch settings.
2. User changes mode to "Copilot" for the batch.
3. System behavior changes for remaining applications:
   - Currently running applications (in-progress): Continue to current safe checkpoint, then pause for review before submitting.
   - Queued applications: Mode flag updated to Copilot. Will pause for review when they reach submission step.
   - Already submitted applications: Not affected. Summaries remain in Autopilot format.
4. Dashboard updates: Cards for remaining applications show Copilot icon instead of Autopilot icon.

**UI during transition:**

```
+------------------------------------------------------------------+
|  [info] Mode changed to Copilot for 6 remaining applications.    |
|  2 applications in progress will pause at the next checkpoint.    |
|  4 already-submitted applications are not affected.               |
|                                                 [Undo] [Dismiss]  |
+------------------------------------------------------------------+
```

### 8.2 Autopilot Hits 3 Consecutive Failures

**Scenario:** Three applications fail in a row (form validation error, session expiry, etc.).

**Behavior:**

1. After failure #1: Normal failure notification. Application marked as failed in the feed.
2. After failure #2: Elevated notification. System adds a warning: "2 consecutive failures. Monitoring closely."
3. After failure #3: **Auto-pause triggered.** All running Autopilot applications pause. System sends an urgent notification.

**Urgent notification:**

```
+------------------------------------------------------------------+
|  [!] AUTOPILOT AUTO-PAUSED                                        |
|                                                                    |
|  3 consecutive applications failed. All Autopilot applications    |
|  have been paused to prevent further issues.                      |
|                                                                    |
|  Failures:                                                        |
|  1. Backend Eng at Apple -- "Form validation error"               |
|  2. SRE at Uber -- "LinkedIn session expired"                     |
|  3. ML Eng at Anthropic -- "LinkedIn session expired"             |
|                                                                    |
|  Likely cause: Your LinkedIn session expired.                     |
|  Recommended action: Reconnect LinkedIn in Settings.              |
|                                                                    |
|  [Reconnect LinkedIn]  [Review Failures]  [Resume Autopilot]     |
+------------------------------------------------------------------+
```

**Intelligence layer:** The system analyzes the failure reasons and attempts to diagnose a root cause. If all 3 failures have the same reason (e.g., session expired), it provides a specific recommendation. If failures are different, it shows a generic "Please review the failure details."

**Post-fix behavior:** After the user fixes the issue (e.g., reconnects LinkedIn), they must explicitly click "Resume Autopilot." The system does not auto-resume after a 3-failure pause.

### 8.3 User Tries Autopilot Without Q&A Bank

**Scenario:** User completed onboarding (3 Copilot apps) but has a sparse Q&A bank (fewer than 5 answers saved).

**Behavior:** Autopilot is unlocked (trust gate passed) but the system warns about expected pause frequency:

```
+------------------------------------------------------------------+
|  [info] Heads up: Autopilot may pause frequently                  |
|                                                                    |
|  Your Q&A bank has only 3 saved answers. This means the AI       |
|  will need to generate answers for most screening questions,      |
|  which often results in lower confidence scores.                  |
|                                                                    |
|  With your current Q&A bank, we estimate:                         |
|  - ~40% of applications will auto-submit                          |
|  - ~60% will pause for your review                                |
|                                                                    |
|  To get more auto-submits, add answers to your Q&A bank:         |
|  [Complete Q&A Bank] (takes ~2 minutes)                           |
|                                                                    |
|  Or proceed -- you'll be prompted to save answers as you go.      |
|  [Continue with Autopilot Anyway]                                 |
+------------------------------------------------------------------+
```

**This is a soft gate, not a hard block.** The user can proceed, but they are informed that the experience will be suboptimal. This respects user autonomy while guiding them toward the better path.

### 8.4 First-Time User Tries to Go Straight to Autopilot

**Scenario:** User has completed onboarding but has zero completed applications. They try to enable Autopilot in settings.

**Behavior:** Hard block with clear explanation.

```
+------------------------------------------------------------------+
|  [lock icon] Autopilot Mode -- Locked                             |
|                                                                    |
|  Complete 3 applications in Copilot mode to unlock Autopilot.    |
|                                                                    |
|  Why?                                                             |
|  Autopilot works best after the system has learned from your      |
|  real applications. In Copilot mode, you:                         |
|  - Train the Q&A bank with your actual answers                    |
|  - Verify that the AI fills forms correctly for YOUR profile      |
|  - Build a confidence baseline we use for auto-submit decisions   |
|                                                                    |
|  Your progress: 0 of 3 applications completed                    |
|  [========>                                     ] 0%              |
|                                                                    |
|  [Start Your First Application]                                   |
+------------------------------------------------------------------+
```

**Copy tone:** Not punitive ("you can't use this yet") but protective ("we want to make sure it works great for you"). The lock is framed as the system learning, not the user being restricted.

### 8.5 Autopilot Application Encounters Unknown ATS Form

**Scenario:** Autopilot is running on a Greenhouse job that has a custom form field the AI has never seen (e.g., "Upload a portfolio case study PDF").

**Behavior:** System pauses and escalates to the user, regardless of global confidence threshold.

```
+------------------------------------------------------------------+
|  [gauge icon] AUTOPILOT PAUSED -- Unknown Field                   |
|                                                                    |
|  Design Lead at Figma (Greenhouse)                                |
|                                                                    |
|  The AI encountered a field it hasn't seen before:                |
|                                                                    |
|  "Upload a portfolio case study (PDF, max 5MB)"                  |
|                                                                    |
|  This requires a file upload that isn't in your profile.          |
|                                                                    |
|  [Open Browser to Upload File]  [Skip This Field]  [Cancel App]  |
|                                                                    |
|  This field will be added to your Q&A bank as a known type       |
|  after you resolve it.                                            |
+------------------------------------------------------------------+
```

### 8.6 User Revokes LinkedIn Connection While Autopilot Batch Is Running

**Scenario:** User goes to Settings > Connected Accounts and clicks "Disconnect" on LinkedIn while 3 Autopilot applications targeting LinkedIn are in progress.

**Behavior:**

1. System shows confirmation: "3 Autopilot applications are currently running on LinkedIn. Disconnecting will fail those applications. Continue?"
2. If user confirms: Running LinkedIn applications are marked as failed with reason "LinkedIn disconnected by user." Queued LinkedIn applications are cancelled. Non-LinkedIn applications continue.
3. Dashboard updates immediately with failure cards.

### 8.7 Network Disconnection During Autopilot Batch

**Scenario:** User's internet drops while 5 Autopilot apps are running.

**Behavior:**

1. The applications continue running on the server-side (they operate in sandboxed browsers on WeKruit's infrastructure, not the user's machine).
2. The user's dashboard loses its WebSocket connection. Banner: "Connection lost. Reconnecting... Your applications are still running on our servers."
3. On reconnection: Dashboard catches up with current state via API poll. Shows all completed/in-progress/failed applications.
4. If applications complete while user is offline: Notifications are queued and delivered on reconnection (in-app) or via push/email (if enabled).

---

## 9. Metrics & Measurement

### 9.1 Onboarding Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time from sign-up to dashboard | < 90 sec | Timestamp diff: account created to dashboard first load |
| Time from sign-up to first application started | < 3 min | Timestamp diff: account created to first application queued |
| Onboarding completion rate | > 80% | Users who reach dashboard / users who start OAuth |
| Resume upload success rate | > 95% | Successful uploads / upload attempts |
| Quick review edits | < 3 fields edited | Avg fields edited during quick review step |

### 9.2 Mode Selection Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Autopilot unlock rate | > 70% | Users who complete 3 Copilot apps / users who complete 1 |
| Autopilot adoption rate | > 50% | Users who try Autopilot within 7 days of unlock / users who unlock |
| Mode switching frequency | < 2x/week | Average mode changes per user per week (too many = confusion) |
| Per-application override rate | < 15% | Applications where user changes mode from global default |

### 9.3 Autopilot Health Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Autopilot auto-submit rate | > 85% | Applications auto-submitted / total Autopilot applications |
| Autopilot pause rate | < 15% | Applications paused for review / total Autopilot applications |
| Autopilot failure rate | < 5% | Failed Autopilot applications / total Autopilot applications |
| Post-submission issue report rate | < 3% | "Report Issue" clicks / total Autopilot submissions |
| Q&A bank coverage at Autopilot unlock | > 60% | Questions answered in Q&A bank / common questions encountered |
| Confidence threshold distribution | 85% median | Distribution of user-set confidence thresholds |
| 3-failure auto-pause frequency | < 1x/user/month | Times the 3-failure circuit breaker triggers |

### 9.4 Trust Escalator Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Copilot-to-Autopilot conversion time | < 1 week | Days from first app to first Autopilot app |
| Confidence threshold reduction rate | 1 step/month | Users who lower their threshold within 30 days of Autopilot adoption |
| Q&A bank growth rate | +3 entries/week | New Q&A entries per user per week |
| Screenshot view rate (Autopilot) | > 30% first month, < 10% third month | Percentage of Autopilot summaries where user views screenshots (declining = increasing trust) |

---

## 10. Appendix: Full UI Copy Library

### 10.1 Mode Descriptions (Long Form)

**Copilot Mode:**
> "Copilot mode gives you full control. The AI fills every field of your job application, shows you exactly what it wrote, and waits for your approval before submitting. You review the completed form, make any changes you want, and click Submit when you're satisfied. Think of it as having a skilled assistant who prepares everything and says 'Ready when you are.'"

**Autopilot Mode:**
> "Autopilot mode lets the AI handle the entire application process. It fills fields, answers screening questions, and submits automatically -- but only when it's confident in every answer. If the AI is unsure about any field, it pauses and asks you. You get a detailed summary and screenshots after each submission. Think of it as cruise control: the car drives, you monitor the dashboard, and you can take the wheel anytime."

### 10.2 Mode Descriptions (Short Form -- Tooltips)

**Copilot:** "AI fills, you review and submit."
**Autopilot:** "AI fills and submits. You review after."

### 10.3 Trust Gate Copy

**Autopilot locked (0 apps):**
> "Complete 3 applications in Copilot mode to unlock Autopilot. This helps the system learn your preferences and build your Q&A bank."

**Autopilot locked (1 app):**
> "2 more Copilot applications to unlock Autopilot. Your first application built a solid foundation."

**Autopilot locked (2 apps):**
> "Just 1 more Copilot application to unlock Autopilot. You're almost there."

**Autopilot unlocked:**
> "Autopilot mode unlocked! You've completed 3 applications with [X]% average confidence. Ready to try hands-free applying?"

### 10.4 Confidence Threshold Copy

**85% (recommended):**
> "Balanced. Most applications auto-submit. The AI pauses for unusual or complex questions."

**90%:**
> "Conservative. The AI pauses more often, giving you more chances to review."

**80%:**
> "Aggressive. The AI auto-submits more freely. Best when your Q&A bank is comprehensive."

**70% (minimum):**
> "Maximum speed. The AI rarely pauses. Recommended only after 20+ successful applications with a complete Q&A bank."

### 10.5 Error State Copy

**3-failure auto-pause:**
> "Autopilot paused: 3 applications failed in a row. This usually means something needs your attention -- like an expired session or a platform issue. We paused to prevent more failures."

**Session expired during Autopilot:**
> "Your LinkedIn session expired while Autopilot was running. Applications in progress have been paused. Reconnect LinkedIn to resume."

**Unknown form field:**
> "Autopilot found a field it hasn't seen before. This happens with custom application forms. Take a quick look and the AI will remember for next time."

### 10.6 Notification Copy

**Autopilot batch complete (push):**
> "5 applications submitted via Autopilot. Average confidence: 93%. All successful."

**Autopilot pause (push):**
> "Autopilot paused on 'Data Engineer at Airbnb' -- 1 field needs your review."

**Autopilot failure (push):**
> "Application failed: ML Engineer at OpenAI. Reason: Form validation error. [View Details]"

**Autopilot CAPTCHA (push -- urgent):**
> "CAPTCHA detected on your application to Stripe. Open WeKruit to solve it. (28 min remaining)"

### 10.7 Onboarding Copy

**Welcome screen after OAuth:**
> "Welcome to WeKruit. Upload your resume and you'll be applying to your first job in about 2 minutes."

**Quick review intro:**
> "Does this look right? We pulled this from your resume. You can fine-tune everything later in Settings."

**Magic moment prompt:**
> "You're all set. Paste a job URL below and watch the AI fill your application in real time."

**Post-first-app Q&A prompt:**
> "Nice -- your first application is done! Save time on the next one by pre-answering these questions that just came up."

### 10.8 Mode Switch Confirmation Copy

**Switching from Copilot to Autopilot (global):**
> "Switch to Autopilot? The AI will fill and submit applications automatically when confidence is above your threshold ([X]%). You'll get summaries after each submission."

**Switching from Autopilot to Copilot (global):**
> "Switch to Copilot? The AI will fill applications but wait for your review before submitting."

**Switching mid-application:**
> "Switch this application to [Copilot/Autopilot]? This only affects the current application. Your global default stays as [current default]."

---

## User Flow Diagrams

### Complete Onboarding-to-Autopilot Journey

```
NEW USER
   |
   v
[Google OAuth] ---------> Account created
   |
   v
[Resume Upload] --------> Resume parsed by LLM
   |                       Q&A bank silently seeded from resume data
   v
[Quick Review] ----------> Name, email, phone verified
   |                       Experience confirmed at a glance
   v
[Dashboard: First-Time] -> URL input prominently displayed
   |                       Sample jobs available
   v
[Paste First Job URL] ---> Job preview + match score shown
   |                       Mode: Copilot (forced, no choice)
   v
[First Application] -----> AI fills fields in real time
   |                       User watches field log + screenshot
   v
[Review Screen] ---------> User sees every field + confidence
   |                       User approves or edits
   v
[Submit] ----------------> Confirmation screenshot shown
   |                       Application logged
   v
[Post-App Q&A Prompt] ---> "Save these screening answers?"
   |                       Q&A bank grows from real data
   v
[Apps 2-3: Copilot] -----> Confidence scores climb
   |                       Q&A bank covers more questions
   |                       User overrides fewer fields
   v
[AUTOPILOT UNLOCKED] ----> Celebration + mode choice presented
   |                        |
   +--- [Keep Copilot] ----+---> Continue as before
   |                        |
   +--- [Try Autopilot] ---+---> First Autopilot application
                            |
                            v
                [Autopilot App 4+] ----> AI fills AND submits
                            |            Post-submission summary
                            |            Screenshot proof
                            v
                [Apps 5-10: Building Confidence]
                            |    Batch mode suggested
                            |    Threshold adjustment nudged
                            v
                [Apps 10+: Power User]
                            |    Batch Autopilot with digest
                            |    Low threshold (80%)
                            |    Rarely intervenes
                            v
                [STEADY STATE: TRUSTED AUTOPILOT]
```

### Mode Decision Tree Per Application

```
User starts new application
   |
   v
What is the global default mode?
   |
   +--- Copilot -------+
   |                    |
   +--- Autopilot -----+
                        |
                        v
           Does user override for this app?
                        |
                +--- No ---> Use global default
                |
                +--- Yes --> Use override mode
                             |
                             v
                      Mode = ?
                        |
          +--- Copilot -+- Autopilot ---+
          |                              |
          v                              v
   AI fills all fields          AI fills all fields
          |                              |
          v                              v
   PAUSE: Show review           Check confidence
   screen to user               of ALL fields
          |                              |
          v                     +--- All >= threshold?
   User approves/edits          |        |
          |                     |    Yes: AUTO-SUBMIT
          v                     |        |
   SUBMIT                       |        v
          |                     |   Post-submission
          v                     |   summary shown
   Confirmation                 |
   screenshot                   +--- Any < threshold?
                                         |
                                     PAUSE: Show only
                                     low-confidence
                                     fields to user
                                         |
                                         v
                                    User approves/edits
                                         |
                                         v
                                    AUTO-SUBMIT
                                         |
                                         v
                                    Post-submission
                                    summary shown
```

### Autopilot Failure Escalation Flow

```
Application fails in Autopilot
   |
   v
Is this the 1st consecutive failure?
   |
   +--- Yes --> Normal failure notification
   |            Application marked as failed
   |            Autopilot continues with next app
   |
   +--- No ---> Is this the 2nd consecutive failure?
                 |
                 +--- Yes --> Warning notification:
                 |            "2 consecutive failures. Monitoring."
                 |            Autopilot continues with next app
                 |
                 +--- No ---> 3rd consecutive failure
                              |
                              v
                    AUTO-PAUSE ALL AUTOPILOT APPS
                              |
                              v
                    Analyze failure reasons
                              |
                    +--- Same root cause? (e.g., session expired)
                    |         |
                    |    Show specific diagnosis + fix button
                    |    e.g., "LinkedIn session expired. [Reconnect]"
                    |
                    +--- Different causes?
                              |
                         Show generic review prompt
                         "Please review the failure details"
                              |
                              v
                    User fixes issue
                              |
                              v
                    User manually clicks "Resume Autopilot"
                    (no auto-resume after circuit breaker)
```

---

*End of Autopilot & Copilot Mode Selection, Onboarding, and Trust UX specification. This document should be reviewed alongside 02_user_flows_and_ux_design.md for the complete design system, as this document extends and partially revises the onboarding and settings flows defined there.*
