import { AppError } from "../../common/errors.js";

export class TaskNotFoundError extends AppError {
  constructor(taskId: string) {
    super(404, "TASK_NOT_FOUND", `Task ${taskId} not found`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskAlreadyCancelledError extends AppError {
  constructor(taskId: string) {
    super(409, "TASK_ALREADY_CANCELLED", `Task ${taskId} is already cancelled`);
    this.name = "TaskAlreadyCancelledError";
  }
}

export class TaskNotCancellableError extends AppError {
  constructor(taskId: string, status: string) {
    super(
      409,
      "TASK_NOT_CANCELLABLE",
      `Task ${taskId} cannot be cancelled in status ${status}`,
    );
    this.name = "TaskNotCancellableError";
  }
}
