import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const packageInfo = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
) as { version: string };

export default defineConfig({
  base: "./",
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageInfo.version)
  },
  server: {
    host: "127.0.0.1",
    port: 51736,
    strictPort: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"]
  }
});
