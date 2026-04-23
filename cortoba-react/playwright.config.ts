import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config pour cortobaarchitecture.com.
 *
 * Usage :
 *   npx playwright install chromium   # première fois : télécharge Chromium (~200MB)
 *   npm run test:e2e                  # teste production (défaut)
 *   PLAYWRIGHT_BASE=http://localhost:4173 npm run test:e2e   # teste build local
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE || "https://cortobaarchitecture.com";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Important : react-helmet-async applique les meta uniquement après hydratation,
    // donc on attend que le réseau soit au repos pour la plupart des tests.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Ajoutez firefox / webkit / mobile si besoin
  ],
});
