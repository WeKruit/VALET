import { eq } from "drizzle-orm";
import { emailTemplates, type Database } from "@valet/db";

export class EmailTemplatesRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async list(filter?: { isActive?: boolean }) {
    if (filter?.isActive !== undefined) {
      return this.db
        .select()
        .from(emailTemplates)
        .where(eq(emailTemplates.isActive, filter.isActive));
    }
    return this.db.select().from(emailTemplates);
  }

  async getByName(name: string) {
    const rows = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: {
    name: string;
    description?: string;
    subject: string;
    mjmlBody: string;
    textBody?: string;
    variables?: Array<{ name: string; required: boolean }>;
    isActive?: boolean;
  }) {
    const rows = await this.db
      .insert(emailTemplates)
      .values({
        name: data.name,
        description: data.description ?? null,
        subject: data.subject,
        mjmlBody: data.mjmlBody,
        textBody: data.textBody ?? null,
        variables: data.variables ?? [],
        isActive: data.isActive ?? true,
      })
      .returning();
    return rows[0]!;
  }

  async update(
    name: string,
    data: {
      description?: string;
      subject?: string;
      mjmlBody?: string;
      textBody?: string | null;
      variables?: Array<{ name: string; required: boolean }>;
      isActive?: boolean;
    },
  ) {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (data.description !== undefined) updateData.description = data.description;
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.mjmlBody !== undefined) updateData.mjmlBody = data.mjmlBody;
    if (data.textBody !== undefined) updateData.textBody = data.textBody;
    if (data.variables !== undefined) updateData.variables = data.variables;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const rows = await this.db
      .update(emailTemplates)
      .set(updateData)
      .where(eq(emailTemplates.name, name))
      .returning();
    return rows[0] ?? null;
  }

  async deleteByName(name: string) {
    const rows = await this.db
      .delete(emailTemplates)
      .where(eq(emailTemplates.name, name))
      .returning();
    return rows[0] ?? null;
  }
}
