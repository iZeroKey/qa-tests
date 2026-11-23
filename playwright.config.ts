// Configuración de Playwright para ejecución serial (workers: 1) sobre BD compartida y frontend hermano.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["system/**/*.spec.ts", "acceptance/**/*.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [
    ["list"],
    ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || "reports/playwright-last.json" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
    headless: process.env.PW_HEADLESS !== "false",
    slowMo: Number(process.env.PW_SLOWMO ?? "0"),
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    cwd: "../abc_inversiones_app",
    timeout: 60000,
  },
});
