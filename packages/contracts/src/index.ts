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
import { earlyAccessContract } from "./early-access.js";
import { earlyAccessAdminContract } from "./admin/early-access-admin.js";
import { emailTemplatesAdminContract } from "./admin/email-templates-admin.js";
import { credentialContract } from "./credentials.js";
import { fitLabContract } from "./fit-lab.js";
import { insightsContract } from "./insights.js";
import { jobLeadContract } from "./job-leads.js";
import { referralContract } from "./referrals.js";
import { creditContract } from "./credits.js";

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
  earlyAccess: earlyAccessContract,
  earlyAccessAdmin: earlyAccessAdminContract,
  emailTemplatesAdmin: emailTemplatesAdminContract,
  credentials: credentialContract,
  fitLab: fitLabContract,
  insights: insightsContract,
  jobLeads: jobLeadContract,
  referrals: referralContract,
  credits: creditContract,
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
  earlyAccessContract,
  earlyAccessAdminContract,
  emailTemplatesAdminContract,
  credentialContract,
  fitLabContract,
  insightsContract,
  jobLeadContract,
  referralContract,
  creditContract,
};
