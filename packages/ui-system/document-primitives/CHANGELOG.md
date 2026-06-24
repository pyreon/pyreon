# @pyreon/document-primitives

## 0.35.0

### Patch Changes

- Updated dependencies [[`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db), [`368a609`](https://github.com/pyreon/pyreon/commit/368a6090c867e2dd6c37413e0656fe57a7e1e63c), [`ce5a10a`](https://github.com/pyreon/pyreon/commit/ce5a10ab91dcbf1252897426a965dcc3a65a50f2), [`30f6eab`](https://github.com/pyreon/pyreon/commit/30f6eabbade33fe2cb51d86912a38faec7746563), [`ae6eb27`](https://github.com/pyreon/pyreon/commit/ae6eb27409c9c59be53d53f166be400fd9e59db5), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`f107ee9`](https://github.com/pyreon/pyreon/commit/f107ee9951cc6e17fe8e4f41b4f3e19606a887fb), [`44ec423`](https://github.com/pyreon/pyreon/commit/44ec423509b481b3a90570274e0ca05e88c5c558), [`e334879`](https://github.com/pyreon/pyreon/commit/e334879f17acfff59251740d4dadaa8928515c76), [`5435c76`](https://github.com/pyreon/pyreon/commit/5435c76442d1577061b4be3f054287992d973118), [`3d47b98`](https://github.com/pyreon/pyreon/commit/3d47b987d244be4ad6b5453cd07ed39be85427bf), [`43290cd`](https://github.com/pyreon/pyreon/commit/43290cda0461999818ff2a4316018cbe1ca24bc9)]:
  - @pyreon/styler@0.35.0
  - @pyreon/ui-core@0.35.0
  - @pyreon/unistyle@0.35.0
  - @pyreon/document@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/elements@0.35.0
  - @pyreon/rocketstyle@0.35.0
  - @pyreon/connector-document@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc), [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74)]:
  - @pyreon/core@0.34.0
  - @pyreon/document@0.34.0
  - @pyreon/styler@0.34.0
  - @pyreon/rocketstyle@0.34.0
  - @pyreon/elements@0.34.0
  - @pyreon/unistyle@0.34.0
  - @pyreon/ui-core@0.34.0
  - @pyreon/connector-document@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/elements@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/unistyle@0.33.0

## 0.32.0

### Minor Changes

- [#1528](https://github.com/pyreon/pyreon/pull/1528) [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094) Thanks [@vitbokisch](https://github.com/vitbokisch)! - CSS-variables mode — FOUC fix (Phase 4b) + document export (Q2):

  - `@pyreon/ui-core`: under `init({ cssVariables: true })` the ROOT `PyreonUI` now writes the mode attribute to `document.documentElement` (at `:root`, where the var rules cascade from and where a pre-paint script writes) and returns children unwrapped; only NESTED / `inversed` providers render the `display:contents` wrapper scoping an override to their subtree. New `cssVariablesPrePaintScript({ attribute?, storageKey?, fallback? })` builds the blocking `<head>` script that sets the attribute from localStorage / `prefers-color-scheme` before first paint — the standard dark-mode FOUC fix. (zero apps can keep using the existing `themeScript` export, which writes the same attribute.)
  - `@pyreon/rocketstyle`: `resolveModeVar(value, mode)` — resolve a `mode(a, b)` var pair to its raw light/dark value for non-CSS render targets (document export), backed by a registry the var-pair factory populates.
  - `@pyreon/connector-document`: `resolveStyles` + `extractDocumentTree` gained an optional `resolveVar` hook (+ exported `VarResolver` type) that inlines `var(--…)` style values to raw values during extraction — keeps the bridge dependency-light (only `@pyreon/document`).
  - `@pyreon/document-primitives`: `extractDocNode({ theme?, mode? })` auto-builds the resolver (composing `resolveModeVar` with unistyle's `resolveCssVarReferences` over a `themeToCssVars(theme)` registry), so PDF/DOCX/email export inlines CSS-variable theme values to raw values. Doc primitives that emit raw literals are unaffected.

  Measured/locked in real Chromium; bisect-verified. Flag off (classic path) is byte-identical.

  Also: `PyreonUI` now provides the core context via lazy getters instead of an eager object, so reading `.theme` no longer transitively subscribes to the mode signal. Under cssVariables this makes a theme toggle do ZERO per-component re-runs (the cascade handles it) — a real-app 300-component toggle measures ~1.9× faster (~2.05× at 600 components, holds under 4× CPU throttle); classic mode (which reads `.mode`) is unchanged. New `examples/cssvars-bench` + `scripts/bench-cssvars.ts` for the measurement.

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`fc26160`](https://github.com/pyreon/pyreon/commit/fc26160ac2d3afba0adde20f61d94a4199519b59), [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00), [`c0616ab`](https://github.com/pyreon/pyreon/commit/c0616ab14052e0ac53fe6ca12d1ecaf729e7bc09)]:
  - @pyreon/core@0.33.0
  - @pyreon/elements@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/unistyle@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/document@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/elements@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07)]:
  - @pyreon/core@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/elements@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`8726411`](https://github.com/pyreon/pyreon/commit/872641168a22ba0423d4888e394f6c799ad4dd1c), [`7aa2c8f`](https://github.com/pyreon/pyreon/commit/7aa2c8f584f348d73f2ca1f8dca818cf3936b3af), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`f4ea1a1`](https://github.com/pyreon/pyreon/commit/f4ea1a1e5af38b37b4eb2feb14f4594e3c3c3482), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/elements@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/connector-document@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

- Updated dependencies [[`a292e1e`](https://github.com/pyreon/pyreon/commit/a292e1e40822ac5036af8ce05ebc0b90ff09dd64), [`37b353e`](https://github.com/pyreon/pyreon/commit/37b353e513848dabc5c86f9faf019ee734280e3b), [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0), [`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`2264d90`](https://github.com/pyreon/pyreon/commit/2264d9089f91e6bd4bce0623008f1643a29eff6b), [`e975f3a`](https://github.com/pyreon/pyreon/commit/e975f3aa9a5ca0fa7983c8f4fa47c412cea7d735), [`89199fa`](https://github.com/pyreon/pyreon/commit/89199fa464a4c79c93a1c8d7835a8510d49fba4d), [`97a7130`](https://github.com/pyreon/pyreon/commit/97a7130771bc930abf5b66b615fa65982126c640), [`4058727`](https://github.com/pyreon/pyreon/commit/40587271deeb30f968dcf297ee7781e2993ca1e8), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a), [`e8d00a7`](https://github.com/pyreon/pyreon/commit/e8d00a763b713aab51172b1e16c6529feac028d3)]:
  - @pyreon/document@0.28.1
  - @pyreon/elements@0.28.1
  - @pyreon/connector-document@0.28.1
  - @pyreon/rocketstyle@0.28.1
  - @pyreon/ui-core@0.28.1
  - @pyreon/styler@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/elements@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/elements@0.27.1
  - @pyreon/rocketstyle@0.27.1
  - @pyreon/document@0.27.1
  - @pyreon/connector-document@0.27.1
  - @pyreon/styler@0.27.1
  - @pyreon/ui-core@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/elements@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies [[`395d631`](https://github.com/pyreon/pyreon/commit/395d631e958ff71076b18e6d86c57bcc1d60b9c1)]:
  - @pyreon/elements@0.26.3
  - @pyreon/document@0.26.3
  - @pyreon/connector-document@0.26.3
  - @pyreon/rocketstyle@0.26.3
  - @pyreon/styler@0.26.3
  - @pyreon/ui-core@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/document@0.26.2
  - @pyreon/connector-document@0.26.2
  - @pyreon/elements@0.26.2
  - @pyreon/rocketstyle@0.26.2
  - @pyreon/styler@0.26.2
  - @pyreon/ui-core@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies [[`487f1aa`](https://github.com/pyreon/pyreon/commit/487f1aa56e3b10746366f17deff2f4ba4cae827b), [`5af2864`](https://github.com/pyreon/pyreon/commit/5af28641ab1ad31a0c3feaf1c6a95163e83935d3)]:
  - @pyreon/rocketstyle@0.26.1
  - @pyreon/styler@0.26.1
  - @pyreon/document@0.26.1
  - @pyreon/connector-document@0.26.1
  - @pyreon/elements@0.26.1
  - @pyreon/ui-core@0.26.1

## 0.26.0

### Patch Changes

- Updated dependencies [[`448073c`](https://github.com/pyreon/pyreon/commit/448073c3066bda0e54c71d85cf6bcfebc148a6f0), [`38cec50`](https://github.com/pyreon/pyreon/commit/38cec50a856ae60abd445ac3a65c5667feb99473), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da)]:
  - @pyreon/styler@0.33.0
  - @pyreon/elements@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/rocketstyle@0.33.0
  - @pyreon/document@0.33.0
  - @pyreon/connector-document@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`fcd1187`](https://github.com/pyreon/pyreon/commit/fcd118734c5feb90317c00236f5e492f7caaedb7), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/core@0.25.1
  - @pyreon/rocketstyle@0.25.1
  - @pyreon/styler@0.25.1
  - @pyreon/elements@0.25.1
  - @pyreon/ui-core@0.25.1
  - @pyreon/connector-document@0.25.1
  - @pyreon/document@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720)]:
  - @pyreon/core@0.25.0
  - @pyreon/document@0.25.0
  - @pyreon/ui-core@0.25.0
  - @pyreon/elements@0.25.0
  - @pyreon/styler@0.25.0
  - @pyreon/rocketstyle@0.25.0
  - @pyreon/connector-document@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/document@0.24.6
  - @pyreon/connector-document@0.24.6
  - @pyreon/elements@0.24.6
  - @pyreon/rocketstyle@0.24.6
  - @pyreon/styler@0.24.6
  - @pyreon/ui-core@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/document@0.24.5
  - @pyreon/connector-document@0.24.5
  - @pyreon/elements@0.24.5
  - @pyreon/rocketstyle@0.24.5
  - @pyreon/styler@0.24.5
  - @pyreon/ui-core@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies [[`b620ca0`](https://github.com/pyreon/pyreon/commit/b620ca02f70e2196208dd50924ab8e98c3e1e40b)]:
  - @pyreon/elements@0.24.4
  - @pyreon/core@0.24.4
  - @pyreon/document@0.24.4
  - @pyreon/connector-document@0.24.4
  - @pyreon/rocketstyle@0.24.4
  - @pyreon/styler@0.24.4
  - @pyreon/ui-core@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies [[`707fa0b`](https://github.com/pyreon/pyreon/commit/707fa0b9080d601c9a67bab7e38c881340bec56a), [`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb), [`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb)]:
  - @pyreon/elements@0.24.3
  - @pyreon/ui-core@0.24.3
  - @pyreon/rocketstyle@0.24.3
  - @pyreon/core@0.24.3
  - @pyreon/document@0.24.3
  - @pyreon/connector-document@0.24.3
  - @pyreon/styler@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/document@0.24.2
  - @pyreon/connector-document@0.24.2
  - @pyreon/elements@0.24.2
  - @pyreon/rocketstyle@0.24.2
  - @pyreon/styler@0.24.2
  - @pyreon/ui-core@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies [[`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9)]:
  - @pyreon/styler@0.24.1
  - @pyreon/rocketstyle@0.24.1
  - @pyreon/elements@0.24.1
  - @pyreon/core@0.24.1
  - @pyreon/document@0.24.1
  - @pyreon/connector-document@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`f803527`](https://github.com/pyreon/pyreon/commit/f8035271120088a3fee3a8cdeb8e50848428d2aa)]:
  - @pyreon/core@0.24.0
  - @pyreon/rocketstyle@0.24.0
  - @pyreon/document@0.24.0
  - @pyreon/connector-document@0.24.0
  - @pyreon/elements@0.24.0
  - @pyreon/styler@0.24.0
  - @pyreon/ui-core@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`5c9e45b`](https://github.com/pyreon/pyreon/commit/5c9e45b4797bfc3043d6be9e0d5c022e49639f54), [`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/elements@0.23.0
  - @pyreon/core@0.23.0
  - @pyreon/document@0.23.0
  - @pyreon/connector-document@0.23.0
  - @pyreon/rocketstyle@0.23.0
  - @pyreon/styler@0.23.0
  - @pyreon/ui-core@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/document@0.22.0
  - @pyreon/connector-document@0.22.0
  - @pyreon/elements@0.22.0
  - @pyreon/rocketstyle@0.22.0
  - @pyreon/styler@0.22.0
  - @pyreon/ui-core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/document@0.21.0
  - @pyreon/connector-document@0.21.0
  - @pyreon/elements@0.21.0
  - @pyreon/rocketstyle@0.21.0
  - @pyreon/styler@0.21.0
  - @pyreon/ui-core@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/styler@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/document@0.20.0
  - @pyreon/connector-document@0.20.0
  - @pyreon/elements@0.20.0
  - @pyreon/rocketstyle@0.20.0
  - @pyreon/ui-core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`29788dc`](https://github.com/pyreon/pyreon/commit/29788dc7ae5a52daab204b6205fe39f56703d980), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`078b1e7`](https://github.com/pyreon/pyreon/commit/078b1e72343828b2d73f97c03e0b5b0f335fe979), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e)]:
  - @pyreon/document@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/styler@0.19.0
  - @pyreon/ui-core@0.19.0
  - @pyreon/elements@0.19.0
  - @pyreon/connector-document@0.19.0
  - @pyreon/rocketstyle@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/document@0.18.0
  - @pyreon/connector-document@0.18.0
  - @pyreon/elements@0.18.0
  - @pyreon/rocketstyle@0.18.0
  - @pyreon/styler@0.18.0
  - @pyreon/ui-core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/rocketstyle@0.17.0
  - @pyreon/styler@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/elements@0.17.0
  - @pyreon/document@0.17.0
  - @pyreon/connector-document@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`df3a379`](https://github.com/pyreon/pyreon/commit/df3a3797704e54414ce40553458b8d00fbe5c6be), [`6cda881`](https://github.com/pyreon/pyreon/commit/6cda8819d4c3cb7b1b5a4904aadc3e417524795c), [`21ccd15`](https://github.com/pyreon/pyreon/commit/21ccd153f29fff8ed629a2761a0c33cf33ae0ebe), [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117), [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8)]:
  - @pyreon/core@0.16.0
  - @pyreon/elements@0.16.0
  - @pyreon/rocketstyle@0.16.0
  - @pyreon/styler@0.16.0
  - @pyreon/document@0.16.0
  - @pyreon/connector-document@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`2911026`](https://github.com/pyreon/pyreon/commit/29110269b01a1f2d3dad8c4cd02b424c076ae71e)]:
  - @pyreon/elements@0.14.0
  - @pyreon/core@0.14.0
  - @pyreon/document@0.14.0
  - @pyreon/connector-document@0.14.0
  - @pyreon/rocketstyle@0.14.0
  - @pyreon/styler@0.14.0
  - @pyreon/ui-core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/styler@0.13.0
  - @pyreon/ui-core@0.13.0
  - @pyreon/rocketstyle@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/elements@0.13.0
  - @pyreon/document@0.13.0
  - @pyreon/connector-document@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies [[`f2c2606`](https://github.com/pyreon/pyreon/commit/f2c2606f59584f564b28b2f188d6537766d3060b)]:
  - @pyreon/rocketstyle@0.12.15
  - @pyreon/core@0.12.15
  - @pyreon/document@0.12.15
  - @pyreon/connector-document@0.12.15
  - @pyreon/elements@0.12.15
  - @pyreon/styler@0.12.15
  - @pyreon/ui-core@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies [[`ee1bc2b`](https://github.com/pyreon/pyreon/commit/ee1bc2b0dd3ce853eee4a72bcc8629ed0aa1cea5), [`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13), [`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6)]:
  - @pyreon/elements@0.12.14
  - @pyreon/styler@0.12.14
  - @pyreon/rocketstyle@0.12.14
  - @pyreon/connector-document@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/document@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/document@0.12.13
  - @pyreon/connector-document@0.12.13
  - @pyreon/elements@0.12.13
  - @pyreon/rocketstyle@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/document@0.12.12
  - @pyreon/connector-document@0.12.12
  - @pyreon/elements@0.12.12
  - @pyreon/rocketstyle@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/document@0.12.11
  - @pyreon/connector-document@0.12.11
  - @pyreon/elements@0.12.11
  - @pyreon/rocketstyle@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/ui-core@0.12.11
