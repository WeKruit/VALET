import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { tasks } from "./tasks.js";
import { taskEvents } from "./task-events.js";
import { resumes } from "./resumes.js";
import { qaBank } from "./qa-bank.js";
import { consentRecords } from "./consent-records.js";
import { browserProfiles } from "./browser-profiles.js";
import { applicationResults } from "./application-results.js";
import { applicationFields } from "./application-fields.js";
import { notifications } from "./notifications.js";
import { userSandboxes } from "./user-sandboxes.js";
import { sandboxes } from "./sandboxes.js";
import { platformCredentials } from "./platform-credentials.js";
import { mailboxCredentials } from "./mailbox-credentials.js";
import { resumeVariants } from "./resume-variants.js";
import { jobLeads } from "./job-leads.js";
import { submissionProofs } from "./submission-proofs.js";

export const usersRelations = relations(users, ({ many, one }) => ({
  tasks: many(tasks),
  resumes: many(resumes),
  qaBank: many(qaBank),
  consentRecords: many(consentRecords),
  browserProfiles: many(browserProfiles),
  notifications: many(notifications),
  sandboxAssignment: one(userSandboxes),
  platformCredentials: many(platformCredentials),
  mailboxCredentials: many(mailboxCredentials),
  resumeVariants: many(resumeVariants),
  jobLeads: many(jobLeads),
  submissionProofs: many(submissionProofs),
}));

export const userSandboxesRelations = relations(userSandboxes, ({ one }) => ({
  user: one(users, {
    fields: [userSandboxes.userId],
    references: [users.id],
  }),
  sandbox: one(sandboxes, {
    fields: [userSandboxes.sandboxId],
    references: [sandboxes.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  events: many(taskEvents),
  results: many(applicationResults),
  fields: many(applicationFields),
  resumeVariants: many(resumeVariants),
  jobLeads: many(jobLeads),
  submissionProofs: many(submissionProofs),
}));

export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, {
    fields: [taskEvents.taskId],
    references: [tasks.id],
  }),
}));

export const resumesRelations = relations(resumes, ({ one, many }) => ({
  user: one(users, {
    fields: [resumes.userId],
    references: [users.id],
  }),
  variants: many(resumeVariants),
}));

export const qaBankRelations = relations(qaBank, ({ one }) => ({
  user: one(users, {
    fields: [qaBank.userId],
    references: [users.id],
  }),
}));

export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
  user: one(users, {
    fields: [consentRecords.userId],
    references: [users.id],
  }),
}));

export const browserProfilesRelations = relations(browserProfiles, ({ one }) => ({
  user: one(users, {
    fields: [browserProfiles.userId],
    references: [users.id],
  }),
}));

export const applicationResultsRelations = relations(applicationResults, ({ one }) => ({
  task: one(tasks, {
    fields: [applicationResults.taskId],
    references: [tasks.id],
  }),
}));

export const applicationFieldsRelations = relations(applicationFields, ({ one }) => ({
  task: one(tasks, {
    fields: [applicationFields.applicationId],
    references: [tasks.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const platformCredentialsRelations = relations(platformCredentials, ({ one }) => ({
  user: one(users, {
    fields: [platformCredentials.userId],
    references: [users.id],
  }),
}));

export const mailboxCredentialsRelations = relations(mailboxCredentials, ({ one }) => ({
  user: one(users, {
    fields: [mailboxCredentials.userId],
    references: [users.id],
  }),
}));

export const resumeVariantsRelations = relations(resumeVariants, ({ one }) => ({
  user: one(users, {
    fields: [resumeVariants.userId],
    references: [users.id],
  }),
  baseResume: one(resumes, {
    fields: [resumeVariants.baseResumeId],
    references: [resumes.id],
  }),
  task: one(tasks, {
    fields: [resumeVariants.taskId],
    references: [tasks.id],
  }),
}));

export const jobLeadsRelations = relations(jobLeads, ({ one }) => ({
  user: one(users, {
    fields: [jobLeads.userId],
    references: [users.id],
  }),
  task: one(tasks, {
    fields: [jobLeads.taskId],
    references: [tasks.id],
  }),
}));

export const submissionProofsRelations = relations(submissionProofs, ({ one }) => ({
  task: one(tasks, {
    fields: [submissionProofs.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [submissionProofs.userId],
    references: [users.id],
  }),
}));
