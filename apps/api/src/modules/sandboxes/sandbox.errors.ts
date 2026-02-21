import { AppError } from "../../common/errors.js";

export class SandboxNotFoundError extends AppError {
  constructor(sandboxId: string) {
    super(404, "SANDBOX_NOT_FOUND", `Sandbox ${sandboxId} not found`);
    this.name = "SandboxNotFoundError";
  }
}

export class SandboxDuplicateInstanceError extends AppError {
  constructor(instanceId: string) {
    super(409, "SANDBOX_DUPLICATE_INSTANCE", `Sandbox with instance ID ${instanceId} already exists`);
    this.name = "SandboxDuplicateInstanceError";
  }
}

export class SandboxUnreachableError extends AppError {
  constructor(sandboxId: string) {
    super(502, "SANDBOX_UNREACHABLE", `Cannot reach sandbox ${sandboxId}`);
    this.name = "SandboxUnreachableError";
  }
}
