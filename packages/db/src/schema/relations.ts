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

export const usersRelations = relations(users, ({ many }) => ({
  tasks: many(tasks),
  resumes: many(resumes),
  qaBank: many(qaBank),
  consentRecords: many(consentRecords),
  browserProfiles: many(browserProfiles),
  notifications: many(notifications),
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

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
