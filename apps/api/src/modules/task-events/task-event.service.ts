import type { TaskEventRepository } from "./task-event.repository.js";

export class TaskEventService {
  private taskEventRepo: TaskEventRepository;

  constructor({ taskEventRepo }: { taskEventRepo: TaskEventRepository }) {
    this.taskEventRepo = taskEventRepo;
  }

  async listByTaskId(
    taskId: string,
    query: { page: number; pageSize: number; eventType?: string },
  ) {
    const { data, total } = await this.taskEventRepo.findByTaskId(
      taskId,
      query,
    );
    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
