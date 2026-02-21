import { initContract } from "@ts-rest/core";
import { authContract } from "./auth.js";
import { taskContract } from "./tasks.js";
import { taskEventContract } from "./task-events.js";
import { resumeContract, resumeCrudContract } from "./resumes.js";
import { qaBankContract } from "./qa-bank.js";
import { consentContract } from "./consent.js";
import { userContract } from "./users.js";
import { healthContract } from "./health.js";
import { gdprContract } from "./gdpr.js";
import { billingContract } from "./billing.js";
import { dashboardContract } from "./dashboard.js";
import { notificationContract } from "./notifications.js";
import { sandboxContract } from "./sandbox.js";
import { modelContract } from "./models.js";

const c = initContract();

export const apiContract = c.router({
  auth: authContract,
  tasks: taskContract,
  taskEvents: taskEventContract,
  resumes: resumeContract,
  qaBank: qaBankContract,
  consent: consentContract,
  users: userContract,
  health: healthContract,
  gdpr: gdprContract,
  billing: billingContract,
  dashboard: dashboardContract,
  notifications: notificationContract,
  sandboxes: sandboxContract,
  models: modelContract,
});

// Re-export individual contracts for consumers that only need one domain
export {
  authContract,
  taskContract,
  taskEventContract,
  resumeContract,
  resumeCrudContract,
  qaBankContract,
  consentContract,
  userContract,
  healthContract,
  gdprContract,
  billingContract,
  dashboardContract,
  notificationContract,
  sandboxContract,
  modelContract,
};
