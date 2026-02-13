import { initContract } from "@ts-rest/core";
import { authContract } from "./auth.js";
import { taskContract } from "./tasks.js";
import { taskEventContract } from "./task-events.js";
import { resumeContract, resumeCrudContract } from "./resumes.js";
import { qaBankContract } from "./qa-bank.js";
import { consentContract } from "./consent.js";
import { userContract } from "./users.js";
import { healthContract } from "./health.js";

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
};
