import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'tools',
  // FIRST honest baseline. Until now `@pyreon/atlas` was absent from every CI
  // coverage table — the runner dropped any package it could not parse, so the
  // 95/95/95 declared here was never once enforced and the package sat ~15pp
  // under it. Measured 79.72 / 75.98 / 66.06 / 79.94.
  //
  // These are a RATCHET, like @pyreon/ui-components' — raise them in lockstep
  // as tests land, never lower. The uncovered surface is concentrated and
  // known: `static.ts` (the `atlas build` static-docs generator, landed with no
  // tests), `server.ts` + `plugin.ts` + `run.ts` (vite-booting dev surface),
  // `lens.ts` / `lens-client.ts` / `axe.ts` (browser-side instrumentation), and
  // the `A11y*` styled-declaration modules.
  //
  // `lines` is declared EXPLICITLY alongside the other three. Omitting it did
  // not mean "no line threshold" — an unset key inherits the category default
  // (95%), so the package silently carried a ceiling nobody had measured
  // against while its three deliberate re-baselines sat at 79/75/66. It
  // measured 81.36% and reddened `Coverage (Full)` on every main run. A
  // partial override reads as "the thresholds are set"; it is not.
  // Ratcheted UP with the exclusion fix below rather than left at the old
  // seed: dropping 159 declaration-only files from the denominator moved the
  // measurement to 83.92 / 75.18 / 87.90 / 84.78, and a floor that sits 20
  // points under what the package actually achieves protects nothing. Held ~1
  // point below measured, because the same run differs slightly between macOS
  // and the ubuntu runner. Branches stays at 75: CI measures 75.12 and the
  // margin is already thinner than that variance, so tightening it would make
  // the gate flip by platform.
  coverageThresholds: {
    statements: 82,
    branches: 75,
    functions: 85,
    lines: 83,
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
    // Same class as the two above, and the reason this list needed a third
    // entry: the chrome/view modules were later decomposed into 159
    // one-declaration files under `components/`, and the exclude list did not
    // follow. Every one of them is an `el.attrs(…).theme(…)` (or `txt`)
    // declaration — the single file carrying a conditional carries `??` inside
    // a theme callback and nothing else — so the Node runner measures "did the
    // module evaluate", which is what the paragraph above says not to measure.
    // The covering suite is unchanged: `e2e/atlas-workshop.spec.ts`.
    'src/ui/components/**',
  ],
})
