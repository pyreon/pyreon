# @pyreon/kinetic-presets

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
