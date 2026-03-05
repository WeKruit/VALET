/**
 * Real Redis integration tests for Streams + Pub/Sub.
 *
 * Tests against real Upstash Redis to verify Streams, pub/sub, and TTL
 * behaviour used by the VALET real-time pipeline.
 *
 * Gated: INTEGRATION_TEST=true + REDIS_URL set.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { isAvailable, getRedis, closeRedis } from "./_setup.js";
import Redis from "ioredis";

const TEST_STREAM = "test:integ:stream";
const TEST_CHANNEL = "test:integ:channel";

describe.runIf(isAvailable())("Real Redis: Streams & Pub/Sub", () => {
  beforeAll(async () => {
    const redis = getRedis();
    await redis.del(TEST_STREAM);
  });

  afterEach(async () => {
    const redis = getRedis();
    await redis.del(TEST_STREAM);
  });

  afterAll(async () => {
    const redis = getRedis();
    await redis.del(TEST_STREAM);
    await closeRedis();
  });

  // ── XADD / XREAD ────────────────────────────────────────────────
  it("XADD to stream → XREAD returns entries", async () => {
    const redis = getRedis();

    await redis.xadd(TEST_STREAM, "*", "type", "progress", "value", "50");

    const result = await redis.xread("COUNT", 10, "STREAMS", TEST_STREAM, "0");
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);

    const [streamName, entries] = result![0]!;
    expect(streamName).toBe(TEST_STREAM);
    expect(entries.length).toBe(1);

    const [_id, fields] = entries[0]!;
    // fields is a flat array: ["type", "progress", "value", "50"]
    expect(fields).toContain("type");
    expect(fields).toContain("progress");
    expect(fields).toContain("value");
    expect(fields).toContain("50");
  });

  it("XADD with multiple fields → all fields preserved", async () => {
    const redis = getRedis();

    await redis.xadd(
      TEST_STREAM,
      "*",
      "event",
      "task_update",
      "taskId",
      "abc-123",
      "status",
      "in_progress",
      "progress",
      "75",
    );

    const result = await redis.xread("COUNT", 10, "STREAMS", TEST_STREAM, "0");
    const [, entries] = result![0]!;
    const fields = entries[0]![1];

    // Convert flat array to map
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]!] = fields[i + 1]!;
    }

    expect(map.event).toBe("task_update");
    expect(map.taskId).toBe("abc-123");
    expect(map.status).toBe("in_progress");
    expect(map.progress).toBe("75");
  });

  it("stream key TTL (EXPIRE) → key expires after TTL", async () => {
    const redis = getRedis();

    await redis.xadd(TEST_STREAM, "*", "data", "temp");
    await redis.expire(TEST_STREAM, 1); // 1 second TTL

    // Verify key exists
    const exists = await redis.exists(TEST_STREAM);
    expect(exists).toBe(1);

    // Wait for expiry
    await new Promise((r) => setTimeout(r, 1500));

    const gone = await redis.exists(TEST_STREAM);
    expect(gone).toBe(0);
  });

  // ── Pub/Sub ──────────────────────────────────────────────────────
  it("PUBLISH to channel → SUBSCRIBE receives message", async () => {
    const pubRedis = getRedis();
    // Subscriber needs its own connection (ioredis limitation)
    const subRedis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      ...(process.env.REDIS_URL!.startsWith("rediss://") && { tls: {} }),
    });
    await subRedis.connect();

    try {
      const received: string[] = [];

      await subRedis.subscribe(TEST_CHANNEL);
      subRedis.on("message", (_ch: string, msg: string) => {
        received.push(msg);
      });

      // Small delay to ensure subscription is ready
      await new Promise((r) => setTimeout(r, 200));

      await pubRedis.publish(TEST_CHANNEL, "hello from integration test");

      // Wait for delivery
      await new Promise((r) => setTimeout(r, 500));

      expect(received).toContain("hello from integration test");
    } finally {
      await subRedis.unsubscribe(TEST_CHANNEL);
      await subRedis.quit();
    }
  });

  it("publishToUser-style JSON payload round-trip", async () => {
    const pubRedis = getRedis();
    const subRedis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      ...(process.env.REDIS_URL!.startsWith("rediss://") && { tls: {} }),
    });
    await subRedis.connect();

    const userChannel = "test:integ:user:abc-123";

    try {
      const received: unknown[] = [];

      await subRedis.subscribe(userChannel);
      subRedis.on("message", (_ch: string, msg: string) => {
        received.push(JSON.parse(msg));
      });

      await new Promise((r) => setTimeout(r, 200));

      const payload = {
        type: "task_update",
        taskId: "task-456",
        status: "in_progress",
        progress: 42,
      };
      await pubRedis.publish(userChannel, JSON.stringify(payload));

      await new Promise((r) => setTimeout(r, 500));

      expect(received.length).toBe(1);
      expect(received[0]).toEqual(payload);
    } finally {
      await subRedis.unsubscribe(userChannel);
      await subRedis.quit();
    }
  });

  // ── Incremental reads ────────────────────────────────────────────
  it("multiple XADD → XREAD with lastId returns only new entries", async () => {
    const redis = getRedis();

    await redis.xadd(TEST_STREAM, "*", "seq", "1");
    const id2 = await redis.xadd(TEST_STREAM, "*", "seq", "2");
    await redis.xadd(TEST_STREAM, "*", "seq", "3");

    // Read from after id2 — should only get seq=3
    const result = await redis.xread("COUNT", 10, "STREAMS", TEST_STREAM, id2!);
    expect(result).not.toBeNull();
    const [, entries] = result![0]!;
    expect(entries.length).toBe(1);

    const fields = entries[0]![1];
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]!] = fields[i + 1]!;
    }
    expect(map.seq).toBe("3");
  });

  it("stream with >100 entries → XREAD with COUNT limits results", async () => {
    const redis = getRedis();

    // Add 20 entries
    for (let i = 0; i < 20; i++) {
      await redis.xadd(TEST_STREAM, "*", "idx", String(i));
    }

    const result = await redis.xread("COUNT", 5, "STREAMS", TEST_STREAM, "0");
    expect(result).not.toBeNull();
    const [, entries] = result![0]!;
    expect(entries.length).toBe(5); // capped at COUNT
  });

  it("XADD to non-existent stream auto-creates it", async () => {
    const redis = getRedis();
    const newStream = "test:integ:autocreate";

    try {
      const before = await redis.exists(newStream);
      expect(before).toBe(0);

      await redis.xadd(newStream, "*", "auto", "created");

      const after = await redis.exists(newStream);
      expect(after).toBe(1);
    } finally {
      await redis.del(newStream);
    }
  });
});
