import { eq, inArray, sql } from "drizzle-orm";
import { users, type Database } from "@valet/db";

export class UserRepository {
  private db: Database;

  constructor({ db }: { db: Database }) {
    this.db = db;
  }

  async findById(id: string) {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  }

  async findByEmail(email: string) {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  }

  async findByGoogleId(googleId: string) {
    const rows = await this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return rows[0] ?? null;
  }

  async create(data: { email: string; name: string; avatarUrl?: string; googleId: string }) {
    const rows = await this.db
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl ?? null,
        googleId: data.googleId,
      })
      .returning();
    return rows[0]!;
  }

  async updateProfile(id: string, data: Record<string, unknown>) {
    const rows = await this.db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async getPreferences(userId: string) {
    const rows = await this.db
      .select({ preferences: users.preferences })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0]?.preferences ?? null;
  }

  async updatePreferences(id: string, preferences: Record<string, unknown>) {
    const rows = await this.db
      .update(users)
      .set({ preferences, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async findAdminUserIds(): Promise<string[]> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["admin", "superadmin"]));
    return rows.map((r) => r.id);
  }

  async mergePreferences(id: string, partialPreferences: Record<string, unknown>) {
    const rows = await this.db
      .update(users)
      .set({
        preferences: sql`COALESCE(${users.preferences}, '{}'::jsonb) || ${JSON.stringify(partialPreferences)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
