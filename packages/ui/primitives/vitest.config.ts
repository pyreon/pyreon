import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'ui',
  environment: 'happy-dom',
  // Honest baseline captured when the coverage gate was first turned on for
  // packages/ui. Ratcheted up as interaction tests land; never lower. Still
  // below the 95 gate floor → carried in check-coverage.ts
  // BELOW_FLOOR_EXEMPTIONS (keep currentStatements/currentBranches in lockstep).
  // Ratcheted 78/71/79/82 -> 81/75/81/84 (measured 81.58/76.04/82.42/84.81)
  // as the CheckboxBase/SwitchBase/RadioBase toggle state-machine interaction
  // tests landed (toggle-primitives-interaction.browser.test.tsx) alongside the
  // CheckboxBase + RadioBase label→input double-toggle fix.
  // Ratcheted 81/75/81/84 -> 86/81/85/88 (measured 87.42/82.12/86.08/89.66) as
  // the ComboboxBase + TreeBase state-machine tests landed ({combobox,tree}-
  // state-machine.browser.test.tsx — select/filter/expand/keyboard/props,
  // exercised through the headless state objects; ComboboxBase 54.83 -> 95.96,
  // TreeBase 78.32 -> 98.60).
  coverageThresholds: { statements: 95, branches: 89, functions: 94, lines: 96 },
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
