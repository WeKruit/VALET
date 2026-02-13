import { Resend } from "resend";

interface EmailServiceDeps {
  logger: { info: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
}

const FROM_ADDRESS = "WeKruit Valet <noreply@wekruit.com>";

export class EmailService {
  private resend: Resend | null;
  private logger: EmailServiceDeps["logger"];

  constructor({ logger }: EmailServiceDeps) {
    this.logger = logger;

    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.resend = null;
      this.logger.info({}, "RESEND_API_KEY not set — email sending disabled");
    }
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    const subject = "Welcome to WeKruit Valet";
    const html = `
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

    await this.send(to, subject, html);
  }

  async sendTaskCompleted(
    to: string,
    name: string,
    jobTitle: string,
    companyName: string,
  ): Promise<void> {
    const subject = `Application submitted: ${jobTitle} at ${companyName}`;
    const html = `
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

    await this.send(to, subject, html);
  }

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const webUrl = process.env.WEB_URL ?? "http://localhost:5173";
    const verifyUrl = `${webUrl}/verify-email?token=${token}`;
    const subject = "Verify your WeKruit Valet email";
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your email</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Hi ${escapeHtml(name)}, thanks for signing up for WeKruit Valet. Please verify your email address by clicking the button below.
  </p>
  <div style="margin: 32px 0;">
    <a href="${verifyUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500;">Verify Email</a>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #999;">
    This link expires in 24 hours. If you did not create this account, you can safely ignore this email.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();

    await this.send(to, subject, html);
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const webUrl = process.env.WEB_URL ?? "http://localhost:5173";
    const resetUrl = `${webUrl}/reset-password?token=${token}`;
    const subject = "Reset your WeKruit Valet password";
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #1a1a1a;">
  <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h1>
  <p style="font-size: 15px; line-height: 1.6; color: #4a4a4a;">
    Hi ${escapeHtml(name)}, we received a request to reset your password. Click the button below to set a new password.
  </p>
  <div style="margin: 32px 0;">
    <a href="${resetUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 500;">Reset Password</a>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #999;">
    This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.
  </p>
  <p style="font-size: 13px; color: #999; margin-top: 32px;">
    &mdash; The WeKruit Team
  </p>
</body>
</html>`.trim();

    await this.send(to, subject, html);
  }

  async sendAccountDeletion(to: string, name: string, gracePeriodDays: number): Promise<void> {
    const subject = "Your WeKruit Valet account deletion request";
    const html = `
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

    await this.send(to, subject, html);
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.info({ to, subject }, "Email skipped (no API key)");
      return;
    }

    try {
      await this.resend.emails.send({
        from: FROM_ADDRESS,
        to,
        subject,
        html,
      });
      this.logger.info({ to, subject }, "Email sent");
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
