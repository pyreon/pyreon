import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import { sharedConfig } from "../../../vitest.shared";

// This package has all logic in src/index.ts (not just re-exports),
// so we define coverage config directly instead of using createVitestConfig()
// which excludes src/**/index.ts by default.
export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      globals: true,
      mockReset: true,
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.ts", "src/**/*.tsx"],
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/bin/**"],
        thresholds: {
          statements: 95,
          branches: 95,
          functions: 95,
          lines: 95,
        },
      },
    },
  }),
);
