/**
 * Redis Streams consumer utilities for VALET SSE endpoint.
 * Reads from streams published by GhostHands ProgressTracker.
 */

/** Build the canonical stream key for a job (must match GH). */
export function streamKey(jobId: string): string {
  return `gh:events:${jobId}`;
}

/** Parse Redis XREAD field array [key, val, key, val, ...] into an object. */
export function parseStreamFields(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    if (key !== undefined) {
      result[key] = fields[i + 1] ?? "";
    }
  }
  return result;
}
