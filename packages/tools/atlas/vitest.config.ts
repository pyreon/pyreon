import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  coverageThresholds: {
    statements: 95,
    branches: 95,
    functions: 95,
  },
  // `src/ui/**` splits cleanly into two halves, and only one is measurable here.
  //
  // MEASURED (and unit-tested): `catalog.ts`, `model.ts`, `theme.ts` — the pure,
  // DOM-free logic. Those carry the workbench's real contracts (grouping, control
  // defaults + per-component overrides, search, the bounded action log, the a11y
  // report, token derivation) and are covered by `src/ui/tests/*`.
  //
  // EXCLUDED below: the JSX/styled-declaration modules. They are almost entirely
  // `el.attrs(…).theme(…)` component definitions plus the JSX that composes them —
  // running them in the Node runner would measure "did the module evaluate", not
  // "does the workbench work". What actually proves them is the real-Chromium
  // `e2e/atlas-workshop.spec.ts` suite, which drives the assembled UI (render,
  // view switching, search, controls, actions, theme + dark-mode swap).
  //
  // This follows the documented rule for browser-covered files: exclude with a
  // rationale naming the covering suite — and NEVER exclude a file that has no
  // coverage anywhere. If a chrome/view module ever grows real branching logic,
  // move that logic into `model.ts`/`catalog.ts` (where it gets unit-tested)
  // instead of widening this list.
  coverageExclude: [
    // gen-docs data, no logic (scaffold-recipe convention).
    'src/manifest.ts',
    // Chromium-driving runner — proven by the atlas-verify-browser e2e suite
    // (subprocess against the workshop); its pure logic (verdict merge, pixel
    // ratio) IS unit-tested in src/verify-browser/tests/.
    'src/verify-browser/runner.ts',
    'src/ui/Workbench.tsx',
    'src/ui/bases.tsx',
    'src/ui/kit.ts',
    'src/ui/chrome/**',
    'src/ui/views/**',
  ],
})
