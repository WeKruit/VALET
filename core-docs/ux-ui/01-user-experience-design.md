# WeKruit Valet -- User Experience & Interface Design

> Comprehensive UX/UI specification for real-time progress tracking, browser takeover,
> copilot review, and application result flows. Grounded in the existing React SPA
> (Vite + TanStack Router), Radix UI primitives, Tailwind CSS design tokens, and
> WebSocket message schemas already implemented in the codebase.

---

## Table of Contents

1. [User Journey Map](#1-user-journey-map)
2. [Task Progress View](#2-task-progress-view)
3. [CAPTCHA / Human Takeover Flow](#3-captcha--human-takeover-flow)
4. [Copilot Review Screen](#4-copilot-review-screen)
5. [VNC Viewer Component Spec](#5-vnc-viewer-component-spec)
6. [Application Result View](#6-application-result-view)
7. [Dashboard Enhancements](#7-dashboard-enhancements)
8. [Settings Pages](#8-settings-pages)
9. [Error States](#9-error-states)
10. [Component Inventory](#10-component-inventory)

---

## 1. User Journey Map

### Complete Flow: Landing to First Successful Application

```
 Login (/login)
   |
   |  Google OAuth 2.0
   v
 TOS Consent (DisclaimerModal step="tos")
   |
   v
 Copilot Disclaimer (DisclaimerModal step="copilot")
   |
   v
 Onboarding (/onboarding)
   |
   +---> Step 1: Resume Upload (ResumeUpload component)
   |       - Drag & drop PDF/DOCX
   |       - Server parses -> extracts profile fields
   |
   +---> Step 2: Quick Review (QuickReview component)
   |       - Verify parsed name, email, phone, location
   |       - Preview experience, education, skills
   |       - "Looks Good -- Let's Go" CTA
   |
   v
 Dashboard (/dashboard)
   |
   |  User clicks "New Application" or navigates to /apply
   v
 Apply Page (/apply)
   |
   |  Paste job URL -> platform auto-detected (LinkedIn, Greenhouse, Lever, Workday)
   |  Mode locked to Copilot for first 3 applications
   |  "Start Application" CTA -> POST /api/v1/tasks
   |
   v
 Task Detail Page (/tasks/:taskId)
   |
   +---> Progress Stepper (8 steps, real-time via WebSocket)
   |       queued -> starting_browser -> navigating -> analyzing_page
   |       -> filling_form -> waiting_review -> submitting -> verifying
   |
   +---> Real-time Action Log (ProgressLog component)
   |       "Navigating to LinkedIn...", "Filling name field...", etc.
   |
   +---> Live Screenshot Preview (refreshing every 5s during fill)
   |
   +---> [Branch A] CAPTCHA / Human Needed
   |       |  WebSocket message: { type: "human_needed", vncUrl, reason }
   |       |  Toast notification + sound + badge
   |       |  "Take Over" button appears
   |       v
   |     TakeoverModal opens (noVNC iframe, 80% viewport)
   |       |  User solves CAPTCHA or fills tricky fields
   |       |  "I'm Done -- Resume Automation" button
   |       |  POST /api/v1/tasks/:id/resume
   |       v
   |     Automation continues from where it left off
   |
   +---> [Branch B] Copilot Review
   |       |  WebSocket message: { type: "field_review", fields[] }
   |       |  Task enters "waiting_review" status
   |       v
   |     FieldReviewPanel (side-by-side layout)
   |       |  Left: live browser screenshot
   |       |  Right: editable field list with confidence badges
   |       |  "Approve & Submit" / "Edit" / "Cancel" actions
   |       |  POST /api/v1/tasks/:id/approve
   |       v
   |     Automation submits the application
   |
   v
 Completion
   |
   |  WebSocket message: { type: "completed", screenshotUrl }
   |  Confirmation screenshot, summary card, filled fields
   |
   v
 Dashboard (updated stats, task appears in Recent Applications)
```

### Key Emotional Moments

| Moment | User Feeling | Design Response |
|--------|-------------|-----------------|
| First resume upload | Cautious, curious | Minimal UI, "2 minutes to first app" promise |
| Watching browser work | Amazed, nervous | Live screenshot + action log builds trust |
| CAPTCHA interruption | Annoyed, urgent | Prominent notification with sound, quick takeover |
| Reviewing filled fields | Cautious, in control | Confidence badges, easy edit, diff view |
| Application submitted | Relieved, accomplished | Celebration animation, summary, "Apply Again" |
| Autopilot unlocked | Excited, trusting | Mode selection card, purple theme shift |

### Onboarding-to-Dashboard Transition

After the Quick Review step, the user sees the Dashboard for the first time. If they have
zero tasks, the Dashboard shows the "empty state" cards with a prominent CTA to navigate
to the Apply page. This replaces the original three-dot onboarding stepper (sign up, resume,
quick review) with a sense of arrival: "You're set up. Now let's apply."

---

## 2. Task Progress View

**Route:** `/tasks/:taskId`
**Existing Components:** `TaskDetailPage`, `TaskDetail`, `TaskProgress`
**WebSocket Hook:** `useTaskWebSocket(taskId)` -- receives `state_change`, `progress`, `field_review`, `human_needed`, `completed`, `error` messages

### 2.1 Enhanced 8-Step Progress Stepper

The existing `TaskProgress` component uses a vertical timeline with 8 steps. The enhanced
version adds:

- **Animated transitions** between steps (Tailwind `transition-all duration-500`)
- **Pulse animation** on the current active step circle (already present as `animate-spin` on `Loader2`, upgrade to `animate-pulse` on the container ring)
- **ETA countdown** displayed per step
- **Step duration** shown for completed steps ("took 3s")
- **Collapsible sub-steps** within each major step (e.g., "filling_form" shows individual field fills)

```
TASK STEPS (from packages/shared/src/constants/limits.ts):
  "queued" | "starting_browser" | "navigating" | "analyzing_page"
  "filling_form" | "waiting_review" | "submitting" | "verifying" | "completed"
```

#### ASCII Wireframe: Enhanced Progress Stepper

```
+------------------------------------------------------------------+
|  Progress                                            ETA: ~45s   |
+------------------------------------------------------------------+
|                                                                  |
|  [*] Queued ................................ 0s     [completed]  |
|   |  Task created and queued                                     |
|   |                                                              |
|  [*] Starting Browser ..................... 4s     [completed]  |
|   |  Launched sandbox, browser ready                             |
|   |                                                              |
|  [*] Navigating ........................... 2s     [completed]  |
|   |  Opened https://linkedin.com/jobs/view/12345                 |
|   |                                                              |
|  [*] Analyzing Page ....................... 6s     [completed]  |
|   |  Detected 12 form fields, 3 screening questions              |
|   |                                                              |
|  [@] Filling Form ......................... ~15s   [in progress] |
|   |  > Filled "First Name" = "John"              [0.98]         |
|   |  > Filled "Last Name" = "Doe"                [0.99]         |
|   |  > Uploading resume...                                       |
|   |  > Filling "Why this role?" ...              [generating]    |
|   |                                                              |
|  [ ] Waiting for Review                           [pending]     |
|   |                                                              |
|  [ ] Submitting                                   [pending]     |
|   |                                                              |
|  [ ] Verifying                                    [pending]     |
|                                                                  |
+------------------------------------------------------------------+

Legend:
  [*] = completed (green check, bg-emerald)
  [@] = in progress (blue, animate-spin loader)
  [ ] = pending (gray circle)
```

#### ETA Calculation

ETA per step is derived from historical median durations stored per platform. The API
returns `estimatedDurationMs` per step when starting a task. The frontend counts down
using `requestAnimationFrame` and displays relative time ("~15s", "~2min").

```typescript
// New WebSocket message type to add to ws.ts
z.object({
  type: z.literal("step_eta"),
  taskId: z.string().uuid(),
  step: z.string(),
  estimatedRemainingMs: z.number(),
})
```

### 2.2 Real-Time Action Log (ProgressLog)

Below the stepper, a scrolling log shows individual actions taken by the automation engine
in real-time. Each log entry arrives via the existing `progress` WebSocket message.

#### ASCII Wireframe: Action Log

```
+------------------------------------------------------------------+
|  Activity Log                                  [Auto-scroll: ON] |
+------------------------------------------------------------------+
|                                                                  |
|  12:04:32  Navigating to LinkedIn...                       INFO  |
|  12:04:35  Page loaded, detecting form structure           INFO  |
|  12:04:37  Found 12 input fields                           INFO  |
|  12:04:38  Filling field "First Name" with "John"          FILL  |
|  12:04:38  Filling field "Last Name" with "Doe"            FILL  |
|  12:04:39  Filling field "Email" with "john@email.com"     FILL  |
|  12:04:40  Filling field "Phone" with "+1 555-1234"        FILL  |
|  12:04:41  Uploading resume "John_Doe_Resume.pdf"          FILE  |
|  12:04:45  Upload complete                                 INFO  |
|  12:04:46  Generating answer for "Why this role?"          LLM   |
|  12:04:52  Answer generated (confidence: 0.87)             LLM   |
|  12:04:52  Filling screening question 1/3                  FILL  |
|  |                                                               |
|  v (auto-scrolling)                                              |
+------------------------------------------------------------------+
```

Implementation uses `Radix ScrollArea` with `ref` to `scrollIntoView({ behavior: "smooth" })`
on each new message. Entries are color-coded by type:

| Type | Color | Tailwind |
|------|-------|----------|
| INFO | Default text | `text-[var(--wk-text-secondary)]` |
| FILL | Blue/copilot | `text-[var(--wk-copilot)]` |
| FILE | Amber | `text-[var(--wk-accent-amber)]` |
| LLM  | Purple | `text-[var(--wk-autopilot)]` |
| WARN | Warning | `text-[var(--wk-status-warning)]` |
| ERR  | Error | `text-[var(--wk-status-error)]` |

### 2.3 Live Screenshot Preview

During the `filling_form` step, a screenshot preview shows the current state of the
browser. Screenshots are captured server-side every 5 seconds and pushed via Supabase
Storage with a signed URL. The frontend polls or receives a WebSocket notification with
the updated URL.

#### ASCII Wireframe: Screenshot Preview Panel

```
+------------------------------------------------------------------+
|  Live Preview                              Last updated: 3s ago  |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+ |
|  |                                                            | |
|  |                 [Browser Screenshot]                       | |
|  |                                                            | |
|  |  +--------------------------------------------------+     | |
|  |  | LinkedIn Easy Apply                              |     | |
|  |  |                                                  |     | |
|  |  | First Name: [John          ]                     |     | |
|  |  | Last Name:  [Doe           ]                     |     | |
|  |  | Email:      [john@email.com]                     |     | |
|  |  | Resume:     [Uploaded]                           |     | |
|  |  |                                                  |     | |
|  |  +--------------------------------------------------+     | |
|  |                                                            | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  [Click to enlarge]                          Refreshing in 2s... |
+------------------------------------------------------------------+
```

The screenshot container maintains a **16:9 aspect ratio** using Tailwind's `aspect-video`.
A loading skeleton (`animate-pulse bg-[var(--wk-surface-sunken)]`) shows while the image
loads. Click-to-enlarge opens a `Dialog` with the full-resolution screenshot.

### 2.4 Complete Task Detail Page Layout

```
+------------------------------------------------------------------+
|  <- Back    Application Progress                                 |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+ |
|  | Task Details                                                | |
|  | ---------------------------------------------------------- | |
|  | Task ID:   abc-123-def       Platform: LinkedIn             | |
|  | Job URL:   linkedin.com/...  Progress: 62%                  | |
|  | Mode:      [Copilot]         Status:   [in progress]        | |
|  | WS:        [* Live]                                         | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +---------------------------+  +------------------------------+ |
|  | Progress Stepper          |  | Live Preview                 | |
|  | (8 steps, vertical)       |  | [Screenshot]                 | |
|  |                           |  |                              | |
|  | [*] Queued         0s     |  | Last updated: 3s ago         | |
|  | [*] Starting       4s     |  +------------------------------+ |
|  | [*] Navigating     2s     |                                  |
|  | [*] Analyzing      6s     |  +------------------------------+ |
|  | [@] Filling...    ~15s    |  | Activity Log                 | |
|  | [ ] Review                |  | 12:04:38 Filling First Name  | |
|  | [ ] Submitting            |  | 12:04:39 Filling Email...    | |
|  | [ ] Verifying             |  | 12:04:40 Uploading resume... | |
|  +---------------------------+  +------------------------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | [Take Over Browser]    [Approve & Submit]    [Cancel Task]  | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

The layout uses a **responsive two-column grid** on desktop (`lg:grid-cols-[300px_1fr]`)
that stacks to a single column on mobile. The stepper is on the left; the screenshot
preview and activity log are on the right.

---

## 3. CAPTCHA / Human Takeover Flow

### 3.1 Trigger Conditions

The server sends a `human_needed` WebSocket message when:
- CAPTCHA detected (reCAPTCHA, hCaptcha, slider, image puzzle)
- Two-factor authentication prompt
- Complex form requiring human judgment
- Automation engine confidence drops below threshold

```typescript
// From packages/shared/src/types/ws.ts
{
  type: "human_needed",
  taskId: "abc-123",
  reason: "CAPTCHA detected: reCAPTCHA v2 challenge",
  vncUrl: "wss://sandbox-abc123.fly.dev:5900/websockify"
}
```

### 3.2 Notification Chain

1. **Toast notification** (urgent variant) with sound effect
2. **Badge count** on the Tasks nav item in the sidebar
3. **Pulsing indicator** on the task card in the dashboard's Active Tasks list
4. **Browser push notification** (if permitted) for background tab awareness

#### Toast Notification

```typescript
// Triggered from useTaskWebSocket when message.type === "human_needed"
toast("Human action needed", {
  description: message.reason,
  action: {
    label: "Take Over",
    onClick: () => navigate(`/tasks/${message.taskId}?takeover=true`),
  },
  duration: Infinity, // Stays until dismissed
});

// Play notification sound
new Audio("/sounds/attention.mp3").play();
```

#### Sidebar Badge

```
+-------------------+
|  [icon] Tasks  (1)|    <-- red badge count for waiting_human tasks
+-------------------+
```

The sidebar `navItems` array gains a dynamic badge count from a global store that tracks
tasks in `waiting_human` status. The badge uses the existing `Badge` component with
`variant="error"`.

### 3.3 Task Detail -- Take Over Button

When a task is in `waiting_human` status and has a `vncUrl`, the "Take Over" button
appears prominently in the action bar:

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |                                                            | |
|  |  !! Human Action Needed                                    | |
|  |  CAPTCHA detected: reCAPTCHA v2 challenge                  | |
|  |                                                            | |
|  |  [===== Take Over Browser =====]   (primary, lg, pulsing)  | |
|  |                                                            | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

The banner uses `bg-amber-50 border-[var(--wk-status-warning)]` with the `AlertTriangle`
icon. The "Take Over Browser" button uses `variant="cta"` with a `ring-2 ring-offset-2
ring-[var(--wk-status-warning)] animate-pulse` wrapper to draw attention.

### 3.4 TakeoverModal -- VNC Takeover Experience

Clicking "Take Over Browser" opens a near-fullscreen modal containing the noVNC viewer.

#### ASCII Wireframe: TakeoverModal (Desktop)

```
+------------------------------------------------------------------+
| +--------------------------------------------------------------+ |
| |  Browser Control -- Task abc-123              [?] [X] Close  | |
| +--------------------------------------------------------------+ |
| |                                                              | |
| |                                                              | |
| |                                                              | |
| |              +--------------------------------------+        | |
| |              |                                      |        | |
| |              |         noVNC Live View              |        | |
| |              |                                      |        | |
| |              |    [reCAPTCHA challenge visible]      |        | |
| |              |                                      |        | |
| |              |    "Select all images with           |        | |
| |              |     traffic lights"                  |        | |
| |              |                                      |        | |
| |              |    [img] [img] [img]                 |        | |
| |              |    [img] [img] [img]                 |        | |
| |              |    [img] [img] [img]                 |        | |
| |              |                                      |        | |
| |              |         [Verify]                     |        | |
| |              |                                      |        | |
| |              +--------------------------------------+        | |
| |                                                              | |
| +--------------------------------------------------------------+ |
| | [Fullscreen] [Keyboard] [Clipboard] [*Connected]             | |
| | +----------------------------------------------------------+| |
| | |                                                          || |
| | |  [====== I'm Done -- Resume Automation ======]           || |
| | |                                                          || |
| | +----------------------------------------------------------+| |
| +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

#### Modal Specifications

| Property | Value |
|----------|-------|
| Width | `max-w-[90vw]` on desktop, `100vw` on mobile |
| Height | `max-h-[85vh]` on desktop, `100vh` on mobile |
| Background | `bg-[var(--wk-surface-overlay)]` backdrop blur |
| Border radius | `rounded-[var(--wk-radius-2xl)]` |
| z-index | `z-50` (matches existing Dialog) |
| Close behavior | Confirm dialog if VNC is connected |

#### Control Bar (Bottom)

```
+------------------------------------------------------------------+
| [Fullscreen]  [Keyboard]  [Clipboard]  [* Connected]             |
|                                                                  |
| [============== I'm Done -- Resume Automation ================]  |
+------------------------------------------------------------------+
```

| Button | Icon | Action |
|--------|------|--------|
| Fullscreen | `Maximize2` | Toggle browser fullscreen API |
| Keyboard | `Keyboard` | Toggle virtual keyboard (mobile) |
| Clipboard | `ClipboardCopy` | Open clipboard sync dialog |
| Connection | Green dot | Shows connection state |
| "I'm Done" | `Play` | POST `/api/v1/tasks/:id/resume`, close modal |

The "I'm Done -- Resume Automation" button is large (`size="lg"`, `variant="cta"`,
`w-full`) and positioned at the bottom of the control bar for easy access.

### 3.5 Idle Timer

If no mouse/keyboard activity is detected in the VNC session for 3 minutes, a countdown
overlay appears:

```
+------------------------------------------------------------------+
|                                                                  |
|               No activity detected for 3 minutes.                |
|                                                                  |
|           Auto-resuming automation in 1:58...                    |
|                                                                  |
|           [Keep Control]         [Resume Now]                    |
|                                                                  |
+------------------------------------------------------------------+
```

- **Keep Control**: Resets the idle timer, user keeps VNC access
- **Resume Now**: Immediately posts `/api/v1/tasks/:id/resume` and closes modal
- The countdown starts at 2 minutes (120s) after the 3-minute idle threshold
- Total idle before auto-resume: 5 minutes

Implementation: Track `lastActivityTimestamp` from noVNC's `rfb.addEventListener("bell")`
and pointer/keyboard events. Use `setInterval` to check elapsed time.

### 3.6 Mobile Takeover

On mobile viewports (`< 768px`), the TakeoverModal becomes fullscreen:

```
+------------------------------+
| Browser Control    [X Close] |
+------------------------------+
|                              |
|                              |
|     noVNC Live View          |
|     (touch gestures)         |
|                              |
|     - Pinch to zoom          |
|     - Drag to scroll         |
|     - Tap to click           |
|     - Long-press = right     |
|                              |
|                              |
+------------------------------+
| [KB] [Clip] [*]    [Resume] |
+------------------------------+
```

The VNC viewer fills the viewport. A compact control bar at the bottom provides access
to keyboard, clipboard, and the resume button. Gesture controls are handled by noVNC's
built-in touch event translation.

---

## 4. Copilot Review Screen

### 4.1 Trigger

When the automation engine finishes filling all form fields, it sends a `field_review`
WebSocket message with all detected fields, their values, and confidence scores. The task
status transitions to `waiting_review`.

```typescript
// From packages/shared/src/types/ws.ts
{
  type: "field_review",
  taskId: "abc-123",
  fields: [
    { name: "First Name",   value: "John",            confidence: 0.99, source: "resume" },
    { name: "Last Name",    value: "Doe",             confidence: 0.99, source: "resume" },
    { name: "Email",        value: "john@email.com",  confidence: 0.95, source: "resume" },
    { name: "Phone",        value: "+1 555-1234",     confidence: 0.92, source: "resume" },
    { name: "Why this role?", value: "I am excited...", confidence: 0.78, source: "llm_generated" },
  ]
}
```

### 4.2 Side-by-Side Layout

#### ASCII Wireframe: FieldReviewPanel (Desktop)

```
+------------------------------------------------------------------+
|  Review Application                    Task abc-123   [Copilot]  |
+------------------------------------------------------------------+
|                                                                  |
|  +--------------------------+  +-------------------------------+ |
|  |  Browser Preview         |  |  Fields to Submit             | |
|  |                          |  |                               | |
|  |  +--------------------+  |  |  Personal Information         | |
|  |  |                    |  |  |  +--------------------------+ | |
|  |  |  [Live screenshot] |  |  |  | First Name               | | |
|  |  |  LinkedIn form     |  |  |  | John              [0.99] | | |
|  |  |  with fields       |  |  |  | Source: Resume     [*]   | | |
|  |  |  highlighted       |  |  |  +--------------------------+ | |
|  |  |                    |  |  |  | Last Name                | | |
|  |  |  Fields are        |  |  |  | Doe               [0.99] | | |
|  |  |  outlined in       |  |  |  | Source: Resume     [*]   | | |
|  |  |  blue/yellow/red   |  |  |  +--------------------------+ | |
|  |  |  matching their    |  |  |  | Email                    | | |
|  |  |  confidence        |  |  |  | john@email.com    [0.95] | | |
|  |  |                    |  |  |  | Source: Resume     [*]   | | |
|  |  +--------------------+  |  |  +--------------------------+ | |
|  |                          |  |                               | |
|  |  Refreshed 2s ago        |  |  Screening Questions          | |
|  |  [View full size]        |  |  +--------------------------+ | |
|  |                          |  |  | Why this role?           | | |
|  +--------------------------+  |  |                          | | |
|                                |  | "I am excited about     | | |
|                                |  | the opportunity to..."  | | |
|                                |  |                          | | |
|                                |  | Confidence: [!!!] 0.78  | | |
|                                |  | Source: LLM Generated   | | |
|                                |  | [Edit Answer]           | | |
|                                |  +--------------------------+ | |
|                                |                               | |
|                                +-------------------------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | [Cancel]  [Edit Fields]  [=== Approve & Submit ===]         | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### 4.3 Confidence Badge System

Confidence scores map to three tiers with distinct visual treatment:

| Range | Level | Badge | Tailwind Classes |
|-------|-------|-------|-----------------|
| 0.90 - 1.00 | High | Green dot | `bg-emerald-50 text-[var(--wk-status-success)] border-emerald-200` |
| 0.70 - 0.89 | Medium | Yellow dot | `bg-amber-50 text-[var(--wk-status-warning)] border-amber-200` |
| 0.00 - 0.69 | Low | Red dot | `bg-red-50 text-[var(--wk-status-error)] border-red-200` |

```typescript
function getConfidenceVariant(score: number): "success" | "warning" | "error" {
  if (score >= 0.9) return "success";
  if (score >= 0.7) return "warning";
  return "error";
}
```

The existing `Badge` component from `@valet/ui` supports `success`, `warning`, and `error`
variants that match this system perfectly.

### 4.4 Field Card Component

Each field in the review list renders as a card:

```
+---------------------------------------------------------+
| First Name                                       [Edit] |
| -------------------------------------------------------+|
| Value:      John                                        |
| Confidence: [*] 0.99                          (green)   |
| Source:     Resume                            (badge)   |
+---------------------------------------------------------+
```

When the user clicks **Edit**, the value becomes an editable `Input` field with Save/Cancel
buttons:

```
+---------------------------------------------------------+
| First Name                                              |
| -------------------------------------------------------+|
| Value:      [John                    ]  [Save] [Cancel] |
| Confidence: [*] 0.99                                    |
| Source:     Resume -> User Edited                        |
+---------------------------------------------------------+
```

### 4.5 Screening Questions Section

Screening questions get their own section with larger text areas for editing:

```
+---------------------------------------------------------+
| Screening Question 1 of 3                               |
| -------------------------------------------------------+|
|                                                         |
| Q: Why are you interested in this role?                 |
|                                                         |
| A: "I am excited about the opportunity to leverage my   |
|    5+ years of experience in full-stack development..." |
|                                                         |
| Confidence: [!!] 0.78  (yellow)                         |
| Source:     LLM Generated                               |
| [Edit Answer]                                           |
|                                                         |
| Tokens used: 342 input / 187 output                     |
+---------------------------------------------------------+
```

### 4.6 Diff View

An optional toggle shows what was detected on the page vs. what will be submitted,
useful when the automation has transformed or enriched data:

```
+---------------------------------------------------------+
| Diff View                                   [Toggle ON] |
| -------------------------------------------------------+|
|                                                         |
| Phone:                                                  |
|   Detected:    555-1234                                 |
|   Submitting:  +1 555-1234              (formatted)     |
|                                                         |
| Location:                                               |
|   Detected:    (empty)                                  |
|   Submitting:  San Francisco, CA        (from resume)   |
|                                                         |
+---------------------------------------------------------+
```

### 4.7 Action Buttons

| Button | Variant | Condition | Action |
|--------|---------|-----------|--------|
| Cancel | `destructive` | Always visible | Cancels the entire task |
| Edit Fields | `secondary` | Always visible | Scrolls to first yellow/red confidence field |
| Approve & Submit | `cta` (primary, large) | All fields reviewed | POST `/api/v1/tasks/:id/approve` |
| Approve All | `ghost` | When >5 fields | Quick approve without scrolling |

### 4.8 Mobile Layout

On mobile (`< 1024px`), the side-by-side layout stacks vertically:
1. Screenshot preview (collapsed by default, tap to expand)
2. Fields list (full width)
3. Sticky action bar at bottom

```
+------------------------------+
|  Review Application          |
+------------------------------+
| [Screenshot]     [Tap to     |
|                   expand]    |
+------------------------------+
|                              |
| Personal Information         |
| +---First Name------------+ |
| | John            [0.99]  | |
| +-------------------------+ |
| +---Last Name-------------+ |
| | Doe             [0.99]  | |
| +-------------------------+ |
| ...                          |
|                              |
| Screening Questions          |
| +---Why this role?--------+ |
| | "I am excited..."       | |
| | [!!] 0.78    [Edit]     | |
| +-------------------------+ |
|                              |
+------------------------------+
| [Cancel]  [== Approve ==]   |
+------------------------------+
```

---

## 5. VNC Viewer Component Spec

### 5.1 Component API

```typescript
interface BrowserViewerProps {
  /** Task ID for the active application session */
  taskId: string;

  /** View mode: "control" allows input, "spectate" is read-only */
  mode: "control" | "spectate";

  /** VNC WebSocket URL (from human_needed message or task detail) */
  vncUrl: string;

  /** Callback when VNC connection is established */
  onConnect?: () => void;

  /** Callback when VNC connection is lost */
  onDisconnect?: () => void;

  /** Callback when connection error occurs */
  onError?: (error: Error) => void;

  /** Shorthand for mode="spectate" behavior */
  readOnly?: boolean;

  /** Additional CSS class for the container */
  className?: string;
}
```

Usage:

```tsx
<BrowserViewer
  taskId={taskId}
  mode="control"
  vncUrl={vncUrl}
  onConnect={() => setConnected(true)}
  onDisconnect={() => setConnected(false)}
  onError={(err) => toast.error(err.message)}
/>
```

### 5.2 Connection State Machine

```
                +-----------+
                |           |
         +----->| connecting|
         |      |  (init)   |
         |      +-----+-----+
         |            |
         |            | WebSocket open + RFB handshake
         |            v
         |      +-----------+
   reconnect    |           |
   (auto)  +----| connected |<---+
         |      |  (live)   |    |
         |      +-----+-----+    |
         |            |           |
         |            | WebSocket close / timeout
         |            v           |
         |      +-----------+    |
         +------| discon-   |    |
                | nected    |----+
                |           |  user clicks "Reconnect"
                +-----+-----+
                      |
                      | max retries exceeded
                      v
                +-----------+
                |           |
                |  error    |
                |           |
                +-----------+
```

### 5.3 Connection States UI

| State | Visual | Controls |
|-------|--------|----------|
| `connecting` | Centered spinner + "Connecting to browser..." text | None (disabled) |
| `connected` | Live VNC canvas, green dot indicator | Full control bar |
| `disconnected` | Gray overlay + "Connection lost" + [Reconnect] button | Reconnect only |
| `error` | Red error message + details + [Retry] button | Retry only |

#### ASCII Wireframe: Connection States

```
CONNECTING:
+------------------------------------------+
|                                          |
|          [Spinner]                       |
|          Connecting to browser...        |
|          Attempt 1 of 5                  |
|                                          |
+------------------------------------------+

CONNECTED:
+------------------------------------------+
|                                          |
|    [Live VNC Canvas -- 16:9 ratio]       |
|    Full interactive browser view         |
|                                          |
+------------------------------------------+
| [Fullscreen] [KB] [Clip]   [* Connected] |
+------------------------------------------+

DISCONNECTED:
+------------------------------------------+
|                                          |
|     Connection to browser was lost.      |
|                                          |
|     [========= Reconnect =========]      |
|                                          |
|     Attempting reconnect in 3s...        |
|                                          |
+------------------------------------------+

ERROR:
+------------------------------------------+
|                                          |
|  [!] Failed to connect to browser        |
|                                          |
|  The sandbox may have been shut down.    |
|  Error: WebSocket connection refused     |
|                                          |
|  [======== Retry ========]               |
|                                          |
+------------------------------------------+
```

### 5.4 Responsive Behavior

The `BrowserViewer` component fills its container and maintains a **16:9 aspect ratio**:

```tsx
<div className={cn(
  "relative w-full overflow-hidden rounded-[var(--wk-radius-lg)]",
  "border border-[var(--wk-border-subtle)]",
  "bg-[var(--wk-surface-sunken)]",
  "aspect-video", // 16:9 ratio
  className
)}>
  <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
</div>
```

### 5.5 Control Bar

```typescript
interface ControlBarProps {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onToggleKeyboard: () => void;
  onOpenClipboard: () => void;
  connectionState: "connecting" | "connected" | "disconnected" | "error";
  onDisconnect: () => void;
}
```

Renders as a horizontal bar below the VNC canvas:

```
+------------------------------------------------------------------+
| [Maximize2]  [Keyboard]  [ClipboardCopy]    [* Connected] [X]   |
+------------------------------------------------------------------+
```

All buttons use `variant="ghost"` `size="icon"` from the existing `Button` component.
The connection indicator reuses the dot pattern from `TaskDetail`:

```tsx
<div className="flex items-center gap-1.5">
  <div className={cn(
    "h-2 w-2 rounded-full",
    state === "connected" && "bg-[var(--wk-status-success)]",
    state === "connecting" && "bg-[var(--wk-status-warning)] animate-pulse",
    state === "disconnected" && "bg-[var(--wk-status-error)]",
    state === "error" && "bg-[var(--wk-status-error)]",
  )} />
  <span className="text-xs text-[var(--wk-text-tertiary)]">
    {state === "connected" ? "Connected" : state}
  </span>
</div>
```

### 5.6 noVNC Integration

The component wraps the `@novnc/novnc` library:

```typescript
import RFB from "@novnc/novnc/lib/rfb";

useEffect(() => {
  const rfb = new RFB(containerRef.current!, vncUrl, {
    shared: mode === "spectate",
    credentials: { password: vncPassword },
  });

  rfb.viewOnly = mode === "spectate" || readOnly === true;
  rfb.scaleViewport = true;
  rfb.resizeSession = true;
  rfb.qualityLevel = 6; // Balance quality vs. bandwidth

  rfb.addEventListener("connect", handleConnect);
  rfb.addEventListener("disconnect", handleDisconnect);
  rfb.addEventListener("credentialsrequired", handleCredentials);

  return () => rfb.disconnect();
}, [vncUrl, mode]);
```

---

## 6. Application Result View

### 6.1 Trigger

When the task reaches `completed` status (via `completed` WebSocket message), the Task
Detail page transitions to show the result view.

### 6.2 Result Layout

#### ASCII Wireframe: Application Result

```
+------------------------------------------------------------------+
|  <- Back    Application Complete                                 |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+ |
|  |  [Check icon in green circle]                               | |
|  |                                                             | |
|  |  Application Submitted Successfully                         | |
|  |                                                             | |
|  |  +-------------------------------------------------------+ | |
|  |  |  Company:          Acme Corp                           | | |
|  |  |  Position:         Senior Frontend Engineer            | | |
|  |  |  Platform:         LinkedIn Easy Apply                 | | |
|  |  |  Applied:          Feb 12, 2026 at 2:34 PM            | | |
|  |  |  Status:           [Submitted] (green badge)           | | |
|  |  |  Confidence:       0.94 [****] (green bar)             | | |
|  |  +-------------------------------------------------------+ | |
|  |                                                             | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |  Confirmation Screenshot                     [Full Size]    | |
|  |  +-------------------------------------------------------+ | |
|  |  |                                                       | | |
|  |  |  [Full-page screenshot of confirmation page]          | | |
|  |  |  "Thank you for your application..."                  | | |
|  |  |                                                       | | |
|  |  +-------------------------------------------------------+ | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |  Details                                     [Expand All]   | |
|  |                                                             | |
|  |  > Filled Fields (12)                                       | |
|  |    First Name: John                                         | |
|  |    Last Name: Doe                                           | |
|  |    Email: john@email.com                                    | |
|  |    ...                                                      | |
|  |                                                             | |
|  |  > Screening Answers (3)                                    | |
|  |    Q: Why this role? A: "I am excited..."                   | |
|  |    ...                                                      | |
|  |                                                             | |
|  |  > Performance                                              | |
|  |    Total time: 1m 23s                                       | |
|  |    LLM cost: $0.003 (342 input + 187 output tokens)         | |
|  |    Steps completed: 8/8                                     | |
|  |                                                             | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | [View on LinkedIn]              [Apply to Another Job]      | |
|  +------------------------------------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

### 6.3 Summary Card

The summary card shows key metadata at a glance:

| Field | Source |
|-------|--------|
| Company | Extracted from job page by Stagehand/Magnitude |
| Position | Extracted from job page title |
| Platform | From `task.platform` enum |
| Applied | `task.completedAt` formatted with `Intl.DateTimeFormat` |
| Status | Badge from `task.status` |
| Confidence | Overall score from `task.confidenceScore` (0-1), displayed as bar + number |

### 6.4 Expandable Sections

Implemented using native HTML `<details>` / `<summary>` elements or the Radix
`Collapsible` primitive for consistent animation:

1. **Filled Fields** -- Table of label/value pairs, with confidence indicators
2. **Screening Answers** -- Q&A pairs with token counts
3. **Performance** -- Time per step, total LLM cost, browser session duration

### 6.5 Action Buttons

| Button | Variant | Action |
|--------|---------|--------|
| View on LinkedIn | `secondary` | Opens `task.jobUrl` in new tab |
| Apply to Another Job | `cta` | Navigates to `/apply` |

---

## 7. Dashboard Enhancements

### 7.1 Current State

The existing `DashboardPage` renders:
1. `StatsCards` -- 4 stat cards (Total, Completed, In Progress, Needs Review)
2. `ActiveTasks` -- Card listing in-progress tasks
3. `RecentApplications` -- Card listing recent tasks with status badges

### 7.2 Enhanced Layout

#### ASCII Wireframe: Enhanced Dashboard

```
+------------------------------------------------------------------+
|  Dashboard                                                       |
|  Overview of your job application activity                       |
+------------------------------------------------------------------+
|                                                                  |
|  +------+  +------+  +------+  +------+  +------+               |
|  |Active|  |Today |  |Pend. |  |Compl.|  |Succ. |               |
|  |Sesn. |  |Apps  |  |Revws |  | This |  |Rate  |               |
|  |      |  |      |  |      |  | Week |  |      |               |
|  |  2   |  |  5   |  |  1   |  |  23  |  | 87%  |               |
|  |[*][*]|  |      |  | [!]  |  |      |  |      |               |
|  +------+  +------+  +------+  +------+  +------+               |
|                                                                  |
|  +------------------------------------------------------------+ |
|  |  Weekly Applications                                        | |
|  |  ----------------------------------------------------------| |
|  |                                                            | |
|  |  8|       ___                                              | |
|  |  6|  ___ |   | ___                                         | |
|  |  4| |   ||   ||   | ___                                    | |
|  |  2| |   ||   ||   ||   | ___  ___                          | |
|  |  0| Mon  Tue  Wed  Thu  Fri  Sat  Sun                      | |
|  |                                                            | |
|  |  Total: 23    Avg: 3.3/day    Best: Tue (7)                | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +---------------------------+  +------------------------------+ |
|  | Active Tasks              |  | Recent Activity              | |
|  | -------------------------+|  | ----------------------------+| |
|  |                          ||  |                             || |
|  | linkedin.com/jobs/...    ||  | 2m ago  Submitted app to    || |
|  | [Copilot] 62% [=====>]  ||  |         Acme Corp (LinkedIn)|| |
|  |                          ||  |                             || |
|  | greenhouse.io/company/.. ||  | 15m ago CAPTCHA solved for  || |
|  | [Copilot] 45% [===>  ]  ||  |         Startup Inc         || |
|  |                          ||  |                             || |
|  | No pending reviews       ||  | 1h ago  Application failed  || |
|  |                          ||  |         at Workday (timeout)|| |
|  +---------------------------+  +------------------------------+ |
|                                                                  |
+------------------------------------------------------------------+
```

### 7.3 New Dashboard Components

#### Active Sessions Card

Shows live count of tasks currently being processed by automation:

```typescript
interface ActiveSessionCardProps {
  count: number;
  sessions: Array<{
    taskId: string;
    platform: string;
    progress: number;
    currentStep: string;
  }>;
}
```

Visual: Green dot indicator (pulsing when count > 0), large number, brief list of
sessions with progress bars. Uses `variant="info"` badge for each session.

#### Today's Applications Card

```
+------------------+
| TODAY'S APPS     |
| 5                |
| Success: 4 (80%) |
| Failed:  1 (20%) |
+------------------+
```

Queries tasks created in the last 24 hours, groups by status.

#### Pending Reviews Card

```
+------------------+
| PENDING REVIEWS  |
| 1          [!]   |
| Task abc-123     |
| Waiting 3m       |
+------------------+
```

Highlights tasks in `waiting_human` status. The `[!]` is an amber pulsing indicator.
Clicking the card navigates to the task detail page.

#### Weekly Stats Chart

A simple bar chart showing applications per day for the current week. Implemented with
CSS grid bars (no external chart library needed for MVP):

```tsx
<div className="flex items-end gap-2 h-32">
  {weekData.map(day => (
    <div key={day.label} className="flex flex-col items-center flex-1">
      <div
        className="w-full rounded-t-[var(--wk-radius-sm)] bg-[var(--wk-copilot)]"
        style={{ height: `${(day.count / maxCount) * 100}%` }}
      />
      <span className="mt-1 text-xs text-[var(--wk-text-tertiary)]">
        {day.label}
      </span>
    </div>
  ))}
</div>
```

#### Recent Activity Feed

A real-time event feed driven by WebSocket messages. Each entry shows:
- Relative timestamp ("2m ago")
- Event description
- Task link

Events flow in via the existing `useTaskWebSocket` hook, but enhanced to listen on
a user-level channel (not just per-task).

```typescript
// New WebSocket subscription: user-level events
const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);
// No taskId filter -> receives events for all user's tasks
```

---

## 8. Settings Pages

### 8.1 Current State

The existing `SettingsPage` uses `Radix Tabs` with three tabs:
1. **Profile** (`ProfileSettings`) -- Name, email, phone, location
2. **Q&A Bank** (`QaBankSettings`) -- List of saved screening answers
3. **Automation** (`PreferencesSettings`) -- Copilot/Autopilot mode toggle

### 8.2 Enhanced Settings Tabs

Add two new tabs:
4. **Browser Profiles** -- AdsPower profile management
5. **Usage & Billing** -- Application counts, LLM costs, quota tracking

```
+------------------------------------------------------------------+
| Settings                                                         |
| Manage your profile, answers, and preferences                    |
+------------------------------------------------------------------+
| [Profile] [Q&A Bank] [Automation] [Browser] [Usage]              |
+------------------------------------------------------------------+
```

### 8.3 Enhanced Automation Preferences

#### ASCII Wireframe: Automation Settings

```
+------------------------------------------------------------------+
|  Automation Mode                                                 |
|  +-------------------------------+  +---------------------------+|
|  | [icon] Copilot               |  | [icon] Autopilot          ||
|  | AI fills, you review + submit|  | AI fills AND submits      ||
|  | [Active] (blue border)       |  | [Available] (if unlocked) ||
|  +-------------------------------+  +---------------------------+|
+------------------------------------------------------------------+
|                                                                  |
|  Confidence Thresholds                                           |
|  ----------------------------------------------------------------|
|                                                                  |
|  Auto-approve fields with confidence above:                      |
|  [==========|======] 0.85                                        |
|   0.5               1.0                                          |
|                                                                  |
|  Flag for review when confidence below:                          |
|  [====|==============] 0.70                                      |
|   0.5                  1.0                                       |
|                                                                  |
+------------------------------------------------------------------+
|                                                                  |
|  Notification Preferences                                        |
|  ----------------------------------------------------------------|
|                                                                  |
|  [x] Sound alerts for human takeover requests                    |
|  [x] Browser push notifications                                 |
|  [x] Email summary of daily applications                         |
|  [ ] Slack notifications (coming soon)                           |
|                                                                  |
+------------------------------------------------------------------+
|                                                                  |
|  Screenshot Retention                                            |
|  ----------------------------------------------------------------|
|                                                                  |
|  Keep confirmation screenshots for:                              |
|  [30 days] [60 days] [90 days]                                   |
|                                                                  |
|  Current: 30 days (GDPR default)                                 |
|                                                                  |
+------------------------------------------------------------------+
```

The confidence threshold sliders use a custom range input styled with Tailwind:

```tsx
<input
  type="range"
  min={0.5}
  max={1}
  step={0.05}
  value={threshold}
  onChange={(e) => setThreshold(parseFloat(e.target.value))}
  className="w-full h-2 bg-[var(--wk-surface-sunken)] rounded-full
             appearance-none cursor-pointer
             [&::-webkit-slider-thumb]:appearance-none
             [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
             [&::-webkit-slider-thumb]:rounded-full
             [&::-webkit-slider-thumb]:bg-[var(--wk-text-primary)]"
/>
```

### 8.4 Q&A Bank Enhancements

#### ASCII Wireframe: Enhanced Q&A Bank

```
+------------------------------------------------------------------+
|  Q&A Bank                                    [+ Add Answer]      |
+------------------------------------------------------------------+
|                                                                  |
|  Search: [Search questions or answers...              ] [Filter] |
|                                                                  |
|  +------------------------------------------------------------+ |
|  | Q: Why are you interested in this role?                     | |
|  | A: "I'm drawn to the opportunity to work on challenging..." | |
|  |                                                             | |
|  | [General]  Used 12 times   Mode: [Auto-use] [Review first] | |
|  |                                                  [Edit][Del]| |
|  +------------------------------------------------------------+ |
|  | Q: What is your expected salary?                            | |
|  | A: "I'm open to discussing compensation that reflects..."   | |
|  |                                                             | |
|  | [Salary]  Used 8 times    Mode: [Auto-use] [Review first]  | |
|  |                                                  [Edit][Del]| |
|  +------------------------------------------------------------+ |
|  | Q: Are you authorized to work in the US?                    | |
|  | A: "Yes"                                                    | |
|  |                                                             | |
|  | [Legal]   Used 15 times   Mode: [Auto-use] [Review first]  | |
|  |                                                  [Edit][Del]| |
|  +------------------------------------------------------------+ |
|                                                                  |
|  Showing 3 of 24 answers    [< Prev]  Page 1/8  [Next >]        |
|                                                                  |
+------------------------------------------------------------------+
```

New features:
- **Search bar** with debounced filtering
- **Category filter** dropdown (General, Salary, Legal, Technical, etc.)
- **Usage mode toggle** per answer: "Auto-use" (always use this answer) vs. "Review first" (flag for human review when this answer is selected)
- **Add Answer** modal with question/answer/category fields
- **Edit inline** -- clicking Edit converts the card to editable inputs
- **Pagination** using existing `PAGINATION` constants

### 8.5 Browser Profiles (New Tab)

#### ASCII Wireframe: Browser Profiles

```
+------------------------------------------------------------------+
|  Browser Profiles                            [+ Add Profile]     |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+ |
|  | Profile: Chrome-US-1                                        | |
|  | ---------------------------------------------------------- | |
|  | Browser:    Chrome 121         Fingerprint: [Unique]        | |
|  | Proxy:      us-east-1          Status:      [Connected]     | |
|  | IP:         203.0.113.42       Location:    New York, US    | |
|  | Last used:  2 hours ago                                     | |
|  |                                                             | |
|  |                          [Set Default]  [Edit]  [Delete]    | |
|  +------------------------------------------------------------+ |
|  | Profile: Chrome-US-2                                        | |
|  | ---------------------------------------------------------- | |
|  | Browser:    Chrome 121         Fingerprint: [Unique]        | |
|  | Proxy:      us-west-2          Status:      [Disconnected]  | |
|  | IP:         --                 Location:    --               | |
|  | Last used:  3 days ago                                      | |
|  |                                                             | |
|  |                          [Set Default]  [Edit]  [Delete]    | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  Note: Browser profiles are managed via AdsPower.                |
|  Valet syncs profiles automatically.                             |
|                                                                  |
+------------------------------------------------------------------+
```

### 8.6 Usage & Billing (New Tab)

#### ASCII Wireframe: Usage & Billing

```
+------------------------------------------------------------------+
|  Usage & Billing                                                 |
+------------------------------------------------------------------+
|                                                                  |
|  This Month (February 2026)                                      |
|  +---------------------------+  +------------------------------+ |
|  | Applications              |  | LLM Cost                     | |
|  | 47 / 100                  |  | $1.23                        | |
|  | [===============>    ]    |  | Avg: $0.026/app              | |
|  | 53 remaining              |  | Budget: $5.00/mo             | |
|  +---------------------------+  +------------------------------+ |
|  +---------------------------+  +------------------------------+ |
|  | Copilot Apps              |  | Autopilot Apps               | |
|  | 35                        |  | 12                           | |
|  | Success rate: 91%         |  | Success rate: 83%            | |
|  +---------------------------+  +------------------------------+ |
|                                                                  |
|  Rate Limits                                                     |
|  ----------------------------------------------------------------|
|  Copilot daily:     12 / 25                                      |
|  Autopilot daily:    4 / 10                                      |
|  Resume uploads:     2 / 10                                      |
|  Q&A entries:       24 / 500                                     |
|                                                                  |
|  Cost Breakdown                                                  |
|  ----------------------------------------------------------------|
|  | Date       | Task          | Tokens    | Cost     |          |
|  |------------|---------------|-----------|----------|          |
|  | Feb 12     | Acme Corp     | 529       | $0.003   |          |
|  | Feb 12     | Startup Inc   | 1,245     | $0.008   |          |
|  | Feb 11     | BigCo         | 892       | $0.005   |          |
|  | ...        | ...           | ...       | ...      |          |
|                                                                  |
+------------------------------------------------------------------+
```

Rate limits reference the constants from `packages/shared/src/constants/limits.ts`:
- `RATE_LIMITS.COPILOT_DAILY` (25)
- `RATE_LIMITS.AUTOPILOT_DAILY` (10)
- `RATE_LIMITS.RESUME_UPLOADS_DAILY` (10)
- `RATE_LIMITS.QA_ENTRIES_MAX` (500)

---

## 9. Error States

### 9.1 Error State Catalog

Every failure mode in the system requires a designed error state. Errors arrive via the
`error` WebSocket message type:

```typescript
{
  type: "error",
  taskId: "abc-123",
  code: "SANDBOX_TIMEOUT",
  message: "Browser failed to start within 30 seconds",
  recoverable: true
}
```

### 9.2 Error State Designs

#### Sandbox Failed to Start

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |  [AlertTriangle icon, amber]                                | |
|  |                                                             | |
|  |  Browser Failed to Start                                    | |
|  |                                                             | |
|  |  We couldn't launch the browser environment.                | |
|  |  This usually resolves itself -- try again in a moment.     | |
|  |                                                             | |
|  |  Error: SANDBOX_TIMEOUT                                     | |
|  |                                                             | |
|  |  [========= Retry =========]    [Cancel Task]               | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

- Variant: `bg-amber-50 border-[var(--wk-status-warning)]`
- Retry: POST `/api/v1/tasks/:id/retry`
- Shows after 30s timeout during `starting_browser` step

#### Browser Crashed Mid-Application

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |  [XCircle icon, red]                                        | |
|  |                                                             | |
|  |  Browser Disconnected                                       | |
|  |                                                             | |
|  |  The browser session ended unexpectedly while filling       | |
|  |  your application. Your progress up to this point has       | |
|  |  been saved.                                                | |
|  |                                                             | |
|  |  Error: BROWSER_CRASHED                                     | |
|  |  Last step: filling_form (field 8 of 12)                    | |
|  |                                                             | |
|  |  [========= Retry =========]    [Cancel Task]               | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

- Variant: `bg-red-50 border-[var(--wk-status-error)]`
- Retry starts a new sandbox but attempts to resume from last checkpoint

#### Application Timeout

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |  [Clock icon, amber]                                        | |
|  |                                                             | |
|  |  Application Timed Out                                      | |
|  |                                                             | |
|  |  The application process took longer than 5 minutes.        | |
|  |  This can happen with complex multi-page forms.             | |
|  |                                                             | |
|  |  Error: TASK_TIMEOUT                                        | |
|  |  Progress: 62% (filling_form)                               | |
|  |                                                             | |
|  |  [===== Retry =====]  [View Progress]  [Cancel]             | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

- "View Progress" scrolls to the progress stepper to see what was accomplished

#### Budget / Rate Limit Exceeded

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |  [Ban icon, gray]                                           | |
|  |                                                             | |
|  |  Daily Application Limit Reached                            | |
|  |                                                             | |
|  |  You've used all 25 Copilot applications for today.         | |
|  |  Your limit resets at midnight UTC.                          | |
|  |                                                             | |
|  |  Resets in: 4h 23m                                          | |
|  |                                                             | |
|  |  [View Usage]              [Back to Dashboard]              | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

- "View Usage" navigates to Settings > Usage & Billing tab
- Rate limits from `RATE_LIMITS.COPILOT_DAILY` (25) and `RATE_LIMITS.AUTOPILOT_DAILY` (10)

#### Platform Blocked

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |  [ShieldAlert icon, red]                                    | |
|  |                                                             | |
|  |  Platform Detected Unusual Activity                         | |
|  |                                                             | |
|  |  LinkedIn has flagged this session. We've paused all        | |
|  |  LinkedIn applications to protect your account.             | |
|  |                                                             | |
|  |  Recommendation: Wait 24 hours before trying again.         | |
|  |  Consider using a different browser profile.                | |
|  |                                                             | |
|  |  Error: PLATFORM_BLOCKED                                    | |
|  |  Platform: LinkedIn                                         | |
|  |                                                             | |
|  |  [Manage Browser Profiles]     [Back to Dashboard]          | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

- "Manage Browser Profiles" navigates to Settings > Browser Profiles tab
- This error is **not recoverable** via simple retry

#### Network / WebSocket Disconnection

```
+------------------------------------------------------------------+
|  +------------------------------------------------------------+ |
|  |  [WifiOff icon, amber]                                      | |
|  |                                                             | |
|  |  Connection Lost                                            | |
|  |                                                             | |
|  |  Lost connection to the Valet server. Your task is still    | |
|  |  running in the background.                                 | |
|  |                                                             | |
|  |  Reconnecting in 3s... (attempt 2 of 10)                    | |
|  |                                                             | |
|  |  [Reconnect Now]                                            | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

- Uses exponential backoff from `WS_CONFIG.RECONNECT_BASE_DELAY_MS` (1000ms)
- Max delay: `WS_CONFIG.RECONNECT_MAX_DELAY_MS` (30000ms)
- After 10 failed attempts, shows permanent error with refresh suggestion

### 9.3 Error Banner Component

All error states share a common layout component:

```typescript
interface ErrorBannerProps {
  icon: LucideIcon;
  title: string;
  description: string;
  errorCode?: string;
  details?: string;
  variant: "warning" | "error" | "info";
  actions: Array<{
    label: string;
    variant: ButtonProps["variant"];
    onClick: () => void;
    disabled?: boolean;
  }>;
}
```

---

## 10. Component Inventory

### 10.1 New Components Required

| Component | Location | Radix Primitives | Priority |
|-----------|----------|------------------|----------|
| `BrowserViewer` | `features/tasks/components/browser-viewer.tsx` | None (noVNC wrapper) | P0 |
| `TakeoverModal` | `features/tasks/components/takeover-modal.tsx` | `Dialog` | P0 |
| `FieldReviewPanel` | `features/tasks/components/field-review-panel.tsx` | `ScrollArea`, `Collapsible` | P0 |
| `ProgressLog` | `features/tasks/components/progress-log.tsx` | `ScrollArea` | P0 |
| `ScreenshotPreview` | `features/tasks/components/screenshot-preview.tsx` | `Dialog` (for enlarge) | P1 |
| `ConfidenceBadge` | `features/tasks/components/confidence-badge.tsx` | None (wraps `Badge`) | P1 |
| `VncControlBar` | `features/tasks/components/vnc-control-bar.tsx` | None | P1 |
| `ErrorBanner` | `components/common/error-banner.tsx` | None | P1 |
| `ActiveSessionCard` | `features/dashboard/components/active-session-card.tsx` | None | P2 |
| `WeeklyChart` | `features/dashboard/components/weekly-chart.tsx` | None | P2 |
| `ActivityFeed` | `features/dashboard/components/activity-feed.tsx` | `ScrollArea` | P2 |
| `QABankManager` | `features/settings/components/qa-bank-manager.tsx` | `Dialog`, `ScrollArea` | P2 |
| `BrowserProfileList` | `features/settings/components/browser-profile-list.tsx` | None | P3 |
| `UsageDashboard` | `features/settings/components/usage-dashboard.tsx` | None | P3 |
| `ConfidenceSlider` | `features/settings/components/confidence-slider.tsx` | None (range input) | P3 |
| `IdleOverlay` | `features/tasks/components/idle-overlay.tsx` | None | P3 |

### 10.2 Enhanced Existing Components

| Component | Enhancement | File |
|-----------|------------|------|
| `TaskProgress` | Add sub-steps, ETA, duration, animations | `features/tasks/components/task-progress.tsx` |
| `TaskDetail` | Two-column layout, screenshot preview, action log | `features/tasks/components/task-detail.tsx` |
| `Sidebar` | Badge count for pending reviews | `components/layout/sidebar.tsx` |
| `Header` | Notification bell with count, dropdown | `components/layout/header.tsx` |
| `StatsCards` | Add Active Sessions, Today's Apps, Success Rate | `features/dashboard/components/stats-cards.tsx` |
| `QaBankSettings` | Search, filter, pagination, usage mode | `features/settings/components/qa-bank-settings.tsx` |
| `PreferencesSettings` | Confidence sliders, notification prefs, retention | `features/settings/components/preferences-settings.tsx` |

### 10.3 New Hooks Required

| Hook | Purpose | File |
|------|---------|------|
| `useUserWebSocket` | User-level WS for dashboard activity feed | `hooks/use-user-websocket.ts` |
| `useVncConnection` | noVNC lifecycle management | `features/tasks/hooks/use-vnc-connection.ts` |
| `useIdleDetection` | Track user activity in VNC session | `features/tasks/hooks/use-idle-detection.ts` |
| `useNotificationSound` | Play audio on human_needed events | `hooks/use-notification-sound.ts` |
| `usePushNotifications` | Browser push notification API | `hooks/use-push-notifications.ts` |
| `useScreenshotPoller` | Poll/subscribe to screenshot updates | `features/tasks/hooks/use-screenshot-poller.ts` |

### 10.4 New Shared Types / Schemas

| Schema | Purpose | File |
|--------|---------|------|
| `stepEtaMessage` | WebSocket ETA per step | `packages/shared/src/types/ws.ts` |
| `browserProfileSchema` | AdsPower profile metadata | `packages/shared/src/schemas/browser-profile.schema.ts` |
| `usageStatsSchema` | Monthly usage/cost aggregation | `packages/shared/src/schemas/usage.schema.ts` |

### 10.5 New UI Primitives Needed

The following Radix primitives should be added to `@valet/ui`:

| Primitive | Use Case |
|-----------|----------|
| `ScrollArea` | ProgressLog, FieldReviewPanel, QABankManager |
| `Collapsible` | Application result expandable sections |
| `Slider` | Confidence threshold settings |
| `Switch` | Notification toggle preferences |
| `Separator` | Visual dividers in settings |
| `Progress` | Progress bars in stats cards |
| `Sheet` | Mobile takeover side panel (alternative to Dialog) |

---

## Appendix A: Design Token Reference

All components reference the WeKruit design token system via CSS custom properties:

| Token | Usage |
|-------|-------|
| `--wk-surface-page` | Page background |
| `--wk-surface-card` | Card backgrounds |
| `--wk-surface-white` | Dialog, input backgrounds |
| `--wk-surface-raised` | Hover states |
| `--wk-surface-sunken` | Inactive, disabled backgrounds |
| `--wk-surface-overlay` | Modal overlay with backdrop-blur |
| `--wk-text-primary` | Primary text, buttons |
| `--wk-text-secondary` | Supporting text |
| `--wk-text-tertiary` | Muted labels, timestamps |
| `--wk-border-subtle` | Card borders, dividers |
| `--wk-border-default` | Input borders |
| `--wk-border-strong` | Focus rings |
| `--wk-status-success` | Completed, high confidence |
| `--wk-status-warning` | Needs attention, medium confidence |
| `--wk-status-error` | Failed, low confidence |
| `--wk-copilot` | Copilot mode accent (blue) |
| `--wk-autopilot` | Autopilot mode accent (purple) |
| `--wk-radius-sm` through `--wk-radius-full` | Border radius scale |
| `--wk-shadow-sm` through `--wk-shadow-xl` | Shadow scale |
| `--wk-duration-fast` / `--wk-duration-base` | Animation durations |
| `--wk-ease-default` | Easing function |

## Appendix B: Accessibility Considerations

| Area | Requirement |
|------|-------------|
| VNC Viewer | Announce connection state changes via `aria-live="polite"` |
| Progress Stepper | `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` |
| Confidence Badges | Include `aria-label` with descriptive text ("High confidence: 0.95") |
| Toast Notifications | Already handled by Radix Toast with `role="alert"` |
| Takeover Modal | Focus trap (Radix Dialog), announce "Take Over" as urgent via `aria-live="assertive"` |
| Error Banners | `role="alert"` for recoverable, `role="alertdialog"` for blocking errors |
| Keyboard Navigation | All interactive elements reachable via Tab, VNC toggle for keyboard capture |
| Color Contrast | All confidence badge text meets WCAG 2.1 AA (4.5:1 ratio) |
| Screen Reader | ProgressLog entries announced via `aria-live="polite"` region |

## Appendix C: Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Screenshot polling (5s interval) | Use `requestIdleCallback` for image decode; lazy-load full-res |
| WebSocket message volume | Client-side throttle progress messages to 1/second for rendering |
| ProgressLog growth | Virtual scroll (or cap at 200 entries, archive older) |
| noVNC canvas rendering | Quality level 6 (of 9); reduce to 3 on slow connections |
| Dashboard multiple queries | Combine into single stats endpoint; use `staleTime: 30s` |
| Activity feed updates | Batch DOM updates using `React.startTransition` |
