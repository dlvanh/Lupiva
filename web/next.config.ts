import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  // PGlite loads its WebAssembly and data files from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],
  // nft cannot see the runtime fs loads of pglite.wasm / pglite.data /
  // initdb.wasm, so trace the whole PGlite dist into the standalone output.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@electric-sql/pglite/dist/**/*"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
