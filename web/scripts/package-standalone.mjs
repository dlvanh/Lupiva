/**
 * Assemble dist/lupiva-web from the Next.js standalone output and pack it
 * into dist/lupiva-web.tar.gz with the system tar. Run `npm run build` first.
 */
import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");
const outDir = path.join(distDir, "lupiva-web");
const tarball = path.join(distDir, "lupiva-web.tar.gz");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(path.join(standaloneDir, "server.js")))) {
  console.error("Missing .next/standalone/server.js — run `npm run build` first.");
  process.exit(1);
}

await rm(outDir, { recursive: true, force: true });
await rm(tarball, { force: true });
await mkdir(outDir, { recursive: true });

// dereference: standalone may contain symlinks/junctions (Windows) that must
// become real files so the tarball extracts cleanly on Linux.
// Copy only what the server needs. Turbopack may trace the whole project
// (dynamic fs paths), which would otherwise ship sources, tests and .env files.
const RUNTIME_ENTRIES = ["server.js", "package.json", ".next", "node_modules"];
for (const entry of RUNTIME_ENTRIES) {
  const from = path.join(standaloneDir, entry);
  if (await exists(from)) {
    await cp(from, path.join(outDir, entry), { recursive: true, dereference: true });
  }
}
await rm(path.join(outDir, ".next", "cache"), { recursive: true, force: true });
await cp(staticDir, path.join(outDir, ".next", "static"), { recursive: true });
await cp(publicDir, path.join(outDir, "public"), { recursive: true });

const pgliteDist = path.join(outDir, "node_modules", "@electric-sql", "pglite", "dist");
for (const file of ["pglite.wasm", "pglite.data", "initdb.wasm"]) {
  if (!(await exists(path.join(pgliteDist, file)))) {
    console.error(`PGlite runtime file missing from standalone output: ${file}. Check outputFileTracingIncludes in next.config.ts.`);
    process.exit(1);
  }
}

// Relative paths from inside dist/: GNU tar reads "C:..." as a remote host.
for (const forbidden of [".env", ".env.local", ".data", "src", "tests"]) {
  if (await exists(path.join(outDir, forbidden))) {
    console.error(`Refusing to package: ${forbidden} is in the output.`);
    process.exit(1);
  }
}

const tar = spawnSync("tar", ["-czf", "lupiva-web.tar.gz", "lupiva-web"], {
  cwd: distDir,
  stdio: "inherit",
});
if (tar.error || tar.status !== 0) {
  console.error("tar failed:", tar.error ? tar.error.message : `exit code ${tar.status}`);
  process.exit(1);
}

const { size } = await stat(tarball);
console.log(`Packaged ${tarball} (${(size / 1024 / 1024).toFixed(1)} MiB)`);