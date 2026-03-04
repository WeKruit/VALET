import { eq, and, desc } from "drizzle-orm";
import { platformCredentials, mailboxCredentials, type Database } from "@valet/db";

export class CredentialRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  // ─── Platform Credentials ───

  async findPlatformById(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(platformCredentials)
      .where(and(eq(platformCredentials.id, id), eq(platformCredentials.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findPlatformByUserAndPlatform(userId: string, platform: string) {
    const rows = await this.db
      .select()
      .from(platformCredentials)
      .where(
        and(eq(platformCredentials.userId, userId), eq(platformCredentials.platform, platform)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listPlatformByUser(userId: string) {
    return this.db
      .select()
      .from(platformCredentials)
      .where(eq(platformCredentials.userId, userId))
      .orderBy(desc(platformCredentials.createdAt));
  }

  async createPlatform(data: {
    userId: string;
    platform: string;
    domain: string | null;
    loginIdentifier: string;
    encryptedSecret: string;
  }) {
    const rows = await this.db.insert(platformCredentials).values(data).returning();
    return rows[0]!;
  }

  async updatePlatform(id: string, data: Record<string, unknown>) {
    const rows = await this.db
      .update(platformCredentials)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(platformCredentials.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async deletePlatform(id: string) {
    await this.db.delete(platformCredentials).where(eq(platformCredentials.id, id));
  }

  // ─── Mailbox Credentials ───

  async findMailboxById(id: string, userId: string) {
    const rows = await this.db
      .select()
      .from(mailboxCredentials)
      .where(and(eq(mailboxCredentials.id, id), eq(mailboxCredentials.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findMailboxByUserAndProvider(userId: string, provider: string) {
    const rows = await this.db
      .select()
      .from(mailboxCredentials)
      .where(and(eq(mailboxCredentials.userId, userId), eq(mailboxCredentials.provider, provider)))
      .limit(1);
    return rows[0] ?? null;
  }

  async listMailboxByUser(userId: string) {
    return this.db
      .select()
      .from(mailboxCredentials)
      .where(eq(mailboxCredentials.userId, userId))
      .orderBy(desc(mailboxCredentials.createdAt));
  }

  async createMailbox(data: {
    userId: string;
    provider: string;
    emailAddress: string;
    encryptedSecret: string;
    accessMode: string;
    twoFactorEnabled: boolean;
  }) {
    const rows = await this.db.insert(mailboxCredentials).values(data).returning();
    return rows[0]!;
  }

  async updateMailbox(id: string, data: Record<string, unknown>) {
    const rows = await this.db
      .update(mailboxCredentials)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mailboxCredentials.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async deleteMailbox(id: string) {
    await this.db.delete(mailboxCredentials).where(eq(mailboxCredentials.id, id));
  }
}
