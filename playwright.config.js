import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100/Students-Results-Portals/",
    headless: true,
  },
  webServer: {
    command: "node tests/fixture-server.js",
    url: "http://localhost:3100/Students-Results-Portals/",
    reuseExistingServer: false,
    timeout: 120000,
  },
  reporter: "list",
});
