import { sendEmail } from "../helpers/mailgun.js";
import type { EmailTemplateService } from "./email-template.service.js";

interface EmailServiceDeps {
  logger: {
    info: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
  emailTemplateService: EmailTemplateService;
}

export class EmailService {
  private logger: EmailServiceDeps["logger"];
  private emailTemplateService: EmailTemplateService;

  constructor({ logger, emailTemplateService }: EmailServiceDeps) {
    this.logger = logger;
    this.emailTemplateService = emailTemplateService;
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    let subject: string;
    let html: string;
    let text: string | undefined;

    try {
      const rendered = await this.emailTemplateService.render("welcome", {
        name,
      });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text ?? undefined;
    } catch {
      // Fallback to hardcoded HTML
      subject = "Welcome to WeKruit Valet";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Welcome to Valet, ${escapeHtml(name)}</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Your AI-powered job application assistant is ready. Valet helps you apply to jobs faster by automating form filling, tailoring your resume, and tracking your applications.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    To get started:
  </p>
  <ol style="font-size: 15px; line-height: 1.8; color: #4a4a4a; padding-left: 20px;">
    <li>Upload your resume</li>
    <li>Add common Q&amp;A answers to your bank</li>
    <li>Submit your first job URL and let Valet handle the rest</li>
  </ol>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();
    }

    await this.send(to, subject, html, text);
  }

  async sendTaskCompleted(
    to: string,
    name: string,
    jobTitle: string,
    companyName: string,
  ): Promise<void> {
    let subject: string;
    let html: string;
    let text: string | undefined;

    try {
      const rendered = await this.emailTemplateService.render("task_completed", {
        name,
        jobTitle,
        companyName,
      });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text ?? undefined;
    } catch {
      // Fallback to hardcoded HTML
      subject = `Application submitted: ${jobTitle} at ${companyName}`;
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Application Submitted</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Hi ${escapeHtml(name)}, your application for <strong>${escapeHtml(jobTitle)}</strong> at <strong>${escapeHtml(companyName)}</strong> has been submitted successfully.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Log in to your dashboard to review the details and track your application status.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();
    }

    await this.send(to, subject, html, text);
  }

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const webUrl = process.env.WEB_URL ?? "http://localhost:5173";
    const verifyUrl = `${webUrl}/verify-email?token=${encodeURIComponent(token)}`;

    let subject: string;
    let html: string;
    let text: string | undefined;

    try {
      const rendered = await this.emailTemplateService.render("email_verification", {
        name,
        verifyUrl,
      });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text ?? undefined;
    } catch {
      // Fallback to hardcoded HTML
      subject = "Verify your WeKruit Valet email";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your email</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Hi ${escapeHtml(name)}, thanks for signing up for WeKruit Valet. Please verify your email address by clicking the button below.
  </p>
  <div style="margin: 32px 0;">
    <a href="${escapeHtml(verifyUrl)}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500;">Verify Email</a>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #999;">
    This link expires in 24 hours. If you did not create this account, you can safely ignore this email.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();
    }

    await this.send(to, subject, html, text);
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const webUrl = process.env.WEB_URL ?? "http://localhost:5173";
    const resetUrl = `${webUrl}/reset-password?token=${encodeURIComponent(token)}`;

    let subject: string;
    let html: string;
    let text: string | undefined;

    try {
      const rendered = await this.emailTemplateService.render("password_reset", { name, resetUrl });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text ?? undefined;
    } catch {
      // Fallback to hardcoded HTML
      subject = "Reset your WeKruit Valet password";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Hi ${escapeHtml(name)}, we received a request to reset your password. Click the button below to set a new password.
  </p>
  <div style="margin: 32px 0;">
    <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500;">Reset Password</a>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #999;">
    This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();
    }

    await this.send(to, subject, html, text);
  }

  async sendAccountDeletion(to: string, name: string, gracePeriodDays: number): Promise<void> {
    let subject: string;
    let html: string;
    let text: string | undefined;

    try {
      const rendered = await this.emailTemplateService.render("account_deletion", {
        name,
        gracePeriodDays,
      });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text ?? undefined;
    } catch {
      // Fallback to hardcoded HTML
      subject = "Your WeKruit Valet account deletion request";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Account Deletion Requested</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Hi ${escapeHtml(name)}, we received your request to delete your Valet account.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Your account has been deactivated. You have <strong>${gracePeriodDays} days</strong> to change your mind before your data is permanently erased. To cancel, simply log in and reactivate your account.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    If you did not make this request, please contact us immediately.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();
    }

    await this.send(to, subject, html, text);
  }

  async sendEarlyAccessConfirmation(to: string, name: string, position: number): Promise<void> {
    let subject: string;
    let html: string;
    let text: string | undefined;

    try {
      const rendered = await this.emailTemplateService.render("early_access_confirmation", {
        name,
        position,
      });
      subject = rendered.subject;
      html = rendered.html;
      text = rendered.text ?? undefined;
    } catch {
      // Fallback to hardcoded HTML
      subject = "You're on the WeKruit Valet waitlist!";
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">You're on the list, ${escapeHtml(name)}!</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Thanks for signing up for early access to WeKruit Valet. You're <strong>#${position}</strong> on the waitlist.
  </p>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    We're rolling out access in waves and will notify you as soon as it's your turn. In the meantime, keep an eye on your inbox.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();
    }

    await this.send(to, subject, html, text);
  }

  private async send(to: string, subject: string, html: string, text?: string): Promise<void> {
    try {
      await sendEmail(to, { subject, html, text });
      this.logger.info({ to, subject }, "Email sent via Mailgun");
    } catch (error) {
      this.logger.error({ to, subject, error }, "Failed to send email");
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
