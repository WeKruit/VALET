import Mailgun from "mailgun.js";
import FormData from "form-data";

export interface MailgunMessageData {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
}

export type MailgunClient = ReturnType<Mailgun["client"]>;

function getMailgunClient(): MailgunClient | null {
  const apiKey = process.env.MAILGUN_API_KEY;
  if (!apiKey) {
    return null;
  }
  const mailgun = new Mailgun(FormData);
  return mailgun.client({ username: "api", key: apiKey });
}

export async function sendEmail(
  to: string,
  content: { subject: string; html?: string; text?: string },
): Promise<string> {
  const mg = getMailgunClient();
  const domain = process.env.MAILGUN_DOMAIN || "wekruit.com";

  if (!mg) {
    console.warn("Mailgun not configured, skipping email send");
    return "";
  }

  try {
    const messageData = {
      from: `WeKruit <hi@${domain}>`,
      to: [to],
      subject: content.subject,
      text: content.text,
      html: content.html,
    };

    const response = await mg.messages.create(
      domain,
      messageData as Parameters<typeof mg.messages.create>[1],
    );

    return (response as { id?: string }).id || "";
  } catch (error) {
    const safeError = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to send email via Mailgun:", {
      subject: content.subject,
      error: safeError,
    });
    throw new Error(`Mailgun send failed: ${safeError}`);
  }
}
