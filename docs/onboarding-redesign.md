# Onboarding Redesign: Implementation Brief

## Goal

Reduce time to first value without blocking users on full account setup.

This redesign introduces:

1. A default "Quick Start" path that gets users to a product preview fast.
2. A "Full Setup" path for users ready to configure autonomous applications.
3. Resume parsing feedback early in the flow so users can see progress and verify extracted data.

This document is intentionally implementation-focused. It removes unsupported market stats, avoids unverifiable claims, and separates immediate scope from future work.

## Product Decisions

### Primary path

Make Quick Start the default entry point.

Reason:

- A mode-selection screen adds an extra interaction and undermines the original "show value fast" goal.
- Users who want the full setup can still choose it via a secondary action.

### Honest interaction count

If Quick Start is the default path, the minimum meaningful interaction count is:

1. Upload resume
2. Paste job URL
3. Click "Preview Application"

If we keep a first-screen mode choice, the minimum becomes 4+ interactions. Do not market this as a 3-click flow unless the explicit mode-choice screen is removed.

### Flow split

- Quick Start: default path, optimized for previewing value.
- Full Setup: secondary path, optimized for completing profile and enabling real submissions.

## Recommended UX Flow

### Entry screen

Replace the current onboarding entry with:

- Primary CTA: "Try It Now"
- Secondary CTA: "Full Setup"
- Optional tertiary link: "Open VALET Desktop"

Do not present two equal-weight cards as the first decision. Make one primary action obvious.

### Quick Start flow

The Quick Start flow should be:

1. Resume upload
2. Live parse feedback
3. Parsed data review
4. Job URL input
5. Application preview
6. Bridge to Full Setup if the user wants to submit for real

This is the fastest path to a concrete preview while still letting the user verify parsed data before the job preview.

### Full Setup flow

The Full Setup flow should be:

1. Resume upload
2. Live parse feedback
3. Parsed data review
4. Required Q&A
5. Email and credential setup
6. Preferences and consent
7. Execution mode selection
8. Ready state / handoff to workbench

Resume parsing moves to the front so later steps can be prefilled where possible.

## Detailed Screen Requirements

### 1. Entry screen

Required elements:

- Headline explaining the product in one sentence.
- Primary button: "Try It Now"
- Secondary button or link: "Full Setup"
- Link: "Open VALET Desktop" if desktop support is already available

Acceptance criteria:

- The primary CTA starts Quick Start immediately.
- The secondary CTA starts Full Setup immediately.
- No email, password, or credential fields appear on this screen.

### 2. Resume upload

Required elements:

- Drag-and-drop zone
- File picker fallback
- Supported formats: PDF, DOC, DOCX
- File size limit text

Acceptance criteria:

- Upload validates file type before submission.
- Upload validates max file size before submission.
- Error states are inline and do not navigate away from the screen.

### 3. Live parse feedback

The parse state must show that work is happening, not just a spinner.

Use a three-phase sequence:

1. Upload complete confirmation
2. Parsing in progress with skeleton placeholders
3. Parsed fields revealed into the review UI

Required UI behavior:

- Show the uploaded filename.
- Show skeleton rows shaped like the upcoming review form.
- Rotate through simple status labels such as:
  - "Reading document"
  - "Extracting contact details"
  - "Extracting work history"
  - "Extracting skills and education"
- Transition into the parsed review state automatically when parsing completes.

Acceptance criteria:

- Users can distinguish upload success from parse progress.
- The parse state persists until either structured data or an explicit error is returned.
- A generic loading spinner alone is not sufficient.

### 4. Parsed data review

This screen is shared by Quick Start and Full Setup.

Required elements:

- Structured sections for:
  - Contact information
  - Work experience
  - Education
  - Skills
- Inline edit entry point for each section
- Primary CTA to continue

Behavior:

- Show all successfully extracted fields.
- Clearly mark missing or low-confidence fields.
- Let the user continue even if optional fields are missing.

Acceptance criteria:

- Required fields missing from the parse are highlighted.
- Low-confidence fields are marked for review.
- Editing does not force the user into a separate multi-step form unless they choose it.

### 5. Job URL input (Quick Start only)

Required elements:

- Single URL input
- Primary CTA: "Preview Application"
- Optional sample-job shortcuts for testing

Acceptance criteria:

- Invalid URLs are rejected inline.
- Users can continue without creating an account.

### 6. Application preview (Quick Start only)

The preview should prove value without implying a real submission occurred.

Required elements:

- Job title
- Job source/platform if detectable
- A preview of fields VALET can prefill
- A list of missing prerequisites for real submission
- CTA to continue into Full Setup

