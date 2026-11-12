import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3100", headless: true },
  webServer: {
    command: "node tests/fixture-server.js",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
});
