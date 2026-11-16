/**
 * Create (or update) the schema and seed the demo accounts, in an embedded
 * PGlite folder (PGLITE_DIR) or a Postgres server (DATABASE_URL).
 * Usage: PGLITE_DIR=.data/pglite npx tsx scripts/pglite-init.mts
 */
import { pushSchema } from "drizzle-kit/api";
import { closeDb, getDb, schema } from "@/db";
import { seedDatabase } from "@/db/seed";

if (!process.env.PGLITE_DIR && !process.env.DATABASE_URL) throw new Error("Set PGLITE_DIR or DATABASE_URL.");
const db = getDb();
const push = await pushSchema(schema, db as unknown as Parameters<typeof pushSchema>[1]);
if (push.hasDataLoss) throw new Error("Schema change would lose data: " + push.warnings.join("; "));
await push.apply();
await seedDatabase(db);
await closeDb();
console.log("Database ready:", process.env.PGLITE_DIR ? "PGlite " + process.env.PGLITE_DIR : "Postgres");
