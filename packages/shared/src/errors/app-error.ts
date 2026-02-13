export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(msg: string, details?: Record<string, unknown>) {
    return new AppError(400, "BAD_REQUEST", msg, details);
  }

  static unauthorized(msg = "Unauthorized") {
    return new AppError(401, "UNAUTHORIZED", msg);
  }

  static forbidden(msg = "Forbidden") {
    return new AppError(403, "FORBIDDEN", msg);
  }

  static notFound(msg = "Not found") {
    return new AppError(404, "NOT_FOUND", msg);
  }

  static conflict(msg: string) {
    return new AppError(409, "CONFLICT", msg);
  }

  static tooManyRequests(msg = "Rate limit exceeded") {
    return new AppError(429, "RATE_LIMIT_EXCEEDED", msg);
  }

  static internal(msg = "Internal server error") {
    return new AppError(500, "INTERNAL_ERROR", msg);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}
