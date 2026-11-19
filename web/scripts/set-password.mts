/**
 * Replace an account's password, e.g. the seeded demo accounts before a
 * deployment that is reachable from the internet.
 * Usage: DATABASE_URL=... npx tsx scripts/set-password.mts <email> <new-password>
 */
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { computeBlindIndex, normalizeEmail } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 12) {
  throw new Error("Usage: set-password.mts <email> <new-password of at least 12 characters>");
}
const db = getDb();
const updated = await db
  .update(users)
  .set({ passwordHash: await hashPassword(password) })
  .where(eq(users.emailBlindIndex, computeBlindIndex(normalizeEmail(email), "email")))
  .returning({ id: users.id });
if (!updated.length) throw new Error("No account with that email.");
// Existing sessions keep working otherwise.
await db.delete(sessions).where(eq(sessions.userId, updated[0].id));
await closeDb();
console.log("Password replaced for one account.");
