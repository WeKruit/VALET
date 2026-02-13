import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import Redis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const redis = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    ...(url.startsWith("rediss://") && { tls: {} }),
  });

  await redis.connect();

  fastify.decorate("redis", redis);

  fastify.addHook("onClose", async () => {
    await redis.quit();
    fastify.log.info("Redis connection closed");
  });

  fastify.log.info("Redis plugin registered");
});
