import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4321/pokecard-kr/",
    trace: "off",
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4321",
    url: "http://127.0.0.1:4321/pokecard-kr/game/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "iphone-13-webkit",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
      },
    },
  ],
});
