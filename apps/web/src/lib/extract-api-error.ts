/**
 * Extract a human-readable error message from a ts-rest API error.
 *
 * ts-rest errors have shape `{ status, body }` where `body` can be
 * a string or an object like `{ message: "...", statusCode: 400 }`.
 * Using `String(body)` on an object produces "[object Object]" — this
 * helper digs into `body.message` when available.
 */
export function extractApiError(err: unknown): string {
  if (err && typeof err === "object" && "body" in err) {
    const body = (err as Record<string, unknown>).body;
    if (body && typeof body === "object" && "message" in body) {
      return String((body as Record<string, unknown>).message);
    }
    if (typeof body === "string") return body;
    return "";
  }
  if (err instanceof Error) return err.message;
  return "";
}
