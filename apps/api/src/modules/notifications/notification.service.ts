import type { NotificationRepository } from "./notification.repository.js";
import { AppError } from "../../common/errors.js";

export class NotificationService {
  private notificationRepo: NotificationRepository;

  constructor({ notificationRepo }: { notificationRepo: NotificationRepository }) {
    this.notificationRepo = notificationRepo;
  }

  async list(
    userId: string,
    opts: { page: number; pageSize: number; unreadOnly: boolean },
  ) {
    const { rows, total } = await this.notificationRepo.findByUserId(userId, opts);
    const unreadCount = await this.notificationRepo.getUnreadCount(userId);

    return {
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        type: r.type,
        title: r.title,
        body: r.body,
        read: r.read,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt,
      })),
      pagination: {
        page: opts.page,
        pageSize: opts.pageSize,
        total,
        totalPages: Math.ceil(total / opts.pageSize),
      },
      unreadCount,
    };
  }

  async markRead(id: string, userId: string) {
    const updated = await this.notificationRepo.markRead(id, userId);
    if (!updated) throw AppError.notFound("Notification not found");
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.notificationRepo.markAllRead(userId);
    return { success: true };
  }

  async create(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.notificationRepo.create(data);
  }
}
