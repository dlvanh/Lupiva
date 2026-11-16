import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

const loadEnv = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
if (typeof loadEnv === "function") {
  if (existsSync(".env.local")) loadEnv(".env.local");
  if (existsSync(".env")) loadEnv(".env");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://lupiva:lupiva_dev_password@localhost:5432/lupiva",
  },
  strict: true,
  verbose: true,
});
