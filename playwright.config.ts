import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["system/**/*.spec.ts", "acceptance/**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5173",
    headless: false,
    slowMo: 800,
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    cwd: "../abc_inversiones_app",
    timeout: 60000,
  },
});
