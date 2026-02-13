import { relations } from "drizzle-orm";
import { users } from "./users";
import { tasks } from "./tasks";
import { taskEvents } from "./task-events";
import { resumes } from "./resumes";
import { qaBank } from "./qa-bank";
import { consentRecords } from "./consent-records";
import { browserProfiles } from "./browser-profiles";
import { applicationResults } from "./application-results";
import { auditTrail } from "./audit-trail";
import { applicationFields } from "./application-fields";

export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  resumes: many(resumes),
  qaBank: many(qaBank),
  consentRecords: many(consentRecords),
  browserProfiles: many(browserProfiles),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id],
  }),
  events: many(taskEvents),
  results: many(applicationResults),
  fields: many(applicationFields),
}));

export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, {
    fields: [taskEvents.taskId],
    references: [tasks.id],
  }),
}));

export const resumesRelations = relations(resumes, ({ one }) => ({
  user: one(users, {
    fields: [resumes.userId],
    references: [users.id],
  }),
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
