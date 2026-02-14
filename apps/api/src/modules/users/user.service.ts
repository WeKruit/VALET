import type { UserRepository } from "./user.repository.js";
import { AppError } from "../../common/errors.js";
import type { JobPreferences, NotificationPreferences } from "@valet/shared/schemas";

export class UserService {
  private userRepo: UserRepository;

  constructor({ userRepo }: { userRepo: UserRepository }) {
    this.userRepo = userRepo;
  }

  async getById(id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) throw AppError.notFound("User not found");
    return user;
  }

  async getByEmail(email: string) {
    return this.userRepo.findByEmail(email);
  }

  async updateProfile(userId: string, data: Record<string, unknown>) {
    await this.userRepo.updateProfile(userId, data);
    return this.getById(userId);
  }

  async getPreferences(userId: string) {
    const prefs = await this.userRepo.getPreferences(userId);
    if (!prefs) {
      return {
        submissionMode: "review_before_submit" as const,
        confidenceThreshold: 90,
        dailyLimit: 20,
        minDelayMinutes: 2,
      };
    }
    return prefs;
  }

  async updatePreferences(
    userId: string,
    preferences: Record<string, unknown>,
  ) {
    await this.userRepo.updatePreferences(userId, preferences);
    return this.getPreferences(userId);
  }

  async getJobPreferences(userId: string): Promise<JobPreferences | null> {
    const allPrefs = await this.userRepo.getPreferences(userId);
    const prefs = allPrefs as Record<string, unknown> | null;
    return (prefs?.jobPreferences as JobPreferences | undefined) ?? null;
  }

  async updateJobPreferences(
    userId: string,
    jobPreferences: Partial<JobPreferences>,
  ): Promise<JobPreferences> {
    const existing = await this.getJobPreferences(userId);
    const merged: JobPreferences = {
      targetJobTitles: [],
      preferredLocations: [],
      remotePreference: "any",
      excludedCompanies: [],
      preferredIndustries: [],
      ...existing,
      ...jobPreferences,
    };
    await this.userRepo.mergePreferences(userId, { jobPreferences: merged });
    return merged;
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | null> {
    const allPrefs = await this.userRepo.getPreferences(userId);
    const prefs = allPrefs as Record<string, unknown> | null;
    return (prefs?.notificationPreferences as NotificationPreferences | undefined) ?? null;
  }

  async updateNotificationPreferences(
    userId: string,
    notificationPreferences: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    const existing = await this.getNotificationPreferences(userId);
    const merged: NotificationPreferences = {
      taskCompleted: true,
      taskFailed: true,
      resumeParsed: true,
      ...existing,
      ...notificationPreferences,
    };
    await this.userRepo.mergePreferences(userId, { notificationPreferences: merged });
    return merged;
  }
}
