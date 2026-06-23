import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
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
      command: "cd ../server && npm run start",
      url: "http://localhost:3000/health",
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: "postgresql://ats:ats@localhost:5432/ats",
        INGEST_API_KEY: "dev-key",
        PORT: "3000",
        JWT_SECRET: "e2e-test-secret",
      },
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: "http://localhost:3000",
      },
    },
  ],
});
