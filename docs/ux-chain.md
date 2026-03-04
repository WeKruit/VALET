# UX Chain Specification

> Canonical reference for every surface a VALET user touches, in order.
> This document is the single source of truth for route ownership, transition types,
> layout contracts, and state management across the product.

## Chain Overview

The VALET UX is a 10-stage pipeline. Every stage maps to exactly one route (or an
in-place transition within a route). Users move left-to-right through the chain;
backward navigation is always available but never forced.

```
1. Landing       /                    (public)
2. Onboarding    /onboarding          (auth, no sidebar)
3. Workbench     /apply               (auth, 3-pane layout)
4. Fit Lab       /apply?panel=fitlab  (in-place, right sidecar)
5. Live Exec     /tasks/:id           (auth, execution monitor)
6. Intervention  /tasks/:id           (in-place, HITL overlay)
7. Proof Pack    /tasks/:id           (in-place, proof tab)
8. Tracker       /tasks               (auth, list + filters)
9. Insights      /insights            (auth, analytics)
10. Settings     /settings            (auth, tabbed config)
```

Auxiliary routes (not part of the main chain):

| Route                      | Purpose                  | Visibility |
| -------------------------- | ------------------------ | ---------- |
| `/dashboard`               | Overview / home redirect | Customer   |
| `/jobs`                    | Job inbox (future)       | Customer   |
| `/pricing`                 | Billing plans            | Customer   |
| `/browser-session/:token`  | Live browser view (HITL) | Token-auth |
| `/admin/*`                 | Admin panel              | Internal   |
| `/operation-admin/*`       | Ops panel                | Internal   |
| `/early-access`            | Waitlist gate            | Customer   |
| `/legal/*`                 | Terms, privacy           | Public     |
| `/login`, `/register`, etc | Auth flows               | Public     |

---

## Stage Definitions

### Stage 1 -- Landing

| Field              | Value                                          |
| ------------------ | ---------------------------------------------- |
| **Route**          | `/`                                            |
| **Component**      | `LandingPage`                                  |
| **Auth**           | None (public)                                  |
| **Layout**         | Full-bleed, no sidebar, no header              |
| **What user does** | Learns value prop, clicks "Get Started"        |
| **State owned**    | None                                           |
| **Transition**     | Page navigation to `/register` or `/login`     |
| **Trust signal**   | Social proof, security messaging, public brand |

### Stage 2 -- Onboarding / Readiness

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| **Route**          | `/onboarding` (with sub-steps: upload, review, disclaimer)           |
| **Component**      | `OnboardingPage`                                                     |
| **Auth**           | Required (AuthGuard), but no sidebar layout                          |
| **Layout**         | Centered card, progress stepper, no sidebar or header                |
| **What user does** | Uploads resume, reviews parsed profile, accepts copilot disclaimer   |
| **State owned**    | `OnboardingStep` (local useState: upload -> review -> disclaimer)    |
| **Transition**     | In-place step transitions; final step hard-redirects to `/dashboard` |
| **Trust signal**   | Explicit consent step, user reviews every parsed field before saving |

Current steps: `upload` -> `review` -> `disclaimer`. Future: expands to 10-step
autonomy readiness flow (see `docs/ux-onboarding.md`).

### Stage 3 -- Workbench

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Route**          | `/apply`                                                   |
| **Component**      | `ApplyPage` (currently simple form; will become 3-pane)    |
| **Auth**           | Required                                                   |
| **Layout**         | AppLayout (sidebar + header); future: 3-pane workbench     |
| **What user does** | Pastes job URL, configures application, triggers submit    |
| **State owned**    | Job URL, selected resume, form answers, apply config       |
| **Transition**     | Submit creates task -> navigates to `/tasks/:id`           |
| **Trust signal**   | User sees exactly what will be submitted before confirming |

**Future 3-pane layout** (see Workbench Layout Spec below):

- Left rail: job details + requirements extracted from URL
- Center: application form / answer editor
- Right sidecar: fit lab, preview, resume match score

