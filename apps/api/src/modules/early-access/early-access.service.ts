import { AppError } from "../../common/errors.js";
import type { EarlyAccessRepository } from "./early-access.repository.js";
import type { EmailService } from "../../services/email.service.js";

export class EarlyAccessService {
  private earlyAccessRepo: EarlyAccessRepository;
  private emailService: EmailService;

  constructor({
    earlyAccessRepo,
    emailService,
  }: {
    earlyAccessRepo: EarlyAccessRepository;
    emailService: EmailService;
  }) {
    this.earlyAccessRepo = earlyAccessRepo;
    this.emailService = emailService;
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

    // Update status to promoted
    await this.earlyAccessRepo.updateEmailStatus(id, "promoted", new Date());

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
