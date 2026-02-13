# WeKruit Valet — Browser Testing Script for Claude CoWork

## Prerequisites

Before running these tests, ensure:
- `pnpm dev` is running in the VALET directory (starts API on :8000, Web on :5173)
- Web app is accessible at http://localhost:5173
- API is responding at http://localhost:8000/api/v1/health
- You have a test PDF resume file available (any PDF with text content)

---

## Test 1: Google OAuth Login

**Steps:**
1. Open http://localhost:5173
2. You should see the login page with the WeKruit Valet branding
3. Click "Sign in with Google"
4. Complete Google OAuth flow (use a Google account)
5. After redirect, you should land on a consent/disclaimer modal

**Expected:**
- Login page renders correctly with no errors in console
- Google OAuth popup opens
- After successful auth, redirects back to the app
- No "Google OAuth is not configured" error

**Report:** Screenshot the login page, the OAuth flow, and the post-login state.

---

## Test 2: Terms of Service & Copilot Disclaimer Modals

**Steps (continue from Test 1):**
1. After login, you should see "Terms and Privacy" modal
2. Verify the modal layout:
   - Shield icon and title should NOT overlap with any close button
   - There should be NO X close button (this is a mandatory modal)
   - Checkbox to agree to Terms of Service
   - "Accept & Continue" button (should be disabled until checkbox is checked)
3. Check the checkbox and click "Accept & Continue"
4. You should now see "Copilot Mode — Important Information" modal
5. Verify same layout rules (no close button overlap)
6. Scroll through the warnings, check the acknowledgment checkbox
7. Click "I Understand & Accept"

**Expected:**
- Both modals render cleanly with no overlapping elements
- No X close button visible (these are mandatory)
- Cannot dismiss by clicking outside or pressing Escape
- After accepting both, you proceed to the onboarding flow

**Report:** Screenshot both modals. Flag any layout issues.

---

## Test 3: Resume Upload (Onboarding)

**Steps (continue from Test 2):**
1. After consent, you should see the onboarding page with a resume upload area
2. Drag and drop a PDF resume OR click to browse and select one
3. Watch for upload progress
4. After upload succeeds, you should see a success state

**Expected:**
- File picker accepts PDF and DOCX files
- Upload starts immediately
- No 400 error in the API logs (check terminal)
- Success message appears
- If you see the Quick Review step, it should show data from the API (not "Your Name" / "you@email.com")

**Report:** Screenshot the upload flow. Check the terminal for the API response — it should return 202, not 400. If 400, report the exact error.

---

## Test 4: Dashboard

**Steps:**
1. Navigate to http://localhost:5173/dashboard (or click Dashboard in sidebar)
2. Check the page layout

**Expected:**
- Stats cards show (Total, Completed, In Progress, Needs Review) — may all be 0 for new user
- Loading spinners appear briefly before data loads (not a flash of empty state)
- No JavaScript errors in console
- Active Tasks section renders (empty state is OK)
- Recent Applications section renders (empty state is OK)

**Report:** Screenshot the dashboard. Note if you see loading states or flash of empty content.

---

## Test 5: Apply Page (Create a Task)

**Steps:**
1. Navigate to http://localhost:5173/apply
2. You should see a form to submit a job application URL
3. Enter a LinkedIn job URL like: `https://www.linkedin.com/jobs/view/1234567890`
4. The platform should auto-detect as "LinkedIn"
5. Select "Copilot" mode
6. Click "Start Application" (or similar submit button)

**Expected:**
- URL input validates correctly
- Platform detection shows "LinkedIn" badge
- Resume ID is NOT "00000000-0000-0000-0000-000000000000" — it should be the real resume you uploaded
- If no resume uploaded, you should see an error toast
- After submission, you should redirect to the task detail page
- Note: The actual application won't run (browser automation is mocked) but the task should be created

**Report:** Screenshot the apply form, the platform detection, and the task creation result. Check API logs for the POST /api/v1/tasks response.

---

## Test 6: Task Detail & Progress

**Steps:**
1. After creating a task in Test 5, you should be on the task detail page
2. Or navigate to http://localhost:5173/tasks and click on a task

**Expected:**
- Task shows correct platform, URL, and status
- Progress indicator renders
- WebSocket connection indicator shows (green = connected, yellow = connecting)
- If task is in "waiting_human" status, "Approve & Submit" button should be enabled
- Cancel button should work
- If the Hatchet worker is connected, you should see progress updates in real-time

**Report:** Screenshot the task detail page. Note the WebSocket connection status.

---

## Test 7: Settings Pages

**Steps:**
1. Navigate to http://localhost:5173/settings
2. Check all 3 tabs:
   - **Profile**: Should show your Google account info (name, email)
   - **Q&A Bank**: Should show any auto-discovered Q&A from resume parsing. "Add Answer Manually" button should be disabled with "Coming soon" tooltip.
   - **Automation**: Should show automation preferences

**Expected:**
- All 3 tabs render and switch correctly
- Profile tab shows real user data
- Q&A Bank tab loads entries from API (may be empty for new user)
- No console errors on any tab

**Report:** Screenshot each settings tab.

---

## Test 8: Navigation & Layout

**Steps:**
1. Click through all sidebar items: Dashboard, Tasks, Apply, Settings
2. Try collapsing/expanding the sidebar (if there's a toggle)
3. Check the header (user avatar, notifications icon)
4. Try logging out (user menu → logout)

**Expected:**
- All navigation links work
- Sidebar collapses/expands smoothly
- Logout clears auth and redirects to login page
- After logout, navigating to /dashboard should redirect to /login

**Report:** Note any broken links, layout shifts, or navigation issues.

---

## Test 9: Error Handling

**Steps:**
1. Open browser DevTools → Network tab
2. Navigate to Dashboard
3. Temporarily block API requests (in DevTools, throttle to offline)
4. Refresh the page

**Expected:**
- Error states should appear (not blank/broken pages)
- After reconnecting, data should load

**Report:** Screenshot any error states you see.

---

## Bug Report Template

For each issue found, report:

```
**Issue:** [Brief description]
**Page:** [URL where it happens]
**Steps:** [How to reproduce]
**Expected:** [What should happen]
**Actual:** [What actually happened]
**Screenshot:** [Attach if possible]
**Console errors:** [Any JS errors from DevTools console]
**API logs:** [Any relevant lines from the terminal running pnpm dev]
```

---

## Checklist Summary

| # | Test | Status |
|---|------|--------|
| 1 | Google OAuth Login | |
| 2 | ToS & Copilot Modals | |
| 3 | Resume Upload | |
| 4 | Dashboard | |
| 5 | Apply Page | |
| 6 | Task Detail | |
| 7 | Settings Pages | |
| 8 | Navigation & Layout | |
| 9 | Error Handling | |