### Stage 4 -- Fit Lab

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Route**          | `/apply?panel=fitlab` (in-place within workbench right sidecar) |
| **Component**      | `FitLabPanel` (future)                                          |
| **Auth**           | Required (inherited from workbench)                             |
| **Layout**         | Right sidecar pane of workbench                                 |
| **What user does** | Reviews resume-to-job match score, edits resume variant         |
| **State owned**    | Resume variant draft, match analysis results                    |
| **Transition**     | In-place panel switch (URL param change, no page nav)           |
| **Trust signal**   | Shows exactly which resume sections match which requirements    |

### Stage 5 -- Live Execution

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| **Route**          | `/tasks/:id`                                                    |
| **Component**      | `TaskDetailPage` -> `TaskDetail`                                |
| **Auth**           | Required                                                        |
| **Layout**         | AppLayout with task detail view                                 |
| **What user does** | Watches application progress, sees step-by-step status          |
| **State owned**    | Task status (via WebSocket), step events, browser session state |
| **Transition**     | Page navigation from `/tasks` list or post-submit redirect      |
| **Trust signal**   | Real-time status updates, live browser view link                |

The browser session viewer (`/browser-session/:token`) opens in a new tab/window.
It uses token-based auth (no login required) and shows a live screenshot stream
from the GhostHands worker with click/type/scroll interactivity.

### Stage 6 -- Intervention / Recovery

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Route**          | `/tasks/:id` (in-place, same page as live execution)       |
| **Component**      | HITL overlay within `TaskDetail`                           |
| **Auth**           | Required                                                   |
| **Layout**         | Overlay/banner on task detail page                         |
| **What user does** | Resolves blocker (captcha, MFA, custom question)           |
| **State owned**    | Blocker type, user response, resolution status             |
| **Transition**     | In-place state change; task resumes after resolution       |
| **Trust signal**   | Clear blocker description, user always controls resolution |

When GhostHands returns `needs_human`, the task enters `waiting_human` status.
The UI shows an attention banner with the blocker details and action buttons.
After user resolves, VALET calls `GhostHandsClient.resumeJob()`.

### Stage 7 -- Submission Proof Pack

| Field              | Value                                                       |
| ------------------ | ----------------------------------------------------------- |
| **Route**          | `/tasks/:id` (in-place tab/section within task detail)      |
| **Component**      | `ProofPack` (future, tab within TaskDetail)                 |
| **Auth**           | Required                                                    |
| **Layout**         | Tab or section within task detail view                      |
| **What user does** | Reviews confirmation screenshot, submitted answers, receipt |
| **State owned**    | Proof artifacts (screenshots, form data, timestamps)        |
| **Transition**     | In-place tab switch within task detail                      |
| **Trust signal**   | Immutable proof of what was submitted, when, and to whom    |

### Stage 8 -- Tracker

| Field              | Value                                                        |
| ------------------ | ------------------------------------------------------------ |
| **Route**          | `/tasks`                                                     |
| **Component**      | `TasksPage`                                                  |
| **Auth**           | Required                                                     |
| **Layout**         | AppLayout, list view with search/filter/sort/pagination      |
| **What user does** | Browses all applications, filters by status, exports CSV     |
| **State owned**    | Filter state (URL search params: page, status, sort, search) |
| **Transition**     | Click row -> page navigation to `/tasks/:id`                 |
| **Trust signal**   | Complete history, nothing hidden, export always available    |

### Stage 9 -- Insights

| Field              | Value                                                      |
| ------------------ | ---------------------------------------------------------- |
| **Route**          | `/insights` (new, not yet implemented)                     |
| **Component**      | `InsightsPage` (future)                                    |
| **Auth**           | Required                                                   |
| **Layout**         | AppLayout, dashboard-style charts and metrics              |
| **What user does** | Reviews application analytics, success rates, trends       |
| **State owned**    | Date range, metric filters (URL params)                    |
| **Transition**     | Page navigation from sidebar; drill-down links to `/tasks` |
| **Trust signal**   | Data derived from real submissions, no vanity metrics      |

### Stage 10 -- Settings

