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
}
