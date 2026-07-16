import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  // Honest baseline captured when the coverage gate was first turned on for
  // packages/ui (this PR). The 11 browser tests exercise ARIA + keyboard
  // surfaces but not the full state machines (Checkbox/Switch/Combobox/
  // FileUpload/keyboard.ts largely unexercised). Below the ui floor
  // (80/75/80/80) → carried in check-coverage.ts BELOW_FLOOR_EXEMPTIONS.
  // Ratchet up as interaction tests land; never lower.
  coverageThresholds: { statements: 62, branches: 54, functions: 63, lines: 66 },
  overrides: {
    // oxc transformer JSX config — these UI packages use Pyreon's JSX
    // import source rather than React's default.
    // @ts-expect-error vitest's UserConfig type doesn't know about oxc plugin opts
    oxc: {
      jsx: {
        runtime: 'automatic',
        importSource: '@pyreon/core',
      },
    },
  },
})
