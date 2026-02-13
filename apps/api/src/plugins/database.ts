import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createDatabase, type Database } from "@valet/db";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const { db, sql } = createDatabase(process.env.DATABASE_URL!);

  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    fastify.log.info("Closing database connection");
    await sql.end();
  });

  fastify.log.info("Database plugin registered");
});
