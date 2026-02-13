import { eq } from "drizzle-orm";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import {
  users,
  tasks,
  resumes,
  qaBank,
  consentRecords,
  type Database,
} from "@valet/db";
import { RETENTION_POLICY } from "@valet/shared/constants";

const S3_BUCKET = process.env.S3_BUCKET_RESUMES ?? "resumes";

/**
 * GDPR Service — handles data export, account deletion, and data erasure.
 *
 * Implements:
 *   - GDPR Article 17: Right to erasure ("right to be forgotten")
 *   - GDPR Article 20: Right to data portability
 *   - 30-day grace period for account deletion recovery
 *   - Permanent data erasure after grace period expiry
 *
 * Injected via @fastify/awilix DI container.
 */

interface GdprServiceDeps {
  db: Database;
  logger: any; // pino logger
  s3: S3Client;
}

export class GdprService {
  private db: Database;
  private logger: any;
  private s3: S3Client;

  constructor({ db, logger, s3 }: GdprServiceDeps) {
    this.db = db;
    this.logger = logger;
    this.s3 = s3;
  }

  /**
   * Export all user data as a structured JSON object.
   */
  async exportUserData(userId: string) {
    this.logger.info({ userId }, "GDPR data export requested");

    const [user, userResumes, qaBankEntries, applications, userConsentRecords] =
      await Promise.all([
        this.findUser(userId),
        this.findResumes(userId),
        this.findQaBankEntries(userId),
        this.findApplications(userId),
        this.findConsentRecords(userId),
      ]);

    if (!user) {
      throw new Error("User not found");
    }

    const exportData = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone ?? null,
        location: user.location ?? null,
        linkedinUrl: user.linkedinUrl ?? null,
        githubUrl: user.githubUrl ?? null,
        portfolioUrl: user.portfolioUrl ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      resumes: userResumes.map((r) => ({
        id: r.id,
        filename: r.filename,
        parsedData: r.parsedData ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      qaBankEntries: qaBankEntries.map((q) => ({
        category: q.category,
        question: q.question,
        answer: q.answer,
        usageMode: q.usageMode,
        createdAt: q.createdAt.toISOString(),
      })),
      applications: applications.map((a) => ({
        id: a.id,
        jobUrl: a.jobUrl,
        platform: a.platform,
        status: a.status,
        jobTitle: a.jobTitle ?? null,
        companyName: a.companyName ?? null,
        matchScore: a.matchScore ?? null,
        createdAt: a.createdAt.toISOString(),
        completedAt: a.completedAt?.toISOString() ?? null,
      })),
      consentRecords: userConsentRecords.map((c) => ({
        type: c.type,
        version: c.version,
        grantedAt: c.createdAt.toISOString(),
      })),
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        format: "json" as const,
        requestedBy: userId,
      },
    };

    this.logger.info(
      {
        userId,
        resumeCount: userResumes.length,
        applicationCount: applications.length,
      },
      "GDPR data export completed",
    );

    return exportData;
  }

  /**
   * Initiate soft deletion of a user account with a 30-day grace period.
   */
  async initiateAccountDeletion(userId: string) {
    this.logger.info({ userId }, "Account deletion initiated");

    const user = await this.findUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!user.isActive) {
      throw new Error("Account deletion already in progress");
    }

    const now = new Date();
    const permanentDeletionDate = new Date(now);
    permanentDeletionDate.setDate(
      permanentDeletionDate.getDate() + RETENTION_POLICY.DELETED_ACCOUNT,
    );

    await this.softDeleteUser(userId, now);

    this.logger.info(
      {
        userId,
        scheduledDeletion: permanentDeletionDate.toISOString(),
      },
      "Account soft-deleted, permanent erasure scheduled",
    );

    return {
      message:
        "Account deletion initiated. Your account has been deactivated. " +
        `You have ${RETENTION_POLICY.DELETED_ACCOUNT} days to cancel this request ` +
        "before your data is permanently erased.",
      deletionScheduledAt: now.toISOString(),
      gracePeriodDays: RETENTION_POLICY.DELETED_ACCOUNT,
      permanentDeletionAt: permanentDeletionDate.toISOString(),
    };
  }

  /**
   * Cancel a pending account deletion during the grace period.
   */
  async cancelAccountDeletion(userId: string) {
    this.logger.info({ userId }, "Account deletion cancellation requested");

    const user = await this.findUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.isActive) {
      throw new Error("No pending account deletion to cancel");
    }

    await this.reactivateUser(userId);

    this.logger.info({ userId }, "Account deletion cancelled, account reactivated");

    return {
      message: "Account deletion cancelled. Your account has been reactivated.",
      accountStatus: "active" as const,
    };
  }

  /**
   * Permanently erase all data for a user after grace period expiry.
   * Called by a scheduled background job, not by a user request.
   * Due to cascade deletes on the DB schema, deleting the user record
   * will cascade to tasks, task_events, resumes, qa_bank, consent_records.
   */
  async permanentlyEraseUserData(userId: string) {
    this.logger.info({ userId }, "Permanent data erasure started");

    // Step 1: Delete files from object storage
    await this.deleteUserFiles(userId);

    // Step 2: Delete the user record (cascades to all child tables)
    await this.deleteUser(userId);

    this.logger.info({ userId }, "Permanent data erasure completed");
  }

  // -------------------------------------------------------------------
  // Database queries — wired to Drizzle ORM
  // -------------------------------------------------------------------

  private async findUser(userId: string) {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async findResumes(userId: string) {
    return this.db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId));
  }

  private async findQaBankEntries(userId: string) {
    return this.db
      .select()
      .from(qaBank)
      .where(eq(qaBank.userId, userId));
  }

  private async findApplications(userId: string) {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId));
  }

  private async findConsentRecords(userId: string) {
    return this.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, userId));
  }

  private async softDeleteUser(userId: string, _deletedAt: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  private async reactivateUser(userId: string): Promise<void> {
    await this.db
      .update(users)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  private async deleteUserFiles(userId: string): Promise<void> {
    const prefix = `resumes/${userId}/`;
    let continuationToken: string | undefined;

    do {
      const listResponse = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = listResponse.Contents;
      if (objects && objects.length > 0) {
        await this.s3.send(
          new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: {
              Objects: objects.map((obj) => ({ Key: obj.Key! })),
              Quiet: true,
            },
          }),
        );
        this.logger.info(
          { userId, count: objects.length },
          "Deleted S3 objects for user",
        );
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }

  private async deleteUser(userId: string): Promise<void> {
    // Due to ON DELETE CASCADE on all child tables, this single delete
    // will cascade to tasks, task_events, resumes, qa_bank, consent_records.
    await this.db.delete(users).where(eq(users.id, userId));
  }
}
