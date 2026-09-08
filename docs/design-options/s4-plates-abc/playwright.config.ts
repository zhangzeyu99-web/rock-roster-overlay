import { defineConfig } from "@playwright/test";
import path from "node:path";
export default defineConfig({
  testDir: ".", testMatch: "preview.spec.ts", timeout: 90000, workers: 1,
  outputDir: ".test-results", reporter: "line",
  use: { baseURL: "http://127.0.0.1:51736", headless: true },
  webServer: { command: "npm run dev:renderer", url: "http://127.0.0.1:51736", cwd: path.resolve(import.meta.dirname, "../../.."), reuseExistingServer: false }
});
