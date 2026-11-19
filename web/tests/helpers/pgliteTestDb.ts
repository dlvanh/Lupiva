import { PGlite } from "@electric-sql/pglite";
import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";
import { setDbForTesting, type DatabaseClient } from "@/db";
import * as schema from "@/db/schema";

export const TEST_MASTER_KEY = "1a".repeat(32);
export const TEST_BLIND_KEY = "2b".repeat(32);
export const TEST_AUTH_SECRET = "3c".repeat(32);
export const TEST_SPECIALIST_INVITE_CODE = "VINMEC-IMMUNO-2026-TEST";

export function configureTestEnv(): void {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
  process.env.BLIND_INDEX_KEY = TEST_BLIND_KEY;
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.SPECIALIST_INVITE_CODE = TEST_SPECIALIST_INVITE_CODE;
  process.env.NEXT_PUBLIC_DEMO_MODE = "true";
  process.env.COOKIE_SECURE = "false";
  process.env.DATABASE_URL =
    "postgres://lupiva:lupiva@localhost:5432/lupiva_test";
}

export interface TestDatabaseHandle {
  pg: PGlite;
  db: DatabaseClient;
  resetTables: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabaseHandle> {
  configureTestEnv();

  const pg = new PGlite();
  const pgDrizzle = drizzle(pg, { schema });
  const pushResult = await pushSchema(
    schema,
    pgDrizzle as unknown as Parameters<typeof pushSchema>[1]
  );
  await pushResult.apply();

  const db = pgDrizzle as unknown as DatabaseClient;
  setDbForTesting(db);

  return {
    pg,
    db,
    resetTables: async () => {
      await pg.exec(
        "TRUNCATE TABLE audit_logs, auth_rate_limits, phone_otps, sessions, uploaded_documents, crf_submissions, patient_profiles, users RESTART IDENTITY CASCADE;"
      );
    },
    close: async () => {
      setDbForTesting(null);
      await pg.close();
    },
  };
}
