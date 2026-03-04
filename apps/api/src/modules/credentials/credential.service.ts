import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { CredentialRepository } from "./credential.repository.js";
import { AppError } from "../../common/errors.js";
import type {
  PlatformCredentialResponse,
  MailboxCredentialResponse,
  CredentialReadinessResponse,
} from "@valet/shared/schemas";

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY ?? "";
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/** Known platforms we evaluate readiness for */
const TRACKED_PLATFORMS = ["linkedin", "greenhouse", "lever", "workday"] as const;

function getKey(): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY is not set");
  }
  return scryptSync(ENCRYPTION_KEY, "valet-cred-salt", 32);
}

function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + ciphertext)
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

function toPlatformResponse(row: Record<string, unknown>): PlatformCredentialResponse {
  return {
    id: row.id as string,
    platform: row.platform as string,
    domain: (row.domain as string) ?? null,
    loginIdentifier: row.loginIdentifier as string,
    status: row.status as string,
    lastVerifiedAt: (row.lastVerifiedAt as Date) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

function toMailboxResponse(row: Record<string, unknown>): MailboxCredentialResponse {
  return {
    id: row.id as string,
    provider: row.provider as string,
    emailAddress: row.emailAddress as string,
    accessMode: row.accessMode as string,
    twoFactorEnabled: row.twoFactorEnabled as boolean,
    status: row.status as string,
    lastVerifiedAt: (row.lastVerifiedAt as Date) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

export class CredentialService {
  private credentialRepo: CredentialRepository;
  private logger: FastifyBaseLogger;

  constructor({
    credentialRepo,
    logger,
  }: {
    credentialRepo: CredentialRepository;
    logger: FastifyBaseLogger;
  }) {
    this.credentialRepo = credentialRepo;
    this.logger = logger;
  }

  // ─── Platform Credentials ───

  async listPlatformCredentials(userId: string) {
    const rows = await this.credentialRepo.listPlatformByUser(userId);
    return rows.map((r) => toPlatformResponse(r as unknown as Record<string, unknown>));
  }

  async createPlatformCredential(
    userId: string,
    data: { platform: string; domain?: string | null; loginIdentifier: string; secret: string },
  ) {
    const existing = await this.credentialRepo.findPlatformByUserAndPlatform(userId, data.platform);
    if (existing) {
      throw AppError.conflict(`Credential for ${data.platform} already exists. Update it instead.`);
    }

    const row = await this.credentialRepo.createPlatform({
      userId,
      platform: data.platform,
      domain: data.domain ?? null,
      loginIdentifier: data.loginIdentifier,
      encryptedSecret: encrypt(data.secret),
    });

    this.logger.info({ userId, platform: data.platform }, "Platform credential created");
    return toPlatformResponse(row as unknown as Record<string, unknown>);
  }

  async updatePlatformCredential(
    userId: string,
    id: string,
    data: { loginIdentifier?: string; secret?: string; domain?: string | null },
  ) {
    const existing = await this.credentialRepo.findPlatformById(id, userId);
    if (!existing) throw AppError.notFound("Platform credential not found");

    const updates: Record<string, unknown> = {};
    if (data.loginIdentifier) updates.loginIdentifier = data.loginIdentifier;
    if (data.secret) updates.encryptedSecret = encrypt(data.secret);
    if (data.domain !== undefined) updates.domain = data.domain;

    const row = await this.credentialRepo.updatePlatform(id, updates);
    return toPlatformResponse(row as unknown as Record<string, unknown>);
  }

  async deletePlatformCredential(userId: string, id: string) {
    const existing = await this.credentialRepo.findPlatformById(id, userId);
    if (!existing) throw AppError.notFound("Platform credential not found");
    await this.credentialRepo.deletePlatform(id);
    this.logger.info({ userId, id }, "Platform credential deleted");
  }

  /** Decrypt a platform credential secret (for GH worker dispatch only). */
  async getPlatformSecret(userId: string, platform: string): Promise<string | null> {
    const row = await this.credentialRepo.findPlatformByUserAndPlatform(userId, platform);
    if (!row) return null;
    return decrypt(row.encryptedSecret);
  }

  // ─── Mailbox Credentials ───

  async listMailboxCredentials(userId: string) {
    const rows = await this.credentialRepo.listMailboxByUser(userId);
    return rows.map((r) => toMailboxResponse(r as unknown as Record<string, unknown>));
  }

  async createMailboxCredential(
    userId: string,
    data: {
      provider: string;
      emailAddress: string;
      secret: string;
      accessMode: string;
      twoFactorEnabled?: boolean;
    },
  ) {
    // Upsert: if a mailbox for this user+provider already exists, update it
    const existing = await this.credentialRepo.findMailboxByUserAndProvider(userId, data.provider);
    if (existing) {
      const updated = await this.credentialRepo.updateMailbox(existing.id, {
        emailAddress: data.emailAddress,
        encryptedSecret: encrypt(data.secret),
        accessMode: data.accessMode,
        twoFactorEnabled: data.twoFactorEnabled ?? false,
        status: "active",
      });
      this.logger.info({ userId, provider: data.provider }, "Mailbox credential updated (upsert)");
      return toMailboxResponse(updated as unknown as Record<string, unknown>);
    }

    const row = await this.credentialRepo.createMailbox({
      userId,
      provider: data.provider,
      emailAddress: data.emailAddress,
      encryptedSecret: encrypt(data.secret),
      accessMode: data.accessMode,
      twoFactorEnabled: data.twoFactorEnabled ?? false,
    });

    this.logger.info({ userId, provider: data.provider }, "Mailbox credential created");
    return toMailboxResponse(row as unknown as Record<string, unknown>);
  }

  async updateMailboxCredential(
    userId: string,
    id: string,
    data: { secret?: string; accessMode?: string; twoFactorEnabled?: boolean },
  ) {
    const existing = await this.credentialRepo.findMailboxById(id, userId);
    if (!existing) throw AppError.notFound("Mailbox credential not found");

    const updates: Record<string, unknown> = {};
    if (data.secret) updates.encryptedSecret = encrypt(data.secret);
    if (data.accessMode) updates.accessMode = data.accessMode;
    if (data.twoFactorEnabled !== undefined) updates.twoFactorEnabled = data.twoFactorEnabled;

    const row = await this.credentialRepo.updateMailbox(id, updates);
    return toMailboxResponse(row as unknown as Record<string, unknown>);
  }

  async deleteMailboxCredential(userId: string, id: string) {
    const existing = await this.credentialRepo.findMailboxById(id, userId);
    if (!existing) throw AppError.notFound("Mailbox credential not found");
    await this.credentialRepo.deleteMailbox(id);
    this.logger.info({ userId, id }, "Mailbox credential deleted");
  }

  // ─── Readiness ───

  async checkReadiness(userId: string): Promise<CredentialReadinessResponse> {
    const platformCreds = await this.credentialRepo.listPlatformByUser(userId);
    const mailboxCreds = await this.credentialRepo.listMailboxByUser(userId);

    const platformMap = new Map(platformCreds.map((c) => [c.platform, c]));

    const platforms = TRACKED_PLATFORMS.map((platform) => {
      const cred = platformMap.get(platform);
      return {
        platform,
        hasCredential: cred != null,
        status: cred?.status ?? "missing",
        lastVerifiedAt: cred?.lastVerifiedAt ?? null,
      };
    });

    const activeMailbox = mailboxCreds.find((m) => m.status === "active");
    const hasActiveMailbox = activeMailbox != null;
    const mailboxStatus = hasActiveMailbox
      ? "active"
      : mailboxCreds.length > 0
        ? (mailboxCreds[0]?.status ?? "inactive")
        : "missing";

    const overallReady =
      platforms.some((p) => p.hasCredential && p.status === "active") && hasActiveMailbox;

    return {
      platforms,
      mailbox: {
        hasCredential: hasActiveMailbox,
        status: mailboxStatus,
      },
      overallReady,
    };
  }
}
