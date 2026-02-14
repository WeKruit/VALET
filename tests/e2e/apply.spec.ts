import { test, expect } from "@playwright/test";
import { authenticate, createTestUser, mockAuthMe } from "./helpers/auth";

test.describe("Apply Flow", () => {
  let user: ReturnType<typeof createTestUser>;

  test.beforeEach(async ({ page }) => {
    user = createTestUser();
    await authenticate(page.context(), user);
    await mockAuthMe(page, user);

    // Mock the tasks API for creation
    await page.route("**/api/v1/tasks", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "00000000-0000-0000-0000-000000000099",
            userId: user.id,
            jobUrl: body.jobUrl,
            platform: "linkedin",
            status: "created",
            mode: body.mode ?? "copilot",
            progress: 0,
            currentStep: null,
            confidenceScore: null,
            errorCode: null,
            errorMessage: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: null,
          }),
        });
      }
    });
  });

  test("apply page renders with URL input and instructions", async ({
    page,
  }) => {
    await page.goto("/apply");

    await expect(
      page.getByText(/ready to apply/i),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder(/paste a job url/i),
    ).toBeVisible();
    await expect(page.getByText(/copilot mode/i)).toBeVisible();
  });

  test("detects LinkedIn platform from URL", async ({ page }) => {
    await page.goto("/apply");

    const urlInput = page.getByPlaceholder(/paste a job url/i);
    await urlInput.fill("https://www.linkedin.com/jobs/view/1234567890");

    // Platform badge should appear
    await expect(page.getByText("LinkedIn")).toBeVisible();
    await expect(page.getByText(/easy apply detected/i)).toBeVisible();
  });

  test("detects Greenhouse platform from URL", async ({ page }) => {
    await page.goto("/apply");

    const urlInput = page.getByPlaceholder(/paste a job url/i);
    await urlInput.fill("https://boards.greenhouse.io/company/jobs/12345");

    await expect(page.getByText("Greenhouse")).toBeVisible();
  });

  test("detects Lever platform from URL", async ({ page }) => {
    await page.goto("/apply");

    const urlInput = page.getByPlaceholder(/paste a job url/i);
    await urlInput.fill("https://jobs.lever.co/company/12345");

    await expect(page.getByText("Lever")).toBeVisible();
  });

  test("start button is disabled without a valid URL", async ({ page }) => {
    await page.goto("/apply");

    const startButton = page.getByRole("button", {
      name: /start application/i,
    });
    await expect(startButton).toBeDisabled();
  });

  test("start button is disabled with an invalid URL", async ({ page }) => {
    await page.goto("/apply");

    await page.getByPlaceholder(/paste a job url/i).fill("not-a-url");

    const startButton = page.getByRole("button", {
      name: /start application/i,
    });
    await expect(startButton).toBeDisabled();
  });

  test("start button is disabled with unsupported platform", async ({
    page,
  }) => {
    await page.goto("/apply");

    await page
      .getByPlaceholder(/paste a job url/i)
      .fill("https://www.indeed.com/jobs/12345");

    const startButton = page.getByRole("button", {
      name: /start application/i,
    });
    await expect(startButton).toBeDisabled();
  });

  test("start button enables with a valid LinkedIn URL", async ({ page }) => {
    await page.goto("/apply");

    await page
      .getByPlaceholder(/paste a job url/i)
      .fill("https://www.linkedin.com/jobs/view/1234567890");

    const startButton = page.getByRole("button", {
      name: /start application/i,
    });
    await expect(startButton).toBeEnabled();
  });

  test("clicking Start Application creates a task and navigates to task detail", async ({
    page,
  }) => {
    await page.goto("/apply");

    await page
      .getByPlaceholder(/paste a job url/i)
      .fill("https://www.linkedin.com/jobs/view/1234567890");

    await page
      .getByRole("button", { name: /start application/i })
      .click();

    // Should navigate to the task detail page
    await expect(page).toHaveURL(
      /\/tasks\/00000000-0000-0000-0000-000000000099/,
    );
  });

  test("sample job links populate the URL input", async ({ page }) => {
    await page.goto("/apply");

    // Click the LinkedIn sample link
    await page.getByRole("button", { name: /linkedin easy apply/i }).click();

    const urlInput = page.getByPlaceholder(/paste a job url/i);
    await expect(urlInput).toHaveValue(
      "https://www.linkedin.com/jobs/view/12345",
    );
    await expect(page.getByText("LinkedIn")).toBeVisible();
  });

  test("shows loading state during task creation", async ({ page }) => {
    // Slow down the API response to catch the loading state
    await page.route("**/api/v1/tasks", async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "00000000-0000-0000-0000-000000000099",
            status: "created",
          }),
        });
      }
    });

    await page.goto("/apply");

    await page
      .getByPlaceholder(/paste a job url/i)
      .fill("https://www.linkedin.com/jobs/view/1234567890");

    await page
      .getByRole("button", { name: /start application/i })
      .click();

    // Should show "Starting..." text while request is in-flight
    await expect(page.getByText("Starting...")).toBeVisible();
  });

  test("task detail page shows progress timeline", async ({ page }) => {
    // Mock the task detail endpoint
    await page.route(
      "**/api/v1/tasks/00000000-0000-0000-0000-000000000099",
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "00000000-0000-0000-0000-000000000099",
            userId: user.id,
            jobUrl: "https://www.linkedin.com/jobs/view/1234567890",
            platform: "linkedin",
            status: "in_progress",
            mode: "copilot",
            progress: 35,
            currentStep: "analyzing",
            confidenceScore: null,
            errorCode: null,
            errorMessage: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: null,
          }),
        });
      },
    );

    await page.goto("/tasks/00000000-0000-0000-0000-000000000099");

    // Page heading
    await expect(page.getByText("Application Progress")).toBeVisible();

    // Task Details card
    await expect(page.getByText("Task Details")).toBeVisible();

    // Status badge shows "in progress"
    await expect(page.getByText("in progress")).toBeVisible();

    // Platform label shows "LinkedIn"
    await expect(page.getByText("LinkedIn")).toBeVisible();

    // Mode badge shows "copilot"
    await expect(page.getByText("copilot")).toBeVisible();

    // Progress percentage displayed
    await expect(page.getByText("35%")).toBeVisible();

    // Progress timeline card
    await expect(page.getByText("Progress")).toBeVisible();

    // Timeline steps: completed steps (before "analyzing") should be visible
    await expect(page.getByText("Queued")).toBeVisible();
    await expect(page.getByText("Starting")).toBeVisible();
    await expect(page.getByText("Navigating")).toBeVisible();
    await expect(page.getByText("Analyzing")).toBeVisible();

    // Current step description
    await expect(page.getByText("Reading form fields")).toBeVisible();
  });
});
