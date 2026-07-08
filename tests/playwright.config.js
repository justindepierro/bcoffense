// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * BCOffense Playwright config.
 *
 * Default run (chromium desktop only — fast):
 *   cd tests && BCOFFENSE_USER=you BCOFFENSE_PASS=pw npm test
 *
 * Specific browser:
 *   npx playwright test --project=iphone
 *
 * All browsers:
 *   npx playwright test --project=chromium-desktop --project=ipad-portrait --project=ipad-landscape --project=iphone --project=phone-narrow
 *
 * Screenshots only:
 *   npm run screenshots
 */

// Load .env.test if present (never committed — put BCOFFENSE_USER/BCOFFENSE_PASS there)
try { require("dotenv").config({ path: ".env.test" }); } catch (_) {}

const E2E_LOCAL = process.env.BCOFFENSE_E2E_LOCAL === "1";
const LOCAL_PORT = process.env.BCOFFENSE_E2E_PORT || "4177";
const BASE_URL = process.env.BASE_URL || (
  E2E_LOCAL ? `http://127.0.0.1:${LOCAL_PORT}` : "https://bcoffense.pages.dev"
);

module.exports = defineConfig({
  testDir: "./specs",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  webServer: E2E_LOCAL
    ? {
        command: `node ../scripts/e2e-local-server.mjs --port=${LOCAL_PORT}`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 15_000,
      }
    : undefined,

  // Only chromium-desktop runs by default — others need --project=<name>
  project: undefined,

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "ipad-portrait",
      use: { ...devices["iPad (gen 7)"], viewport: { width: 810, height: 1080 } },
    },
    {
      name: "ipad-landscape",
      use: { ...devices["iPad (gen 7) landscape"], viewport: { width: 1080, height: 810 } },
    },
    {
      name: "iphone",
      use: { ...devices["iPhone 15"], browserName: "chromium", viewport: { width: 393, height: 852 } },
    },
    {
      name: "webkit-iphone",
      use: { ...devices["iPhone 15"], browserName: "webkit", viewport: { width: 393, height: 852 } },
    },
    {
      name: "phone-narrow",
      use: { ...devices["iPhone SE"], browserName: "chromium", viewport: { width: 320, height: 568 } },
    },
  ],
});
