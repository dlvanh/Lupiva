/**
 * Create (or update) the schema and seed the demo accounts in the Postgres
 * database at DATABASE_URL. Replace the seeded passwords afterwards with
 * scripts/set-password.mts: they are public in the source.
 * Usage: DATABASE_URL=postgres://... npx tsx scripts/db-init.mts
 */
import { pushSchema } from "drizzle-kit/api";
import { closeDb, getDb, schema } from "@/db";
import { seedDatabase } from "@/db/seed";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL.");
const db = getDb();
const push = await pushSchema(schema, db as unknown as Parameters<typeof pushSchema>[1]);
if (push.hasDataLoss) throw new Error("Schema change would lose data: " + push.warnings.join("; "));
await push.apply();
await seedDatabase(db);
await closeDb();
console.log("Database ready.");