| Field              | Value                                                         |
| ------------------ | ------------------------------------------------------------- | ------- | ------- | ----- |
| **Route**          | `/settings` (with `?tab=` param)                              |
| **Component**      | `SettingsPage`                                                |
| **Auth**           | Required                                                      |
| **Layout**         | AppLayout, tabbed interface                                   |
| **What user does** | Manages resumes, profile, Q&A bank, automation prefs, billing |
| **State owned**    | Active tab (URL param `?tab=resumes                           | profile | answers | ...`) |
| **Transition**     | In-place tab switches (URL param change)                      |
| **Trust signal**   | User controls all personal data, clear billing transparency   |

Current tabs: resumes, profile, answers, automation, job-preferences,
notifications, sessions, billing.

---

## Transition Types

Every transition in VALET is one of two types:

### Page Navigation (browser URL changes, new component tree)

| From             | To                      | Trigger                               |
| ---------------- | ----------------------- | ------------------------------------- |
| `/`              | `/register` or `/login` | CTA button click                      |
| `/login`         | `/onboarding`           | First login (no consent)              |
| `/login`         | `/dashboard`            | Returning user                        |
| `/onboarding`    | `/dashboard`            | Final onboarding step (hard redirect) |
| `/dashboard`     | `/apply`                | "New Application" button              |
| `/dashboard`     | `/tasks/:id`            | Active task card click                |
| `/tasks`         | `/tasks/:id`            | Row click                             |
| `/tasks/:id`     | `/tasks`                | Back button                           |
| `/apply`         | `/tasks/:id`            | Post-submit redirect                  |
| Any sidebar link | Target route            | Sidebar nav click                     |

### In-Place Transition (same route, state/panel changes)

| Route         | Transition                                        | Mechanism                      |
| ------------- | ------------------------------------------------- | ------------------------------ |
| `/onboarding` | Step progression (upload -> review -> disclaimer) | Local state (`useState`)       |
| `/apply`      | Workbench pane switches (future)                  | URL param `?panel=`            |
| `/tasks/:id`  | Execution -> Intervention overlay                 | Task status change (WebSocket) |
| `/tasks/:id`  | Tab switches (progress, proof, etc.)              | URL param or local state       |
| `/settings`   | Tab switches                                      | URL param `?tab=`              |
| `/tasks`      | Filter/sort/page changes                          | URL search params              |
| `/insights`   | Date range, metric filter changes                 | URL search params              |

---

## Customer-Facing vs Internal-Only

### Customer-Facing Surfaces

All routes within `AppLayout` that are NOT behind `AdminGuard`:

- `/dashboard` -- overview home
- `/apply` -- workbench
- `/tasks` -- application tracker
- `/tasks/:id` -- application detail / live execution
- `/settings/*` -- user configuration
- `/pricing` -- billing plans
- `/insights` -- analytics (future)
- `/jobs` -- job inbox (future)

Plus standalone surfaces:

- `/` -- landing page
- `/onboarding` -- first-run flow
- `/browser-session/:token` -- live browser view (opened from task detail)
- `/early-access` -- waitlist gate

### Internal-Only Surfaces

All routes behind `AdminGuard`:

- `/admin/tasks` -- task management
- `/admin/sandboxes` and `/admin/sandboxes/:id` -- sandbox management
- `/admin/deploys` -- deployment management
- `/admin/monitoring` -- system monitoring
- `/admin/sessions` -- session management
- `/admin/workers` -- worker fleet
- `/admin/secrets` -- secrets status
- `/operation-admin/*` -- early access admin, email templates

---

## Current Route Mapping

How existing routes map to chain stages:

| Current Route | Chain Stage                        | Notes                                 |
| ------------- | ---------------------------------- | ------------------------------------- |
| `/`           | 1. Landing                         | Unchanged                             |
| `/onboarding` | 2. Onboarding                      | Will expand to 10-step readiness flow |
| `/dashboard`  | Auxiliary (home)                   | Overview; not a chain stage itself    |
| `/apply`      | 3. Workbench                       | Currently simple form; becomes 3-pane |
| `/tasks/:id`  | 5/6/7. Exec + Intervention + Proof | Three chain stages share one route    |
| `/tasks`      | 8. Tracker                         | Unchanged                             |
| `/settings`   | 10. Settings                       | Unchanged                             |

### New Routes

| New Route             | Chain Stage | Status                                      |
| --------------------- | ----------- | ------------------------------------------- |
| `/apply?panel=fitlab` | 4. Fit Lab  | Future; in-place sidecar within workbench   |
| `/insights`           | 9. Insights | Future; new page                            |
| `/jobs`               | Auxiliary   | Future; job inbox for saved/discovered jobs |

---

## Workbench 3-Pane Layout Spec

The `/apply` route will evolve from a simple form into a workbench with three
panes. This is the operational home -- where users spend the most time.

```
+------------------+-------------------------+--------------------+
|   LEFT RAIL      |       CENTER            |   RIGHT SIDECAR    |
|   (280px fixed)  |       (flex-1)          |   (360px fixed)    |
|                  |                         |                    |
|  Job Details     |  Application Form       |  Panel Switcher:   |
|  - Company       |  - Resume selector      |  - Preview         |
|  - Title         |  - Cover letter         |  - Fit Lab         |
|  - Requirements  |  - Q&A answers          |  - Match Score     |
|  - Location      |  - Custom fields        |  - Notes           |
|  - Salary        |                         |                    |
|  - Deadline      |  Submit Button          |                    |
|                  |                         |                    |
+------------------+-------------------------+--------------------+
```

### Pane Behavior

- **Left rail**: Read-only. Populated when user pastes job URL (auto-extracted).
  Collapsible on medium screens. Hidden on mobile (accessible via sheet).
- **Center**: Primary interaction area. Contains the apply form, resume selector,
  and submit button. Always visible.
- **Right sidecar**: Contextual panels switched via `?panel=` URL param.
  Default panel: preview. Collapsible on medium screens. Hidden on mobile
  (accessible via sheet or bottom drawer).

### URL Param Contract

```
/apply                        -> center form, default sidecar (preview)
/apply?panel=fitlab           -> sidecar shows fit lab
/apply?panel=preview          -> sidecar shows submission preview
/apply?panel=notes            -> sidecar shows notes
/apply?url=https://...        -> pre-fill job URL from external source
```

### Responsive Behavior

| Breakpoint     | Layout                                  |
| -------------- | --------------------------------------- |
| >= 1280px (xl) | All three panes visible                 |
| >= 768px (md)  | Center + one collapsible side pane      |
| < 768px (sm)   | Center only; side panes in bottom sheet |

---

## Mobile Behavior

### Navigation

Mobile uses the existing Sheet-based sidebar (already implemented in `AppLayout`).
The hamburger menu in the header opens a slide-in drawer with the full nav.

### Workbench on Mobile

On screens < 768px, the workbench collapses to a single-column layout:

- Center form is primary view
- Left rail content moves to an expandable section at the top
- Right sidecar opens as a bottom sheet (triggered by tab bar or button)

### Task Detail on Mobile

- Full-width single column
- Live browser view opens in new tab (same as desktop)
- HITL intervention shows as full-screen modal

### Future: Tab Bar

For authenticated mobile views, consider a bottom tab bar with:

- Dashboard (home)
- Applications (tracker)
- Apply (workbench)
- Settings

This replaces the hamburger sidebar for the 4 primary destinations.

---

## State Management Approach

### URL Parameters (source of truth for shareable state)

Used for any state that should survive refresh, be shareable via link, or
drive browser back/forward behavior:

| Route        | Param                                      | Purpose                            |
| ------------ | ------------------------------------------ | ---------------------------------- |
| `/tasks`     | `?page=`, `?status=`, `?sort=`, `?search=` | List filters                       |
| `/settings`  | `?tab=resumes`                             | Active settings tab                |
| `/apply`     | `?panel=fitlab`, `?url=`                   | Active sidecar panel, pre-fill URL |
| `/insights`  | `?range=`, `?metric=`                      | Date range, selected metric        |
| `/tasks/:id` | Path param `:taskId`                       | Selected task                      |

### Zustand (client-side persistent state)

Currently used for UI preferences that persist across sessions:

- `useUIStore`: sidebar collapsed state, mobile sidebar open, theme
- `useAuth`: user data, tokens, login/logout

Future additions:

- `useWorkbenchStore`: draft application state (job URL, selected resume,
  form answers) -- persisted to survive accidental navigation
- `useNotificationStore`: unread count, notification preferences

### React Query (server state cache)

All API data flows through ts-rest + React Query:

- Task list and detail data
- User profile
- Dashboard stats
- Resume list

React Query handles caching, refetching, and optimistic updates.
WebSocket events trigger query invalidation for real-time updates.

### Local Component State (useState)

Used only for transient UI state that does not survive unmount:

- Onboarding step progression
- Dropdown open/close
- Form input values before submission
- Modal visibility

### State Flow Diagram

```
URL params ──> Component renders with param values
                    │
React Query ──> Server data populates UI
                    │
Zustand ─────> Persistent UI preferences applied
                    │
useState ────> Transient interaction state
                    │
WebSocket ───> Real-time updates invalidate React Query cache
```

---

## Trust and Visibility Principles

These principles apply at every stage of the chain:

1. **No hidden actions**: The user always sees what VALET will do before it does it.
   - Onboarding: user reviews every parsed field
   - Workbench: preview panel shows exactly what will be submitted
   - Execution: live status stream, optional browser view

2. **Full history**: Nothing is deleted or hidden from the user.
   - Tracker shows all applications regardless of status
   - Export is always available (CSV)
   - Proof pack preserves immutable submission evidence

3. **User controls escalation**: VALET never bypasses user authority.
   - HITL blockers require explicit user resolution
   - Automation preferences are opt-in per capability
   - Browser sessions are view-only unless user explicitly interacts

4. **Transparent state**: The user always knows the system's state.
   - WebSocket connection indicator (live/connecting/offline)
   - Task status badges with clear labels
   - No loading states without context (always say what is loading)

5. **Safe defaults**: Conservative behavior unless user opts into more autonomy.
   - New users start with copilot mode (review before submit)
   - Automation level is configurable in settings
   - Destructive actions require confirmation

---

## Dashboard Role

`/dashboard` is not a chain stage -- it is a **home screen** that provides:

- Welcome message with user name
- Stats cards (total applications, active, completed, failed)
- Attention needed section (tasks requiring human intervention)
- Active tasks list (currently running)
- Recent applications list
- Application trends chart
- Platform breakdown chart
- Live WebSocket status indicator

The dashboard is the default post-login destination. It links into the chain
at multiple points: "New Application" -> workbench, task cards -> task detail,
attention items -> intervention.

---

## Jobs Route (Future)

`/jobs` will serve as a **job inbox** where users can:

- Browse discovered job listings (from integrated job boards)
- Save jobs for later application
- Quick-apply from the inbox (navigates to `/apply?url=...`)
- Filter by company, role, location, match score

This is an auxiliary route that feeds into Stage 3 (Workbench) but is not
itself a chain stage. Jobs are input; the chain starts when the user decides
to apply.

---

## Sidebar Navigation

Current sidebar nav items (from `sidebar.tsx`):

| Label        | Route        | Icon            | Chain Stage      |
| ------------ | ------------ | --------------- | ---------------- |
| Dashboard    | `/dashboard` | LayoutDashboard | Home (auxiliary) |
| Applications | `/tasks`     | ListTodo        | 8. Tracker       |
| Apply        | `/apply`     | Send            | 3. Workbench     |
| Settings     | `/settings`  | Settings        | 10. Settings     |

Future additions:

| Label    | Route       | Icon      | Chain Stage       |
| -------- | ----------- | --------- | ----------------- |
| Jobs     | `/jobs`     | Briefcase | Auxiliary (inbox) |
| Insights | `/insights` | BarChart3 | 9. Insights       |

The sidebar order should follow the natural chain flow: Dashboard, Jobs,
Apply, Applications, Insights, Settings.
