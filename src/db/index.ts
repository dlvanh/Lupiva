import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type DatabaseClient = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __lupivaSql?: Sql;
  __lupivaDb?: DatabaseClient;
  __lupivaTestDb?: DatabaseClient | null;
};

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'Missing environment variable "DATABASE_URL". Copy .env.example to .env and ensure Docker PostgreSQL is running.'
    );
  }
  return url;
}

/**
 * Registers an in-memory/PGlite Drizzle instance during Vitest execution
 * so Route Handlers using `getDb()` can run full integration tests cleanly.
 */
export function setDbForTesting(db: DatabaseClient | null): void {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error("setDbForTesting may only be called inside automated tests.");
  }
  globalForDb.__lupivaTestDb = db;
}

export function getDb(): DatabaseClient {
  if (
    globalForDb.__lupivaTestDb &&
    (process.env.NODE_ENV === "test" || process.env.VITEST === "true")
  ) {
    return globalForDb.__lupivaTestDb;
  }

  if (!globalForDb.__lupivaDb) {
    const connectionString = getDatabaseUrl();
    const client = postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 10 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
    globalForDb.__lupivaSql = client;
    globalForDb.__lupivaDb = drizzle(client, { schema });
  }

  return globalForDb.__lupivaDb;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__lupivaSql) {
    await globalForDb.__lupivaSql.end({ timeout: 5 });
    globalForDb.__lupivaSql = undefined;
    globalForDb.__lupivaDb = undefined;
  }
}

export async function checkDbHealth(
  db: DatabaseClient = getDb()
): Promise<boolean> {
  await db.execute(sql`SELECT 1`);
  return true;
}

export { schema };
