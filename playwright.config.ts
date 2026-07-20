import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: "http://127.0.0.1:51736",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev:renderer",
    url: "http://127.0.0.1:51736",
    reuseExistingServer: false,
    timeout: 120000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
