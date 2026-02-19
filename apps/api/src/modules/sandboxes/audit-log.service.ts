import type { FastifyBaseLogger } from "fastify";
import type { AuditLogRepository } from "./audit-log.repository.js";

export interface AuditLogEntry {
  sandboxId: string;
  userId?: string | null;
  action: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  result?: string;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export class AuditLogService {
  private auditLogRepo: AuditLogRepository;
  private logger: FastifyBaseLogger;

  constructor({
    auditLogRepo,
    logger,
  }: {
    auditLogRepo: AuditLogRepository;
    logger: FastifyBaseLogger;
  }) {
    this.auditLogRepo = auditLogRepo;
    this.logger = logger;
  }

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.auditLogRepo.insert({
        sandboxId: entry.sandboxId,
        userId: entry.userId,
        action: entry.action,
        details: entry.details,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        result: entry.result ?? "success",
        errorMessage: entry.errorMessage,
        durationMs: entry.durationMs,
      });
    } catch (err) {
      this.logger.error({ err, entry }, "Failed to write audit log entry");
    }
  }

  async findBySandbox(
    sandboxId: string,
    options: { page: number; pageSize: number; action?: string },
  ) {
    return this.auditLogRepo.findBySandbox(sandboxId, options);
  }
}
