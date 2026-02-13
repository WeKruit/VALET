import { test, expect } from "@playwright/test";
import { authenticate, createTestUser, mockAuthMe } from "./helpers/auth";
import path from "node:path";

test.describe("Onboarding Flow", () => {
  test.beforeEach(async ({ page }) => {
    const user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);
  });

  test("displays step 1: resume upload", async ({ page }) => {
    await page.goto("/onboarding");

    // Step indicators should be visible
    await expect(page.getByText("Sign Up")).toBeVisible();
    await expect(page.getByText("Resume")).toBeVisible();
    await expect(page.getByText("Quick Review")).toBeVisible();

    // Resume upload area should be present
    // TODO: Verify the exact upload component once it has data-testid attributes
    await expect(page.getByText(/upload.*resume/i)).toBeVisible();
  });

  test("accepts resume via file input", async ({ page }) => {
    await page.goto("/onboarding");

    // Mock the resume upload API endpoint
    await page.route("**/api/v1/resumes", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "00000000-0000-0000-0000-000000000001",
            filename: "alice-johnson-resume.pdf",
            parsedData: {
              name: "Alice Johnson",
              email: "alice@example.com",
              phone: "(555) 123-4567",
              location: "San Francisco, CA",
              skills: ["TypeScript", "React", "Node.js"],
              experience: [
                {
                  company: "TechCorp",
                  title: "Senior Engineer",
                  startDate: "2022-01",
                  endDate: null,
                },
              ],
              education: [
                {
                  institution: "UC Berkeley",
                  degree: "B.S.",
                  field: "Computer Science",
                  graduationDate: "2019-05",
                },
              ],
            },
          }),
        });
      }
    });

    // Upload a test file
    const fileInput = page.locator('input[type="file"]');
    // TODO: Replace with actual test PDF fixture path
    // await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-resume.pdf'));

    // For now, verify the file input exists and accepts PDF
    await expect(fileInput).toHaveCount(1);
  });

  test("advances to step 2: quick review after upload", async ({ page }) => {
    await page.goto("/onboarding");

    // Mock resume upload
    await page.route("**/api/v1/resumes", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "00000000-0000-0000-0000-000000000001",
            filename: "resume.pdf",
            parsedData: {
              name: "Alice Johnson",
              email: "alice@example.com",
              phone: "(555) 123-4567",
              location: "San Francisco, CA",
              skills: ["TypeScript", "React"],
              experience: [],
              education: [],
            },
          }),
        });
      }
    });

    // TODO: Trigger upload and advance to review step
    // Once resume upload component has proper test hooks:
    //   await fileInput.setInputFiles('test-resume.pdf');
    //   await expect(page.getByText('Alice Johnson')).toBeVisible();
    //   await expect(page.getByText('alice@example.com')).toBeVisible();
  });

  test("step 2: quick review shows parsed resume fields", async ({ page }) => {
    // TODO: Navigate through step 1 first, then verify parsed fields:
    //   - Name, email, phone, location are displayed
    //   - Skills are shown as tags
    //   - Experience entries are listed
    //   - A "Confirm" or "Continue" button is available
    await page.goto("/onboarding");
  });

  test("completing review navigates to /dashboard", async ({ page }) => {
    // TODO: Complete the full onboarding flow:
    //   1. Upload resume (step 1)
    //   2. Confirm parsed data (step 2)
    //   3. Verify redirect to /dashboard
    await page.goto("/onboarding");

    // The final step should redirect to dashboard
    // await expect(page).toHaveURL(/\/dashboard/);
  });

  test("onboarding completes within 90 seconds", async ({ page }) => {
    // Doc 05 specifies 3-step onboarding should complete within 90 seconds
    const startTime = Date.now();

    await page.goto("/onboarding");

    // TODO: Automate full flow once components are wired:
    //   1. Upload resume
    //   2. Confirm review
    //   3. Select mode
    //   4. Assert elapsed < 90s

    const elapsed = Date.now() - startTime;
    // Placeholder assertion - enable once full flow is implemented
    // expect(elapsed).toBeLessThan(90_000);
  });
});
