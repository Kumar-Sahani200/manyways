import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ||
  (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000");

export default defineConfig({
  testDir: "./tests",
  outputDir: "../../generated-artifacts/test-results",
  reporter: "list",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  webServer: process.env.CI ? {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60000,
    env: { PORT: "5000" },
  } : undefined,
  use: {
    baseURL,
    headless: true,
    launchOptions: {
      ...(process.env.CI ? {} : { executablePath: "/repl/tools/bin/chromium" }),
      args: ["--no-sandbox"],
    },
  },
});