Do not include a "match score" in the initial implementation unless scoring logic already exists and can be explained. It is optional and should not block the rollout.

Acceptance criteria:

- The screen clearly distinguishes "preview" from "submitted."
- Missing requirements for real submission are listed explicitly.
- The CTA resumes setup without making the user repeat already completed steps.

### 7. Execution mode selection (Full Setup only)

This step belongs late in Full Setup, after the user has already seen product value.

Required options:

- Desktop Mode
- Remote Mode

Behavior:

- Remote Mode must always remain available.
- Desktop Mode must never block account completion if detection fails.

Acceptance criteria:

- Users can select Remote Mode without installing anything.
- Desktop-specific issues do not break onboarding completion.

## Error Handling

### Resume parsing failures

Handle these cases explicitly:

- Unsupported format
- File too large
- Partial parse
- Parse failure

Required recovery behavior:

- Keep the user on the same step.
- Preserve the uploaded file state where practical.
- Allow manual review/edit if partial data is available.
- Provide a retry path.

### Job preview failures

Handle these cases explicitly:

- Unsupported job board
- Job page unreachable
- Parse timeout

Required recovery behavior:

- Show a plain-language error.
- Allow another URL without restarting onboarding.
- Offer a sample job URL if supported.

### Desktop handoff failures

Handle these cases explicitly:

- App not installed
- App installed but unavailable
- Unsupported platform

Required recovery behavior:

- Offer Remote Mode immediately.
- Do not block the user from finishing setup.

## Technical Scope

### Frontend

Required work:

- Add a new onboarding entry state with a primary Quick Start CTA.
- Move resume upload to the start of onboarding.
- Add a parsing-feedback component with skeleton states and rotating status text.
- Add a parsed-data review screen shared by both paths.
- Add a Quick Start job-preview screen.
- Add state tracking so completed steps carry over when users move from Quick Start to Full Setup.
- Add an execution-mode selection step near the end of Full Setup.

Implementation notes:

- Treat Quick Start and Full Setup as two routes through the same state machine, not two unrelated wizards.
- Reuse the same parsed-profile state across both paths.

### Backend

Required work:

- Return structured parse results for resume uploads.
- Support a Quick Start preview flow that does not require full onboarding completion.
- Persist enough onboarding state to resume users into Full Setup after Quick Start.

Optional future work:

- Add scoring or ranking logic for previews.
- Add analytics events for conversion and step drop-off.

### Desktop integration

Phase the desktop work.

Phase 1:

- Add an "Open VALET Desktop" affordance only if a stable desktop deep-link already exists.
- If no desktop connection is confirmed, show fallback guidance and keep Remote Mode available.

Phase 2:

- Improve desktop launch and reconnect flows after the browser and desktop app contract is defined.

Security constraints:

- Do not pass long-lived tokens in custom protocol URLs.
- If a deep link requires authentication, use short-lived, single-purpose tokens with explicit expiry and scope.
- Prefer exchanging a one-time code for a session inside the app over embedding reusable credentials in the URL.

Do not rely on browser focus loss as the sole success signal. It is not reliable enough for core flow logic.

## Out of Scope For Initial Rollout

These items should not block the first release:

- Marketing claims about click counts
- Unsupported performance or conversion statistics
- A mandatory match score
- Side-by-side resume PDF rendering
- Auto-update flows for the desktop app
- Complex desktop running-state detection

## Rollout Priority

### P0

- Make Quick Start the default entry point
- Move resume upload to the start
- Implement live parse feedback
- Implement parsed-data review
- Implement Quick Start job preview
- Preserve progress when moving into Full Setup

### P1

- Add execution mode selection
- Improve desktop open/download affordances
- Add analytics for funnel visibility

### P2

- Add optional scoring if a defensible model exists
- Improve desktop-to-web handshake

## Open Decisions

These still need product and engineering alignment:

1. Whether "Open VALET Desktop" should appear on day one or wait until the deep-link contract is stable.
2. Which fields are truly required before a real submission can occur.
3. Whether Quick Start should support all job URLs or only a limited supported set initially.
4. Whether partial parsed data should be editable inline only, or also support an expanded form editor.

## Definition Of Done

This redesign is ready to ship when:

1. A new user can start in Quick Start without entering credentials first.
2. Resume upload shows visible parse progress and ends in a structured review state.
3. A user can preview how VALET would fill a job application without completing full setup.
4. A user can continue from Quick Start into Full Setup without redoing completed steps.
5. Desktop issues never block completion because Remote Mode remains available.
