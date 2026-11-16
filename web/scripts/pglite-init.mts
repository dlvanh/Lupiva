/**
 * Create (or update) the schema in an embedded PGlite folder and seed the
 * demo accounts. Usage: PGLITE_DIR=.data/pglite npx tsx scripts/pglite-init.mts
 */
import { pushSchema } from "drizzle-kit/api";
import { closeDb, getDb, schema } from "@/db";
import { seedDatabase } from "@/db/seed";

if (!process.env.PGLITE_DIR) throw new Error("Set PGLITE_DIR to the folder that holds the database.");
const db = getDb();
const push = await pushSchema(schema, db as unknown as Parameters<typeof pushSchema>[1]);
if (push.hasDataLoss) throw new Error("Schema change would lose data: " + push.warnings.join("; "));
await push.apply();
await seedDatabase(db);
await closeDb();
console.log("PGlite database ready at", process.env.PGLITE_DIR);
