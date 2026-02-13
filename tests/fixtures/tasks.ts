import { randomUUID } from "node:crypto";

export type TaskStatus =
  | "created"
  | "queued"
  | "in_progress"
  | "waiting_human"
  | "completed"
  | "failed"
  | "cancelled";

export type Platform = "linkedin" | "greenhouse" | "lever" | "workday" | "unknown";
export type ApplicationMode = "copilot" | "autopilot";

export interface Task {
  id: string;
  userId: string;
  jobUrl: string;
  platform: Platform;
  status: TaskStatus;
  mode: ApplicationMode;
  progress: number;
  currentStep: string | null;
  confidenceScore: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export const TaskFactory = {
  create: (overrides?: Partial<Task>): Task => ({
    id: randomUUID(),
    userId: randomUUID(),
    jobUrl: `https://www.linkedin.com/jobs/view/${Math.floor(Math.random() * 9000000000) + 1000000000}`,
    platform: "linkedin",
    status: "created",
    mode: "copilot",
    progress: 0,
    currentStep: null,
    confidenceScore: null,
    errorCode: null,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  }),

  createCompleted: (overrides?: Partial<Task>): Task =>
    TaskFactory.create({
      status: "completed",
      progress: 100,
      currentStep: "submitted",
      confidenceScore: 0.95,
      completedAt: new Date(),
      ...overrides,
    }),

  createFailed: (overrides?: Partial<Task>): Task =>
    TaskFactory.create({
      status: "failed",
      progress: 45,
      currentStep: "filling_form",
      errorCode: "FORM_FILL_ERROR",
      errorMessage: "Could not identify required field: custom dropdown",
      ...overrides,
    }),

  createInProgress: (overrides?: Partial<Task>): Task =>
    TaskFactory.create({
      status: "in_progress",
      progress: 60,
      currentStep: "filling_form",
      confidenceScore: 0.87,
      ...overrides,
    }),

  createMany: (count: number, overrides?: Partial<Task>): Task[] =>
    Array.from({ length: count }, () => TaskFactory.create(overrides)),
};
