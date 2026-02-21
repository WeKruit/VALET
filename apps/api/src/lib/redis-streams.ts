import type Redis from "ioredis";

/**
 * Redis Streams utilities for real-time event streaming.
 *
 * Stream key pattern: `gh:events:{jobId}`
 *
 * Events published by GH ProgressTracker are consumed here by the
 * SSE endpoint and forwarded to connected frontend clients.
 */

/** Build the canonical stream key for a job. */
export function streamKey(jobId: string): string {
  return `gh:events:${jobId}`;
}

/** Shape of a progress event stored in Redis Streams. */
export interface StreamProgressEvent {
  step: string;
  progress_pct: string; // Redis stores everything as strings
  description: string;
  action_index: string;
  total_actions_estimate: string;
  current_action?: string;
  started_at: string;
  elapsed_ms: string;
  eta_ms?: string;
  execution_mode?: string;
  manual_id?: string;
  step_cost_cents?: string;
  timestamp: string;
}

/** Parsed progress event with proper types. */
export interface ParsedProgressEvent {
  id: string; // Redis stream message ID (e.g. "1708000000000-0")
  step: string;
  progress_pct: number;
  description: string;
  action_index: number;
  total_actions_estimate: number;
  current_action?: string;
  started_at: string;
  elapsed_ms: number;
  eta_ms: number | null;
  execution_mode?: string;
  manual_id?: string;
  step_cost_cents?: number;
  timestamp: string;
}

/**
 * Read events from a Redis Stream starting after `lastId`.
 * Uses non-blocking XREAD (no BLOCK) for SSE polling pattern.
 *
 * @param redis - ioredis client
 * @param jobId - The GH job UUID
 * @param lastId - Start reading after this ID. Use "0-0" for all events.
 * @param count - Maximum number of events to return (default 100)
 */
export async function xreadEvents(
  redis: Redis,
  jobId: string,
  lastId = "0-0",
  count = 100,
): Promise<ParsedProgressEvent[]> {
  const key = streamKey(jobId);
  const result = await redis.xread("COUNT", count, "STREAMS", key, lastId);

  if (!result) return [];

  const events: ParsedProgressEvent[] = [];
  for (const [, messages] of result) {
    for (const [id, fields] of messages) {
      events.push(parseStreamFields(id, fields));
    }
  }
  return events;
}

/**
 * Blocking read from a Redis Stream. Returns when new events arrive
 * or after `blockMs` milliseconds (whichever comes first).
 *
 * Used by SSE endpoint to wait for new events efficiently.
 */
export async function xreadBlock(
  redis: Redis,
  jobId: string,
  lastId: string,
  blockMs = 5000,
  count = 50,
): Promise<ParsedProgressEvent[]> {
  const key = streamKey(jobId);
  const result = await redis.xread("COUNT", count, "BLOCK", blockMs, "STREAMS", key, lastId);

  if (!result) return [];

  const events: ParsedProgressEvent[] = [];
  for (const [, messages] of result) {
    for (const [id, fields] of messages) {
      events.push(parseStreamFields(id, fields));
    }
  }
  return events;
}

/**
 * Trim a stream to approximately `maxLen` entries.
 * Uses ~ (approximate) trimming for performance.
 */
export async function xtrimStream(redis: Redis, jobId: string, maxLen = 1000): Promise<number> {
  const key = streamKey(jobId);
  return redis.xtrim(key, "MAXLEN", "~", maxLen);
}

/**
 * Delete a stream entirely (used during cleanup after job retention period).
 */
export async function deleteStream(redis: Redis, jobId: string): Promise<number> {
  const key = streamKey(jobId);
  return redis.del(key);
}

/**
 * Check if a stream exists and return its length.
 */
export async function streamLength(redis: Redis, jobId: string): Promise<number> {
  const key = streamKey(jobId);
  return redis.xlen(key);
}

// -- Internal helpers --

/** Parse flat Redis field array into typed event object. */
export function parseStreamFields(id: string, fields: string[]): ParsedProgressEvent {
  const map: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i];
    const val = fields[i + 1];
    if (key !== undefined && val !== undefined) {
      map[key] = val;
    }
  }

  return {
    id,
    step: map.step ?? "unknown",
    progress_pct: Number(map.progress_pct ?? 0),
    description: map.description ?? "",
    action_index: Number(map.action_index ?? 0),
    total_actions_estimate: Number(map.total_actions_estimate ?? 0),
    current_action: map.current_action || undefined,
    started_at: map.started_at ?? "",
    elapsed_ms: Number(map.elapsed_ms ?? 0),
    eta_ms: map.eta_ms ? Number(map.eta_ms) : null,
    execution_mode: map.execution_mode || undefined,
    manual_id: map.manual_id || undefined,
    step_cost_cents: map.step_cost_cents ? Number(map.step_cost_cents) : undefined,
    timestamp: map.timestamp ?? new Date().toISOString(),
  };
}
