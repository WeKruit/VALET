import { describe, it, expect } from "vitest";
import { UserFactory, TaskFactory, ResumeFactory } from "./index";

describe("UserFactory", () => {
  it("creates a user with all required fields", () => {
    const user = UserFactory.create();

    expect(user.id).toBeDefined();
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(user.email).toBe("test@example.com");
    expect(user.name).toBe("Test User");
    expect(user.googleId).toBeDefined();
    expect(user.avatarUrl).toBeNull();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("accepts overrides", () => {
    const user = UserFactory.create({
      email: "alice@example.com",
      name: "Alice",
    });

    expect(user.email).toBe("alice@example.com");
    expect(user.name).toBe("Alice");
    expect(user.id).toBeDefined();
  });

  it("generates unique IDs for each call", () => {
    const user1 = UserFactory.create();
    const user2 = UserFactory.create();

    expect(user1.id).not.toBe(user2.id);
  });

  it("creates multiple users with unique emails", () => {
    const users = UserFactory.createMany(3);

    expect(users).toHaveLength(3);
    expect(users[0].email).toBe("testuser1@example.com");
    expect(users[1].email).toBe("testuser2@example.com");
    expect(users[2].email).toBe("testuser3@example.com");
    // All unique IDs
    const ids = new Set(users.map((u) => u.id));
    expect(ids.size).toBe(3);
  });
});

describe("TaskFactory", () => {
  it("creates a task with all required fields", () => {
    const task = TaskFactory.create();

    expect(task.id).toBeDefined();
    expect(task.userId).toBeDefined();
    expect(task.jobUrl).toContain("linkedin.com/jobs/view/");
    expect(task.platform).toBe("linkedin");
    expect(task.status).toBe("created");
    expect(task.mode).toBe("copilot");
    expect(task.progress).toBe(0);
    expect(task.currentStep).toBeNull();
    expect(task.confidenceScore).toBeNull();
    expect(task.errorCode).toBeNull();
    expect(task.errorMessage).toBeNull();
    expect(task.createdAt).toBeInstanceOf(Date);
    expect(task.updatedAt).toBeInstanceOf(Date);
    expect(task.completedAt).toBeNull();
  });

  it("accepts overrides", () => {
    const task = TaskFactory.create({
      platform: "greenhouse",
      status: "in_progress",
      mode: "autopilot",
    });

    expect(task.platform).toBe("greenhouse");
    expect(task.status).toBe("in_progress");
    expect(task.mode).toBe("autopilot");
  });

  it("creates a completed task", () => {
    const task = TaskFactory.createCompleted();

    expect(task.status).toBe("completed");
    expect(task.progress).toBe(100);
    expect(task.currentStep).toBe("submitted");
    expect(task.confidenceScore).toBe(0.95);
    expect(task.completedAt).toBeInstanceOf(Date);
  });

  it("creates a failed task", () => {
    const task = TaskFactory.createFailed();

    expect(task.status).toBe("failed");
    expect(task.errorCode).toBe("FORM_FILL_ERROR");
    expect(task.errorMessage).toBeDefined();
    expect(task.progress).toBe(45);
  });

  it("creates an in-progress task", () => {
    const task = TaskFactory.createInProgress();

    expect(task.status).toBe("in_progress");
    expect(task.progress).toBe(60);
    expect(task.currentStep).toBe("filling_form");
    expect(task.confidenceScore).toBe(0.87);
  });

  it("creates multiple tasks", () => {
    const tasks = TaskFactory.createMany(5);

    expect(tasks).toHaveLength(5);
    const ids = new Set(tasks.map((t) => t.id));
    expect(ids.size).toBe(5);
  });

  it("generates unique IDs for each call", () => {
    const task1 = TaskFactory.create();
    const task2 = TaskFactory.create();

    expect(task1.id).not.toBe(task2.id);
    expect(task1.userId).not.toBe(task2.userId);
  });
});

describe("ResumeFactory", () => {
  it("creates a resume with all required fields", () => {
    const resume = ResumeFactory.create();

    expect(resume.id).toBeDefined();
    expect(resume.userId).toBeDefined();
    expect(resume.filename).toBe("alice-johnson-resume.pdf");
    expect(resume.mimeType).toBe("application/pdf");
    expect(resume.sizeBytes).toBe(245_760);
    expect(resume.storageKey).toContain("resumes/");
    expect(resume.isPrimary).toBe(true);
    expect(resume.createdAt).toBeInstanceOf(Date);
    expect(resume.updatedAt).toBeInstanceOf(Date);
  });

  it("includes parsed data by default", () => {
    const resume = ResumeFactory.create();

    expect(resume.parsedData).not.toBeNull();
    expect(resume.parsedData!.name).toBe("Alice Johnson");
    expect(resume.parsedData!.email).toBe("alice@example.com");
    expect(resume.parsedData!.skills).toContain("TypeScript");
    expect(resume.parsedData!.experience).toHaveLength(3);
    expect(resume.parsedData!.education).toHaveLength(1);
  });

  it("creates an unparsed resume", () => {
    const resume = ResumeFactory.createUnparsed();

    expect(resume.parsedData).toBeNull();
    expect(resume.filename).toBe("alice-johnson-resume.pdf");
  });

  it("accepts overrides", () => {
    const resume = ResumeFactory.create({
      filename: "custom-resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isPrimary: false,
    });

    expect(resume.filename).toBe("custom-resume.docx");
    expect(resume.isPrimary).toBe(false);
  });

  it("creates multiple resumes with first as primary", () => {
    const resumes = ResumeFactory.createMany(3);

    expect(resumes).toHaveLength(3);
    expect(resumes[0].isPrimary).toBe(true);
    expect(resumes[1].isPrimary).toBe(false);
    expect(resumes[2].isPrimary).toBe(false);
  });

  it("generates unique IDs for each call", () => {
    const resume1 = ResumeFactory.create();
    const resume2 = ResumeFactory.create();

    expect(resume1.id).not.toBe(resume2.id);
    expect(resume1.storageKey).not.toBe(resume2.storageKey);
  });
});
