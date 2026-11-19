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
import { normalizeVietnamPhone } from "@/lib/phone";

const [identifier, password] = process.argv.slice(2);
if (!identifier || !password || password.length < 12) {
  throw new Error("Usage: set-password.mts <email-or-phone> <new-password of at least 12 characters>");
}
const db = getDb();
const isEmail = identifier.includes("@");
const normalizedPhone = isEmail ? null : normalizeVietnamPhone(identifier);
if (!isEmail && !normalizedPhone) {
  throw new Error("Provide a valid email address or Vietnamese phone number.");
}
const updated = await db
  .update(users)
  .set({ passwordHash: await hashPassword(password) })
  .where(
    isEmail
      ? eq(users.emailBlindIndex, computeBlindIndex(normalizeEmail(identifier), "email"))
      : eq(users.phoneBlindIndex, computeBlindIndex(normalizedPhone!, "phone"))
  )
  .returning({ id: users.id });
if (!updated.length) throw new Error("No account matching that email or phone.");
// Existing sessions keep working otherwise.
await db.delete(sessions).where(eq(sessions.userId, updated[0].id));
await closeDb();
console.log("Password replaced for one account.");
