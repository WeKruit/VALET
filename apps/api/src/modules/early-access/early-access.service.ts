import { eq } from "drizzle-orm";
import { users, type Database } from "@valet/db";
import { AppError } from "../../common/errors.js";
import type { EarlyAccessRepository } from "./early-access.repository.js";
import type { EmailService } from "../../services/email.service.js";
import type { AuthService } from "../auth/auth.service.js";
import type { CreditService } from "../credits/credit.service.js";

export class EarlyAccessService {
  private earlyAccessRepo: EarlyAccessRepository;
  private emailService: EmailService;
  private db: Database;
  private authService: AuthService;
  private creditService: CreditService;

  constructor({
    earlyAccessRepo,
    emailService,
    db,
    authService,
    creditService,
  }: {
    earlyAccessRepo: EarlyAccessRepository;
    emailService: EmailService;
    db: Database;
    authService: AuthService;
    creditService: CreditService;
  }) {
    this.earlyAccessRepo = earlyAccessRepo;
    this.emailService = emailService;
    this.db = db;
    this.authService = authService;
    this.creditService = creditService;
  }

  async submit(data: { email: string; name: string; source?: string; referralCode?: string }) {
    const existing = await this.earlyAccessRepo.findByEmail(data.email);
    if (existing) {
      throw AppError.conflict("You're already on the waitlist. We'll reach out soon!");
    }

    await this.earlyAccessRepo.create(data);
    const count = await this.earlyAccessRepo.countAll();

    // Fire-and-forget confirmation email
    this.emailService.sendEarlyAccessConfirmation(data.email, data.name, count).catch(() => {});

    return {
      message: "You're on the list! We'll notify you when early access opens.",
      position: count,
    };
  }

  async listSubmissions(opts: {
    page: number;
    limit: number;
    emailStatus?: string;
    search?: string;
  }) {
    return this.earlyAccessRepo.list(opts);
  }

  async getStats() {
    return this.earlyAccessRepo.getStats();
  }

  async promoteToBeta(id: string) {
    const submission = await this.earlyAccessRepo.getById(id);
    if (!submission) {
      throw AppError.notFound("Early access submission not found");
    }

    // Update early_access_submissions status
    await this.earlyAccessRepo.updateEmailStatus(id, "promoted", new Date());

    // Update user's role in the users table
    const userRows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, submission.email))
      .limit(1);

    if (userRows[0]) {
      await this.db
        .update(users)
        .set({ role: "beta", updatedAt: new Date() })
        .where(eq(users.id, userRows[0].id));

      // Revoke all tokens so user gets a fresh JWT with the new role
      await this.authService.revokeAllUserTokens(userRows[0].id);

      // Issue 50 trial credits with 30-day expiry
      const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await this.creditService.grantCredits(userRows[0].id, 50, "trial", {
        description: "Welcome trial credits (30-day expiry)",
        idempotencyKey: `trial-promo-${userRows[0].id}`,
      });
      await this.db
        .update(users)
        .set({ trialCreditsExpireAt: thirtyDays })
        .where(eq(users.id, userRows[0].id));
    }

    // Fire-and-forget beta welcome email
    this.emailService.sendWelcome(submission.email, submission.name).catch(() => {});

    return { message: `Promoted ${submission.email} to beta access` };
  }

  async resendEmail(id: string) {
    const submission = await this.earlyAccessRepo.getById(id);
    if (!submission) {
      throw AppError.notFound("Early access submission not found");
    }

    const count = await this.earlyAccessRepo.countAll();

    // Re-send confirmation email
    await this.emailService.sendEarlyAccessConfirmation(submission.email, submission.name, count);

    // Update email status
    await this.earlyAccessRepo.updateEmailStatus(id, "sent", new Date());

    return { message: `Resent confirmation email to ${submission.email}` };
  }

  async removeSubmission(id: string) {
    const submission = await this.earlyAccessRepo.getById(id);
    if (!submission) {
      throw AppError.notFound("Early access submission not found");
    }

    await this.earlyAccessRepo.deleteById(id);

    return { message: `Removed ${submission.email} from early access list` };
  }
}
