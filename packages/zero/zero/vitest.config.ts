import { mergeConfig } from "vite"
import { defineConfig } from "vitest/config"
import { sharedConfig } from "../../../vitest.shared"

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      include: ["src/tests/**/*.test.ts"],
    },
    resolve: {
      conditions: ["bun"],
    },
  }),
)
