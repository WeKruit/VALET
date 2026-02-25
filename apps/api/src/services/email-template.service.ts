// @ts-expect-error -- mjml has no type declarations
import mjml2html from "mjml";
import Handlebars from "handlebars";
import { eq } from "drizzle-orm";
import { emailTemplates } from "@valet/db";
import type { Database } from "@valet/db";
import type { FastifyBaseLogger } from "fastify";

export class EmailTemplateService {
  private db: Database;
  private logger: FastifyBaseLogger;

  constructor({ db, logger }: { db: Database; logger: FastifyBaseLogger }) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Load a template by name, compile variables with Handlebars,
   * render MJML body to HTML, and return the final result.
   */
  async render(
    templateName: string,
    variables: Record<string, string | number>,
  ): Promise<{ subject: string; html: string; text: string | null }> {
    const template = await this.getByName(templateName);

    if (!template) {
      throw new Error(`Email template "${templateName}" not found`);
    }

    if (!template.isActive) {
      throw new Error(`Email template "${templateName}" is inactive`);
    }

    // Validate required variables
    const requiredVars = (template.variables ?? []).filter(
      (v: { name: string; required: boolean }) => v.required,
    );
    for (const v of requiredVars) {
      if (variables[v.name] === undefined || variables[v.name] === null) {
        throw new Error(`Missing required variable "${v.name}" for template "${templateName}"`);
      }
    }

    // Compile subject with Handlebars
    const subjectTemplate = Handlebars.compile(template.subject);
    const subject = subjectTemplate(variables);

    // Compile MJML body with Handlebars, then render MJML to HTML
    const mjmlTemplate = Handlebars.compile(template.mjmlBody);
    const mjmlSource = mjmlTemplate(variables);

    const { html, errors } = mjml2html(mjmlSource, {
      validationLevel: "soft",
    });

    if (errors.length > 0) {
      this.logger.warn({ templateName, errors }, "MJML compilation produced warnings");
    }

    // Compile text body with Handlebars (if exists)
    let text: string | null = null;
    if (template.textBody) {
      const textTemplate = Handlebars.compile(template.textBody);
      text = textTemplate(variables);
    }

    this.logger.info(
      { templateName, variableCount: Object.keys(variables).length },
      "Email template rendered",
    );

    return { subject, html, text };
  }

  /**
   * Fetch a single template by its unique name.
   */
  async getByName(name: string) {
    const rows = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);

    return rows[0] ?? null;
  }

  /**
   * List templates with optional active filter.
   */
  async list(filter?: { isActive?: boolean }) {
    if (filter?.isActive !== undefined) {
      return this.db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.isActive, filter.isActive));
    }

    return this.db.select().from(emailTemplates);
  }
}
