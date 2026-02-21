/**
 * Backfill script: Ensure all sandbox rows have EC2 control fields populated.
 *
 * The 0009_add_ec2_controls migration adds columns with DEFAULT values,
 * but rows inserted before the migration may have NULLs for ec2_status.
 * This script sets sensible defaults for any row missing them.
 *
 * Usage:
 *   set -a && source .env && set +a && \
 *   pnpm --filter @valet/db exec tsx src/scripts/backfill-ec2-fields.ts
 */

import { eq, isNull } from "drizzle-orm";
import { createDatabase } from "../client.js";
import { sandboxes } from "../schema/sandboxes.js";

async function main() {
  const connectionString =
    process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_DIRECT_URL or DATABASE_URL must be set");
    process.exit(1);
  }

  const { db, sql } = createDatabase(connectionString);

  try {
    // Find sandboxes missing ec2_status
    const missing = await db
      .select({ id: sandboxes.id, name: sandboxes.name, ec2Status: sandboxes.ec2Status })
      .from(sandboxes)
      .where(isNull(sandboxes.ec2Status));

    if (missing.length === 0) {
      console.log("All sandboxes already have ec2_status populated. Nothing to backfill.");
    } else {
      console.log(`Found ${missing.length} sandbox(es) with NULL ec2_status. Backfilling...`);

      for (const row of missing) {
        await db
          .update(sandboxes)
          .set({
            ec2Status: "stopped",
            autoStopEnabled: false,
            idleMinutesBeforeStop: 30,
            updatedAt: new Date(),
          })
          .where(eq(sandboxes.id, row.id));

        console.log(`  Updated sandbox "${row.name}" (${row.id})`);
      }

      console.log("Backfill complete.");
    }

    // Verify final state
    const all = await db
      .select({
        id: sandboxes.id,
        name: sandboxes.name,
        ec2Status: sandboxes.ec2Status,
        autoStopEnabled: sandboxes.autoStopEnabled,
        idleMinutesBeforeStop: sandboxes.idleMinutesBeforeStop,
        lastStartedAt: sandboxes.lastStartedAt,
        lastStoppedAt: sandboxes.lastStoppedAt,
      })
      .from(sandboxes);

    console.log("\nCurrent sandbox EC2 fields:");
    for (const row of all) {
      console.log(`  ${row.name}: ec2Status=${row.ec2Status}, autoStop=${row.autoStopEnabled}, idleMin=${row.idleMinutesBeforeStop}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
