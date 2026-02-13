import type { UserRepository } from "./user.repository.js";
import { AppError } from "../../common/errors.js";

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
      // Return defaults if no preferences exist yet
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
}
