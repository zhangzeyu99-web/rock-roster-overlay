import { build } from "esbuild";

const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  external: ["electron"],
  packages: "external",
  sourcemap: true
};

await Promise.all([
  build({
    ...shared,
    format: "esm",
    entryPoints: ["electron/main.ts"],
    outfile: "dist-electron/main.js"
  }),
  build({
    ...shared,
    format: "cjs",
    entryPoints: ["electron/preload.ts"],
    outfile: "dist-electron/preload.cjs"
  })
]);
