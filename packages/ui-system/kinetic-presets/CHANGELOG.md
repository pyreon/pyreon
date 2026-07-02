# @pyreon/kinetic-presets

## 0.39.0

### Patch Changes

- [#2019](https://github.com/pyreon/pyreon/pull/2019) [`a401811`](https://github.com/pyreon/pyreon/commit/a40181170cad2c71efa66244aa9306b4b3f8527f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Manifest completion — the final 8 real-API packages join the manifest-driven docs pipeline (llms.txt / llms-full.txt / MCP api-reference now cover them; each ships a bisect-locked manifest-snapshot test). Several stale README claims found during the source-grounded migration were corrected in the same pass.

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.0

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- [#1226](https://github.com/pyreon/pyreon/pull/1226) [`63bdb95`](https://github.com/pyreon/pyreon/commit/63bdb956b9d1ac5db779672f0cd7314de672fac9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / branches / functions / lines. All 4 packages already measure at 100% on every metric (machine 63/63, store 13/13, virtual 59/59, kinetic-presets 198/198) — this PR just locks the thresholds.

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

## 0.25.0

## 0.24.6

## 0.24.5

## 0.24.4

## 0.24.3

## 0.24.2

## 0.24.1

### Patch Changes

- [#790](https://github.com/pyreon/pyreon/pull/790) [`a37b89b`](https://github.com/pyreon/pyreon/commit/a37b89b8e180299c85b84bc82e183429083d58e2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Tree-shake fix: single-preset consumers stop shipping the entire preset catalog.

  **Before**: `import { blurInUp } from '@pyreon/kinetic-presets'` shipped all 122 preset factory results to the consumer's bundle (~13.2 KB raw / ~2 KB gzipped).

  **After**: the same import ships only `blurInUp` (~300 bytes). 98% size reduction for single-preset consumers.

  **The fix**: `/* #__NO_SIDE_EFFECTS__ */` annotation on the 6 factory functions in `src/presets.ts` (`s`) and `src/factories.ts` (`createBlur`, `createFade`, `createRotate`, `createScale`, `createSlide`). Rolldown / Rollup / esbuild all recognise this annotation and propagate it to every call site — turning each `export const X = s(hidden, visible)` into a tree-shake-eligible binding.

  **Why this was needed**: `sideEffects: false` in `package.json` is NOT enough. Bundlers conservatively treat top-level function calls (`export const X = s(...)`) as side-effect-bearing, even when the package declares no module-level side effects. Adding `#__NO_SIDE_EFFECTS__` to the factory declaration tells the bundler that every call to it is pure — the established library-authoring convention used by React, Vue, Solid, Preact, Lodash-es, date-fns, etc.

  Same behaviour confirmed across Rolldown 1.0.2, esbuild, and Vite 8 (via Rolldown). See `.claude/notes/rolldown-pure-factory-calls.md` for the full investigation (why this isn't a Rolldown bug and why inferring purity at bundle time isn't viable across the ecosystem).

  **Regression-gated** by `src/__tests__/tree-shake.test.ts`: bundles a single-preset consumer through esbuild and counts how many `opacity:0` / `translateY` / `translateX` literals survive. Two specs (one importing `blurInUp`, one importing `fade`) fail with ~114 markers without the annotation, pass with 0-2 markers after.

  **No API change** — the `presets` aggregate and all individual named exports are unchanged. Consumers using `import { presets } from '@pyreon/kinetic-presets'` still get the full library; consumers importing one preset now ship only that one.

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

## 0.14.0

## 0.13.0

## 0.12.15

## 0.12.14

## 0.12.13

## 0.12.12

## 0.12.11

## 0.1.2

## 0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages
