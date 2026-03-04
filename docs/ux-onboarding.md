# UX Onboarding Spec — Autonomy Readiness Flow

> **Status:** Draft spec (Phase 0 hard gate)
> **Owner:** Product / UX
> **Route:** `/onboarding` (auth-guarded, redirects to `/workbench` on completion)
> **Implements:** 10-step progressive onboarding replacing the current 3-step flow

---

## Table of Contents

1. [Overview](#1-overview)
2. [Current State (What Exists Today)](#2-current-state)
3. [Autonomy Levels](#3-autonomy-levels)
4. [10-Step Screen Sequence](#4-10-step-screen-sequence)
5. [Gmail Readiness Guidance](#5-gmail-readiness-guidance)
6. [Platform Credential Requirements](#6-platform-credential-requirements)
7. [Credential Trust & Security Copy](#7-credential-trust--security-copy)
8. [Existing Blocker / Verification Behavior](#8-existing-blocker--verification-behavior)
9. [Minimum Profile & Q/A Fields](#9-minimum-profile--qa-fields)
10. [Autonomy Readiness Check](#10-autonomy-readiness-check)
11. [Route & State Ownership](#11-route--state-ownership)
12. [Data Model Dependencies](#12-data-model-dependencies)

---

## 1. Overview

The onboarding flow is a **hard gate** between login and the workbench. Its purpose is to collect enough information to determine the user's **autonomy level** — how much VALET can do without human intervention. A user who provides credentials and a dedicated Gmail gets **full autonomy**. A user who skips credentials gets **copilot-only** mode where every application requires manual login resolution.

**Key principles:**

- Every screen must have a clear "why this matters" explanation
- Users can skip credential steps — but the readiness result honestly tells them the consequence
- No data is sent to GhostHands until the user enters the workbench
- All credential storage is opt-in with explicit trust copy

---

## 2. Current State

### What exists today (`apps/web/src/features/onboarding/`)

| Step          | Component             | What it does                                                                                                                    |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Upload     | `resume-upload.tsx`   | Drag-and-drop PDF/DOCX upload, calls `POST /api/v1/resumes`, max 10MB                                                           |
| 2. Review     | `quick-review.tsx`    | Shows parsed name/email/phone/location/experience/education/skills. User can edit phone, location, experience, education.       |
| 3. Disclaimer | `disclaimer-step.tsx` | Layer 2 copilot disclaimer with two checkboxes (risk acknowledgment + ToS/Privacy). Records consent via `POST /api/v1/consent`. |

### Auth guard behavior (`auth-guard.tsx`)

- **Onboarding completeness check:** `hasResumes && copilotAccepted`
- If incomplete and not on `/onboarding` -> redirect to `/onboarding`
- If complete and on `/onboarding` -> redirect to `/dashboard`
- Early access gate: users with role `"user"` (waitlisted) are redirected to `/early-access` regardless

### What's missing

The current flow collects resume + basic profile + consent. It does **not**:

- Explain what VALET will do (autonomy explanation)
- Collect Gmail/mailbox credentials for verification code retrieval
- Collect platform credentials (LinkedIn, Workday, etc.)
- Explain credential security
- Collect job preferences (roles, locations, salary, exclusions)
- Run an autonomy readiness assessment
- Show a readiness result with downgrade reasons

---

## 3. Autonomy Levels

### Internal enum values

| Level         | Internal value | DB column              |
| ------------- | -------------- | ---------------------- |
| Full Autonomy | `full`         | `users.autonomy_level` |
| Assisted      | `assisted`     | `users.autonomy_level` |
| Copilot Only  | `copilot_only` | `users.autonomy_level` |

### User-facing language

| Level         | Badge text    | Tagline                       | Explanation shown to user                                                                                                                                                                                |
| ------------- | ------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Autonomy | **Full Auto** | "VALET handles everything"    | "VALET can log in, apply, handle verification codes, and submit applications without interrupting you. You review results after the fact."                                                               |
| Assisted      | **Assisted**  | "VALET does most of the work" | "VALET can log in and fill applications, but will pause and ask you when it hits a verification code or 2FA prompt. You'll get a notification and can respond from your phone."                          |
| Copilot Only  | **Copilot**   | "You drive, VALET assists"    | "VALET fills in application fields using your profile, but you'll need to log in to each platform yourself and approve each submission. Best for getting started — you can upgrade anytime in Settings." |

### What determines each level

| Requirement                                            | Full | Assisted | Copilot |
| ------------------------------------------------------ | ---- | -------- | ------- |
| Resume uploaded                                        | Yes  | Yes      | Yes     |
| Profile basics complete (name, email, phone, location) | Yes  | Yes      | Yes     |
| At least 1 platform credential saved                   | Yes  | Yes      | No      |
| Dedicated Gmail connected (IMAP/app password)          | Yes  | No       | No      |
| Job preferences set (target roles, locations)          | Yes  | Yes      | Yes\*   |
| Copilot disclaimer accepted                            | Yes  | Yes      | Yes     |

\*Copilot still requires preferences but provides more lenient defaults.

---

## 4. 10-Step Screen Sequence

All steps render inside `/onboarding` with a horizontal progress bar. Steps 1-9 are the wizard. Step 10 is the terminal screen (readiness result).

### Step 1: Welcome & Autonomy Explanation

**Screen title:** "How VALET Works"
**Route state:** `step=welcome`

**Content:**

- Heading: "VALET applies to jobs for you"
- Three-card layout showing the three autonomy levels (Full Auto / Assisted / Copilot) with their taglines from Section 3
- Body text: "The more information you provide during setup, the more VALET can do without interrupting you. You can always change this later."
- Illustration or animation showing the VALET loop: find job -> fill application -> handle blockers -> submit -> report back

**Actions:**

- Primary button: "Let's Get Set Up" -> advances to step 2
- No skip. This screen is informational only.

**Validation:** None. Always advances.

---

### Step 2: Gmail Readiness

**Screen title:** "Email for Verifications"
**Route state:** `step=gmail`

**Content:**

- Heading: "Set up a dedicated email for job applications"
- Subheading: "Many platforms send verification codes by email. VALET can read these automatically if you connect a Gmail account."

- **Recommendation card:**
  - "We strongly recommend creating a **new Gmail account** just for job applications."
  - Bullet list:
    - "Keeps your personal inbox clean"
    - "Avoids 2FA conflicts with your main Google account"
    - "VALET only reads verification emails — nothing else"
    - "You can delete the account when you're done job hunting"

- **Gmail setup instructions (expandable/collapsible):**
  1. "Go to accounts.google.com and create a new account"
  2. "Use this new email when signing up on job platforms (LinkedIn, Workday, etc.)"
  3. "Enable IMAP: Gmail Settings > Forwarding and POP/IMAP > Enable IMAP"
  4. "Generate an App Password: Google Account > Security > 2-Step Verification > App passwords"
  5. "Copy the 16-character app password — you'll paste it on the next screen"

- **2FA impact warning:**
  - "If your Gmail has 2-Step Verification enabled (recommended for security), you must use an App Password for VALET access. A regular password will not work."
  - "VALET never disables your 2FA. The App Password is a separate credential that works alongside 2FA."

- **Input fields:**
  - Gmail address (email input, validates `@gmail.com`)
  - App Password (password input, 16-char, spaces allowed — Google formats as `xxxx xxxx xxxx xxxx`)

- **Trust copy (inline):** "Your app password is encrypted at rest (AES-256) and used only to read verification emails from job platforms. It is never used to send emails or access other Google services. You can revoke it anytime from Google Account > Security > App passwords."

**Actions:**

- Primary button: "Connect Gmail" -> validates + tests IMAP connection server-side -> advances to step 3
- Secondary (ghost) button: "Skip for Now" -> advances to step 3, sets `mailbox_connected = false`

**Validation:**

- If filling in: valid `@gmail.com` + non-empty app password
- Server-side: `POST /api/v1/credentials/mailbox/test` attempts IMAP login. On failure, shows inline error: "Could not connect. Check that IMAP is enabled and the app password is correct."

**API calls:**

- On "Connect Gmail": `POST /api/v1/credentials/mailbox` (saves encrypted) then `POST /api/v1/credentials/mailbox/test`
- On skip: no API call

---

### Step 3: Platform Credentials

**Screen title:** "Platform Logins"
**Route state:** `step=credentials`

**Content:**

- Heading: "Save your platform logins"
- Subheading: "VALET uses these to log in and apply on your behalf. The more platforms you connect, the fewer interruptions you'll get."

- **Platform card list** (one card per platform):

  | Platform   | Required fields             | Notes                                                                                                                          |
  | ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
  | LinkedIn   | Email, Password             | "Most common platform. Strongly recommended."                                                                                  |
  | Workday    | Username or Email, Password | "Used by Fortune 500 companies. Each company has a separate Workday tenant — one login often works across many."               |
  | Greenhouse | Email, Password             | "Used by thousands of startups and mid-size companies."                                                                        |
  | Lever      | Email, Password             | "Common in tech companies. Often uses email-only login (no password) — VALET handles the magic link via your connected Gmail." |

  Each card has:
  - Platform icon + name
  - "Email / Username" input
  - "Password" input
  - "Save" button (per-platform, saves independently)
  - Status badge: "Connected" (green) / "Not connected" (gray)

- **Lever special case:** If user connected Gmail in step 2, show: "Lever uses email-based login. Since you connected your Gmail, VALET can handle Lever logins automatically — no password needed." Hide the password field for Lever.

- **Body text after cards:** "Skipping a platform means VALET will pause and ask you to log in manually each time it encounters that platform. You can add credentials later in Settings > Platform Logins."

**Actions:**

- Primary button: "Continue" -> advances to step 4 (enabled regardless of how many credentials are saved)
- Each platform card has its own "Save" / "Saved" toggle

**Validation:**

- Per-platform: email/username required, password required (except Lever with Gmail)
- Server-side: `POST /api/v1/credentials/platform` per platform

**API calls:**

- Per platform save: `POST /api/v1/credentials/platform` with `{ platform, username, password }`
- No bulk save — each platform saves independently for better error isolation

---

### Step 4: Credential Security

**Screen title:** "How We Protect Your Data"
**Route state:** `step=security`

**Content:**

- Heading: "Your credentials are safe with us"
- Subheading: "Here's exactly what happens with the logins you just saved."

- **Security assurance cards** (3 cards in a vertical stack):

  **Card 1: Encrypted at Rest**
  - Icon: Lock
  - "All credentials are encrypted using AES-256-GCM before storage. The encryption keys are managed by AWS KMS and are never stored alongside the encrypted data. Even our database administrators cannot read your passwords."

  **Card 2: Minimal Scope**
  - Icon: Shield
  - "Your credentials are used exclusively to log in to job platforms and read verification emails. VALET never changes your passwords, sends emails from your account, modifies your profile on these platforms, or accesses anything beyond the job application flow."

  **Card 3: You Control the Lifecycle**
  - Icon: Trash
  - "You can update or delete any saved credential at any time from Settings > Platform Logins. When you delete a credential, it is permanently removed — not soft-deleted. If you delete your VALET account, all stored credentials are purged within 24 hours."

- **Technical details (collapsible):**
  - "Encryption: AES-256-GCM with per-credential IV"
  - "Key management: AWS KMS with automatic rotation"
  - "Transport: TLS 1.3 in transit"
  - "Access: Credentials are decrypted only inside the automation worker's memory during an active application session. They are never logged, cached to disk, or sent to third-party services."
  - "Audit trail: Every credential access is logged with timestamp, purpose, and worker ID"

**Actions:**

- Primary button: "Got It" -> advances to step 5
- No skip. Informational only.

**Validation:** None.

---

### Step 5: Resume Upload

**Screen title:** "Upload Your Resume"
**Route state:** `step=resume`

**Content:**

- **Reuse the existing `ResumeUpload` component** with no changes to the upload UX.
- Heading: "Upload Your Resume"
- Subheading: "This is all we need to get started."
- Drag-and-drop zone for PDF/DOCX, max 10MB.
- After upload success, shows checkmark with filename.

**Behavior note:** If the user already uploaded a resume (e.g., returning to onboarding after a partial completion), show the existing resume with a "Replace" option instead of the upload zone.

**Actions:**

- After successful upload: auto-advances to step 6 (same as current behavior via `onUploadComplete`)
- No skip — resume is required for all autonomy levels.

**Validation:**

- File must be PDF or DOCX
- File must be <= 10MB
- Upload must succeed (`202` response)

**API calls:**

- `POST /api/v1/resumes` (multipart upload, existing endpoint)

---

### Step 6: Profile Essentials

**Screen title:** "Review Your Profile"
**Route state:** `step=profile`

**Content:**

- **Reuse the existing `QuickReview` component** with the following modifications:
  - Add "Required for readiness" labels next to phone and location fields
  - Make phone and location fields required (not optional)
  - Keep experience and education editing as-is

- **Fields displayed (parsed from resume):**
  - Name (read-only, from resume parse)
  - Email (read-only, from auth)
  - Phone (editable, **required**)
  - Location (editable, **required**)
  - Experience entries (editable list, add/edit/remove)
  - Education (editable single entry)
  - Skills (read-only tags, parsed from resume)

- Subheading updated to: "VALET uses this information to fill application fields. Accuracy matters — incorrect data leads to rejected applications."

**Actions:**

- Primary button: "Looks Good" -> saves updates via `PATCH /api/v1/users/profile`, advances to step 7
- Disabled until phone and location are non-empty

**Validation:**

- Phone: non-empty, basic format validation
- Location: non-empty
- Other fields: optional but shown if parsed

**API calls:**

- `PATCH /api/v1/users/profile` with updated fields (existing endpoint)

---

### Step 7: Critical Q&A

**Screen title:** "Common Application Questions"
**Route state:** `step=qa`

**Content:**

- Heading: "Answer these once, use them everywhere"
- Subheading: "Most job applications ask the same questions. Answer them here and VALET will fill them in automatically."

- **Question cards** (each with a text input or select):

  | Question                                                | Input type                              | Required | Notes                                                                                                             |
  | ------------------------------------------------------- | --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
  | Are you authorized to work in [country]?                | Yes/No select                           | Yes      | Default country from profile location                                                                             |
  | Will you now or in the future require visa sponsorship? | Yes/No select                           | Yes      |                                                                                                                   |
  | What is your desired salary range?                      | Min/Max number inputs + currency select | No       | "If left blank, VALET will answer 'Open to discussion' or skip the field"                                         |
  | Are you willing to relocate?                            | Yes / No / Depends on location          | No       |                                                                                                                   |
  | Do you have a valid driver's license?                   | Yes/No                                  | No       |                                                                                                                   |
  | Have you been convicted of a felony?                    | Yes/No                                  | No       | Shown with note: "Many jurisdictions prohibit asking this. VALET will skip this question where legally required." |
  | LinkedIn profile URL                                    | URL input                               | No       | Pre-filled if LinkedIn credential was saved in step 3                                                             |
  | Portfolio / personal website URL                        | URL input                               | No       |                                                                                                                   |
  | How did you hear about this position?                   | Text input                              | No       | Default: "Online job board"                                                                                       |

- **EEO section (collapsible, clearly labeled "Optional — Equal Employment Opportunity"):**
  - Race/Ethnicity: select or "Decline to self-identify"
  - Gender: select or "Decline to self-identify"
  - Veteran status: select or "Decline to self-identify"
  - Disability status: select or "Decline to self-identify"
  - Default for all: "Decline to self-identify"
  - Note: "These questions are voluntary. VALET defaults to 'Decline to self-identify' for all EEO questions. Change only if you want a specific answer."

**Actions:**

- Primary button: "Continue" -> saves Q&A via `POST /api/v1/users/qa-bank`, advances to step 8
- Disabled until work authorization and visa sponsorship are answered

**Validation:**

- Work authorization: required
- Visa sponsorship: required
- All other fields: optional

**API calls:**

- `POST /api/v1/users/qa-bank` (new endpoint, saves as key-value pairs)

---

### Step 8: Job Preferences

**Screen title:** "What Are You Looking For?"
**Route state:** `step=preferences`

**Content:**

- Heading: "Tell VALET what to look for"
- Subheading: "These preferences help VALET find and evaluate jobs. Be specific — broader preferences mean more applications but lower match quality."

- **Fields:**

  | Field                     | Input type              | Required    | Notes                                                                                                      |
  | ------------------------- | ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
  | Target job titles         | Tag input (multi)       | Yes (min 1) | e.g., "Software Engineer", "Frontend Developer", "Full Stack Engineer"                                     |
  | Target locations          | Tag input (multi)       | Yes (min 1) | e.g., "San Francisco, CA", "Remote", "New York, NY"                                                        |
  | Preferred company size    | Multi-select checkboxes | No          | Startup (1-50) / Small (51-200) / Mid (201-1000) / Large (1001-5000) / Enterprise (5000+)                  |
  | Industries to target      | Tag input (multi)       | No          | e.g., "Technology", "Finance", "Healthcare"                                                                |
  | Companies to exclude      | Tag input (multi)       | Recommended | "Add companies you don't want to apply to. At minimum, add your current employer." Warning badge if empty. |
  | Remote preference         | Select                  | No          | Remote only / Hybrid OK / On-site OK / No preference                                                       |
  | Experience level          | Select                  | Yes         | Intern / Entry / Mid / Senior / Lead / Principal / Executive                                               |
  | Minimum salary (optional) | Number input            | No          | "Jobs below this won't be auto-applied. Leave blank to consider all."                                      |

**Actions:**

- Primary button: "Continue" -> saves via `PATCH /api/v1/users/preferences`, advances to step 9
- Disabled until at least 1 target title, 1 target location, and experience level are set

**Validation:**

- Target titles: at least 1
- Target locations: at least 1
- Experience level: required
- Exclusion list: show warning if empty ("We recommend excluding at least your current employer") but do not block

**API calls:**

- `PATCH /api/v1/users/preferences` (new endpoint or extends existing profile)

---

### Step 9: Disclaimer & Consent

**Screen title:** "Before We Begin"
**Route state:** `step=consent`

**Content:**

- **Reuse the existing `DisclaimerStep` component** unchanged.
- Shows Layer 2 copilot disclaimer (platform risk, account restrictions, application accuracy, data processing)
- Two checkboxes:
  1. "I understand that Valet will automate job applications on my behalf"
  2. "I accept the Terms of Service and Privacy Policy"

**Actions:**

- Primary button: "Accept & Get Started" -> records consent via `POST /api/v1/consent`, advances to step 10
- Disabled until both checkboxes are checked

**Validation:**

- Both checkboxes must be checked
- Consent API call must succeed

**API calls:**

- `POST /api/v1/consent` with `{ type: "copilot_disclaimer", version: "1.0" }` (existing endpoint)

---

### Step 10: Autonomy Readiness Result

**Screen title:** "You're Ready"
**Route state:** `step=result`

**Content varies by computed autonomy level:**

#### Full Autonomy Result

- **Badge:** Green "Full Auto" badge
- **Heading:** "You're set up for full autonomy"
- **Body:** "VALET can handle everything — logging in, filling applications, reading verification codes, and submitting. You'll review a summary of each application after it's submitted."
- **Checklist (all green checkmarks):**
  - Resume uploaded
  - Profile complete
  - Gmail connected
  - Platform credentials saved
  - Job preferences set
  - Disclaimer accepted

#### Assisted Result

- **Badge:** Blue "Assisted" badge
- **Heading:** "You're set up for assisted mode"
- **Body:** "VALET can log in and fill applications, but will need your help with verification codes. You'll get a notification when VALET needs you."
- **Checklist (green checkmarks + amber items):**
  - Resume uploaded (green)
  - Profile complete (green)
  - Gmail connected (amber — "Not connected. VALET will pause for verification codes.")
  - Platform credentials saved (green)
  - Job preferences set (green)
  - Disclaimer accepted (green)
- **Upgrade prompt:** "Want full autonomy? Connect a Gmail account in Settings > Email."

#### Copilot Only Result

- **Badge:** Gray "Copilot" badge
- **Heading:** "You're set up for copilot mode"
- **Body:** "VALET will fill in application fields for you, but you'll need to log in to each platform yourself and approve each submission."
- **Checklist (green checkmarks + amber items):**
  - Resume uploaded (green)
  - Profile complete (green)
  - Gmail connected (amber — "Not connected")
  - Platform credentials saved (amber — "No platform credentials saved. VALET will ask you to log in each time.")
  - Job preferences set (green)
  - Disclaimer accepted (green)
- **Upgrade prompt:** "Want more automation? Add platform logins in Settings > Platform Logins."

#### Downgrade reasons (shown as amber callouts below the checklist)

| Missing item            | Downgrade           | Reason text                                                                                                           |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No Gmail connected      | Full -> Assisted    | "Without a connected email, VALET can't read verification codes automatically. It will pause and notify you instead." |
| No platform credentials | Assisted -> Copilot | "Without saved logins, VALET can't log in to platforms automatically. You'll need to log in manually each time."      |
| Both missing            | Full -> Copilot     | Both reasons shown                                                                                                    |

**Actions:**

- Primary button: "Enter Workbench" -> marks onboarding complete, redirects to `/workbench`
- Secondary link: "Change something" -> goes back to the relevant step

**On primary button click:**

1. `PATCH /api/v1/users/profile` with `{ autonomyLevel: "full" | "assisted" | "copilot_only", onboardingCompletedAt: now() }`
2. Update local auth store / consent cache
3. `window.location.replace("/workbench")` (hard redirect to reinitialize guards)

---

## 5. Gmail Readiness Guidance

### Why a dedicated Gmail?

Most job platforms (Workday, Greenhouse, Lever) send verification codes via email during login or application. VALET can read these codes automatically if it has IMAP access to the user's email. We recommend a **dedicated Gmail** (not the user's personal email) because:

1. **2FA isolation** — The user's personal Google account likely has 2FA tied to their phone. A separate account avoids 2FA prompt conflicts.
2. **Scope limitation** — VALET only accesses one inbox, not the user's personal email with sensitive data.
3. **Clean signal** — A dedicated inbox only contains job-related emails, making verification code extraction more reliable.
4. **Easy cleanup** — Delete the account when done job searching.

### 2FA Impact

| Scenario                                     | Impact                                    | VALET behavior                                                                                                     |
| -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Gmail has 2FA + App Password provided        | None. App Password bypasses 2FA for IMAP. | Connects normally.                                                                                                 |
| Gmail has 2FA + regular password provided    | IMAP login fails.                         | Shows error: "Connection failed. If you have 2-Step Verification enabled, you need to use an App Password."        |
| Gmail has no 2FA + regular password provided | Works, but less secure.                   | Connects normally. Shows recommendation: "We recommend enabling 2-Step Verification on this account for security." |

### Mailbox access scope

VALET's IMAP access is used exclusively to:

- Search for emails from known job platform sender addresses (e.g., `noreply@workday.com`, `no-reply@greenhouse.io`)
- Extract verification codes / magic links from those emails
- Mark processed emails as read

VALET does **not**:

- Read non-job-platform emails
- Send any emails
- Delete any emails
- Access Google Drive, Calendar, or other services
- Store email content beyond the extracted code

---

## 6. Platform Credential Requirements

### Per-platform details

| Platform       | Login method              | Fields needed      | Session persistence                | Notes                                                                                                                                                                       |
| -------------- | ------------------------- | ------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LinkedIn**   | Email + Password          | email, password    | `gh_browser_sessions` cookie reuse | Most aggressive bot detection. Session cookies are reused across jobs to avoid repeated logins. VALET uses conservative rate limits (max 10 applications/day).              |
| **Workday**    | Email/Username + Password | username, password | Per-tenant sessions                | Each company has a separate Workday tenant (e.g., `company.wd5.myworkdaysite.com`). One credential often works across many Workday tenants. Sessions are stored per domain. |
| **Greenhouse** | Email + Password          | email, password    | Session cookie                     | Standard login. Some companies use SSO which may require additional handling.                                                                                               |
| **Lever**      | Email (magic link)        | email only         | Session cookie                     | No password needed if Gmail is connected — VALET reads the magic link from the inbox. If Gmail is not connected, VALET pauses with a `login_required` blocker.              |

### What happens when credentials are skipped

| Platform skipped   | VALET behavior                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| LinkedIn           | When VALET encounters a LinkedIn application, it creates a `login_required` HITL blocker. User must open the browser session and log in manually. |
| Workday            | Same — `login_required` blocker per Workday tenant.                                                                                               |
| Greenhouse         | Same — `login_required` blocker.                                                                                                                  |
| Lever (no Gmail)   | `login_required` blocker. User must manually click the magic link in their personal email and complete login in the browser session.              |
| Lever (with Gmail) | No credential needed. VALET reads magic link automatically.                                                                                       |

### Session reuse (`gh_browser_sessions`)

The `gh_browser_sessions` table stores encrypted browser cookies per user per domain:

```
gh_browser_sessions
├── id (uuid)
├── user_id (uuid)
├── domain (text) — e.g., "linkedin.com", "company.wd5.myworkdaysite.com"
├── session_data (text) — encrypted cookie jar
├── encryption_key_id (text)
├── expires_at (timestamp)
├── last_used_at (timestamp)
├── created_at (timestamp)
└── updated_at (timestamp)
```

- Sessions are created by GhostHands after a successful login.
- Sessions are reused for subsequent jobs on the same domain.
- Sessions expire based on the platform's cookie TTL (typically 30 days for LinkedIn, 24h for Workday).
- When a session expires, VALET re-authenticates using the stored credential.

---

## 7. Credential Trust & Security Copy

### On-screen copy (shown in Step 4)

> **Encrypted at rest.** All credentials are encrypted using AES-256-GCM before storage. Encryption keys are managed by AWS KMS and stored separately from the data.
>
> **Used only for automation.** Your logins are used exclusively to log in to job platforms and read verification emails. VALET never changes your passwords, sends emails, or accesses anything beyond the application flow.
>
> **You control the lifecycle.** Update or delete any credential anytime in Settings. Deleted credentials are permanently removed, not soft-deleted. Account deletion purges all credentials within 24 hours.

### Settings page credential management

After onboarding, credentials are managed at `/settings/credentials`:

- View list of saved platforms with status (Connected / Expired / Error)
- Update password for any platform
- Delete credential (hard delete with confirmation)
- Add new platforms not set up during onboarding
- Test connection (re-attempts login to verify credential still works)

---

## 8. Existing Blocker / Verification Behavior

### Blocker types (from `task.schema.ts`)

| Type           | Internal value   | Trigger                                  | User action                                                                                    | Resolution type                             |
| -------------- | ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------- |
| CAPTCHA        | `captcha`        | Platform presents CAPTCHA                | Open browser session, solve CAPTCHA, click "I've Solved the CAPTCHA"                           | `manual`                                    |
| 2FA            | `two_factor`     | Platform requests 2FA code               | Enter TOTP/SMS code in the inline input, click "Submit Code"                                   | `code_entry` with `{ code }`                |
| Login Required | `login_required` | No valid session/credential for platform | Open browser session, log in manually, click "Submit Credentials" or complete login in browser | `credentials` with `{ username, password }` |
| Bot Check      | `bot_check`      | Platform bot detection triggered         | Open browser session, complete verification, click "I've Completed Verification"               | `manual`                                    |
| Rate Limited   | `rate_limited`   | Platform rate limit hit                  | Wait or click "Retry Now"                                                                      | `manual`                                    |
| Verification   | `verification`   | Email/phone verification required        | Check email/phone for code, enter in browser session                                           | `manual`                                    |

### HITL blocker UX (from `hitl-blocker-card.tsx`)

When GhostHands returns `needs_human`, the task enters `waiting_human` status and the `HitlBlockerCard` is displayed:

1. **Header:** Blocker type icon + label + "Blocked" badge
2. **Screenshot:** If available, shows a screenshot of the blocked page (clickable to enlarge)
3. **Page URL:** Link to the page where the blocker occurred
4. **Countdown timer:** If timeout is set, shows remaining time
5. **Browser session button:** "Open Browser Session" — opens a live KasmVNC view of the worker's browser
6. **Type-specific controls:**
   - `two_factor`: Code input + "Submit Code"
   - `login_required`: Username + Password inputs + "Submit Credentials"
   - `captcha` / `bot_check` / `verification`: "I've resolved it" button
   - `rate_limited`: "Retry Now" button
7. **Footer:** "Skip This Step" + "Cancel Task"

### How verification flow works today (Workday example)

1. User creates a task with a Workday job URL
2. GhostHands opens the URL in the worker's browser
3. Workday requires login -> GH checks `gh_browser_sessions` for a valid session
4. If no session: GH checks `platform_credentials` for Workday credentials
5. If credentials exist: GH logs in, Workday sends email verification code
6. If Gmail connected: GH polls the Gmail inbox via IMAP, extracts the code, enters it
7. If Gmail not connected: GH creates a `verification` blocker, pauses the task
8. User receives notification, opens browser session, manually enters the code
9. User clicks "I've Completed This Step" -> VALET calls `POST /api/v1/tasks/:id/resolve-blocker`
10. GH receives the resume signal and continues the application
11. On successful login, GH saves the session to `gh_browser_sessions` for reuse

### Session reuse on subsequent applications

1. User creates another task for a different Workday job (different company, same Workday platform)
2. GH checks `gh_browser_sessions` for the domain
3. If session exists and not expired: GH loads the cookies, skips login entirely
4. If session expired: GH re-authenticates using stored credentials (repeats steps 4-6 above)

---

## 9. Minimum Profile & Q/A Fields

### Required for all autonomy levels (hard blocks)

| Field                          | Source         | Collected in step  |
| ------------------------------ | -------------- | ------------------ |
| Resume (at least 1)            | Upload         | Step 5             |
| Full name                      | Resume parse   | Step 6 (read-only) |
| Email                          | Auth provider  | Step 6 (read-only) |
| Phone number                   | User input     | Step 6             |
| Location (city, state/country) | User input     | Step 6             |
| Work authorization answer      | User input     | Step 7             |
| Visa sponsorship answer        | User input     | Step 7             |
| Target job titles (min 1)      | User input     | Step 8             |
| Target locations (min 1)       | User input     | Step 8             |
| Experience level               | User input     | Step 8             |
| Copilot disclaimer consent     | Checkbox + API | Step 9             |

### Required for `assisted` or `full` (soft — downgrades if missing)

| Field                          | Source     | Collected in step | Missing -> downgrade |
| ------------------------------ | ---------- | ----------------- | -------------------- |
| At least 1 platform credential | User input | Step 3            | -> `copilot_only`    |

### Required for `full` only (soft — downgrades if missing)

| Field                    | Source     | Collected in step | Missing -> downgrade |
| ------------------------ | ---------- | ----------------- | -------------------- |
| Gmail/mailbox credential | User input | Step 2            | `full` -> `assisted` |

### Recommended but not required

| Field                  | Source     | Step   | Impact if missing                            |
| ---------------------- | ---------- | ------ | -------------------------------------------- |
| Salary range           | User input | Step 7 | VALET answers "Open to discussion"           |
| Relocation willingness | User input | Step 7 | VALET skips or uses "No preference"          |
| Company exclusion list | User input | Step 8 | Risk of applying to current employer         |
| EEO responses          | User input | Step 7 | VALET defaults to "Decline to self-identify" |
| LinkedIn URL           | User input | Step 7 | VALET leaves blank or skips                  |
| Portfolio URL          | User input | Step 7 | VALET leaves blank or skips                  |

---

## 10. Autonomy Readiness Check

### Computation logic (runs client-side on step 10 render)

```typescript
function computeAutonomyLevel(state: OnboardingState): AutonomyLevel {
  // Hard requirements (if any missing, user shouldn't reach step 10)
  // resume, profile basics, work auth, visa, preferences, consent

  const hasCredentials = state.platformCredentials.length > 0;
  const hasMailbox = state.mailboxConnected;

  if (hasCredentials && hasMailbox) return "full";
  if (hasCredentials && !hasMailbox) return "assisted";
  return "copilot_only";
}
```

### Downgrade reason map

| From       | To             | Condition                   | Reason key                     | User-facing text                                                                                                      |
| ---------- | -------------- | --------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `full`     | `assisted`     | No mailbox                  | `no_mailbox`                   | "Without a connected email, VALET can't read verification codes automatically. It will pause and notify you instead." |
| `assisted` | `copilot_only` | No credentials              | `no_credentials`               | "Without saved logins, VALET can't log in to platforms automatically. You'll need to log in manually each time."      |
| `full`     | `copilot_only` | No mailbox + no credentials | `no_mailbox`, `no_credentials` | Both messages shown                                                                                                   |

### Readiness check response shape (for API persistence)

```typescript
interface ReadinessResult {
  autonomyLevel: "full" | "assisted" | "copilot_only";
  checklist: {
    resumeUploaded: boolean;
    profileComplete: boolean;
    mailboxConnected: boolean;
    credentialsSaved: string[]; // platform names
    preferencesSet: boolean;
    consentAccepted: boolean;
  };
  downgrades: Array<{
    reason: "no_mailbox" | "no_credentials";
    from: AutonomyLevel;
    to: AutonomyLevel;
    message: string;
  }>;
}
```

---

## 11. Route & State Ownership

### Route structure

| Path          | Component        | Guard       | Notes                                       |
| ------------- | ---------------- | ----------- | ------------------------------------------- |
| `/onboarding` | `OnboardingPage` | `AuthGuard` | Renders step wizard based on internal state |

The onboarding page is a **single route** with internal step state (not sub-routes). This keeps navigation simple and prevents users from deep-linking to arbitrary steps.

### State management

| State                | Owner                        | Storage                                   | Notes                                        |
| -------------------- | ---------------------------- | ----------------------------------------- | -------------------------------------------- |
| Current step         | `OnboardingPage` local state | React `useState`                          | Resets to first incomplete step on remount   |
| Resume uploaded      | Server (resumes API)         | DB `resumes` table                        | Queried via `api.resumes.list`               |
| Profile data         | Server (users API)           | DB `users` table                          | Queried via `api.users.getProfile`           |
| Platform credentials | Server (credentials API)     | DB `platform_credentials` table           | Queried via `api.credentials.platform.list`  |
| Mailbox credential   | Server (credentials API)     | DB `mailbox_credentials` table            | Queried via `api.credentials.mailbox.status` |
| Q&A bank             | Server (users API)           | DB `user_qa_bank` table                   | Queried via `api.users.qaBank.list`          |
| Job preferences      | Server (users API)           | DB `users.preferences` JSONB              | Queried via `api.users.getProfile`           |
| Consent              | Server + localStorage        | DB `consent_records` + localStorage cache | Queried via `useConsent()` hook              |
| Autonomy level       | Server (users API)           | DB `users.autonomy_level`                 | Written on step 10 completion                |

### Step completeness detection

On page load, the onboarding page queries all relevant state and computes the first incomplete step:

```typescript
function getFirstIncompleteStep(state: OnboardingState): OnboardingStep {
  // Step 1 (welcome) — always show on first visit, skip on return
  if (!state.hasSeenWelcome) return "welcome";

  // Step 2 (gmail) — skip if already connected
  // But don't skip on first visit — user should see the option
  if (!state.hasVisitedGmail) return "gmail";

  // Step 3 (credentials) — skip if already visited
  if (!state.hasVisitedCredentials) return "credentials";

  // Step 4 (security) — skip if already visited
  if (!state.hasVisitedSecurity) return "security";

  // Step 5 (resume) — required, check if uploaded
  if (!state.hasResume) return "resume";

  // Step 6 (profile) — required, check completeness
  if (!state.profileComplete) return "profile";

  // Step 7 (qa) — required, check minimum fields
  if (!state.qaComplete) return "qa";

  // Step 8 (preferences) — required, check minimum fields
  if (!state.preferencesComplete) return "preferences";

  // Step 9 (consent) — required
  if (!state.consentAccepted) return "consent";

  // Step 10 (result) — terminal
  return "result";
}
```

**"Visited" flags** are stored in `localStorage` under the key `valet:onboarding:visited` as a JSON object: `{ gmail: true, credentials: true, security: true }`. This allows optional steps (gmail, credentials, security) to be marked as "seen" without requiring the user to save data.

### Auth guard changes

The `AuthGuard` component (`auth-guard.tsx`) needs one change:

**Current completeness check:**

```typescript
const onboardingComplete = hasResumes && !!copilotAccepted;
```

**New completeness check:**

```typescript
const onboardingComplete = !!userProfile?.onboardingCompletedAt;
```

This moves the source of truth from a client-side heuristic (has resume + consent) to a server-side timestamp that is set when the user clicks "Enter Workbench" on step 10.

### Navigation behavior

- **Back button:** Each step has a "Back" ghost button that goes to the previous step. Steps 2-3 (Gmail, credentials) are always navigable regardless of whether data was entered.
- **Browser back:** Uses `window.history` state. Navigating back in the browser goes to the previous step.
- **Direct URL access:** `/onboarding` always starts at the first incomplete step. There are no sub-URLs.
- **Returning user:** If a user leaves mid-onboarding and returns, they resume at the first incomplete step. Optional steps they already visited are skipped.

---

## 12. Data Model Dependencies

### New tables required

| Table                  | Purpose                                     | Created by                                              |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `platform_credentials` | Stores encrypted platform login credentials | DB migration (see `docs/ux-chain.md` or migration task) |
| `mailbox_credentials`  | Stores encrypted Gmail/IMAP credentials     | DB migration                                            |
| `user_qa_bank`         | Stores user's default Q&A answers           | DB migration                                            |

### New columns on existing tables

| Table   | Column                    | Type                                      | Purpose                                                 |
| ------- | ------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| `users` | `autonomy_level`          | `text` (enum: full/assisted/copilot_only) | Computed autonomy level                                 |
| `users` | `onboarding_completed_at` | `timestamp`                               | Set when user completes step 10                         |
| `users` | `preferences`             | `jsonb`                                   | Job preferences (titles, locations, salary, exclusions) |

### New API endpoints required

| Method   | Path                                 | Purpose                         | Used in step |
| -------- | ------------------------------------ | ------------------------------- | ------------ |
| `POST`   | `/api/v1/credentials/mailbox`        | Save Gmail/IMAP credential      | 2            |
| `POST`   | `/api/v1/credentials/mailbox/test`   | Test IMAP connection            | 2            |
| `GET`    | `/api/v1/credentials/mailbox/status` | Check if mailbox is connected   | Page load    |
| `POST`   | `/api/v1/credentials/platform`       | Save platform credential        | 3            |
| `GET`    | `/api/v1/credentials/platform`       | List saved platform credentials | Page load    |
| `DELETE` | `/api/v1/credentials/platform/:id`   | Delete platform credential      | Settings     |
| `POST`   | `/api/v1/users/qa-bank`              | Save Q&A answers                | 7            |
| `GET`    | `/api/v1/users/qa-bank`              | Get saved Q&A answers           | Page load    |
| `PATCH`  | `/api/v1/users/preferences`          | Save job preferences            | 8            |

### Existing endpoints reused

| Method  | Path                    | Purpose               | Used in step |
| ------- | ----------------------- | --------------------- | ------------ |
| `POST`  | `/api/v1/resumes`       | Upload resume         | 5            |
| `GET`   | `/api/v1/resumes`       | List resumes          | Page load    |
| `PATCH` | `/api/v1/users/profile` | Update profile fields | 6, 10        |
| `GET`   | `/api/v1/users/profile` | Get profile           | Page load    |
| `POST`  | `/api/v1/consent`       | Record consent        | 9            |
