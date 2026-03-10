import path from "node:path"
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./browser",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: `bun run ${path.join(__dirname, "browser", "dev-server.ts")}`,
    port: 3799,
    reuseExistingServer: !process.env.CI,
    cwd: path.resolve(__dirname, ".."),
  },
  use: {
    baseURL: "http://localhost:3799",
  },
})
