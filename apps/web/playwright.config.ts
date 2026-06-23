import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run start --workspace=apps/server",
      url: "http://localhost:3000/health",
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: "postgresql://ats:ats@localhost:5432/ats",
        INGEST_API_KEY: "dev-key",
        PORT: "3000",
      },
    },
    {
      command: "npm run dev --workspace=apps/web",
      url: "http://localhost:5173",
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: "http://localhost:3000",
      },
    },
  ],
});
