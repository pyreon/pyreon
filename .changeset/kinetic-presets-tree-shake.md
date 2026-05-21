---
'@pyreon/kinetic-presets': patch
---

Tree-shake fix: single-preset consumers stop shipping the entire preset catalog.

**Before**: `import { blurInUp } from '@pyreon/kinetic-presets'` shipped all 122 preset factory results to the consumer's bundle (~13.2 KB raw / ~2 KB gzipped).

**After**: the same import ships only `blurInUp` (~300 bytes). 98% size reduction for single-preset consumers.

**The fix**: `/* #__NO_SIDE_EFFECTS__ */` annotation on the 6 factory functions in `src/presets.ts` (`s`) and `src/factories.ts` (`createBlur`, `createFade`, `createRotate`, `createScale`, `createSlide`). Rolldown / Rollup / esbuild all recognise this annotation and propagate it to every call site — turning each `export const X = s(hidden, visible)` into a tree-shake-eligible binding.

**Why this was needed**: `sideEffects: false` in `package.json` is NOT enough. Bundlers conservatively treat top-level function calls (`export const X = s(...)`) as side-effect-bearing, even when the package declares no module-level side effects. Adding `#__NO_SIDE_EFFECTS__` to the factory declaration tells the bundler that every call to it is pure — the established library-authoring convention used by React, Vue, Solid, Preact, Lodash-es, date-fns, etc.

Same behaviour confirmed across Rolldown 1.0.2, esbuild, and Vite 8 (via Rolldown). See `.claude/notes/rolldown-pure-factory-calls.md` for the full investigation (why this isn't a Rolldown bug and why inferring purity at bundle time isn't viable across the ecosystem).

**Regression-gated** by `src/__tests__/tree-shake.test.ts`: bundles a single-preset consumer through esbuild and counts how many `opacity:0` / `translateY` / `translateX` literals survive. Two specs (one importing `blurInUp`, one importing `fade`) fail with ~114 markers without the annotation, pass with 0-2 markers after.

**No API change** — the `presets` aggregate and all individual named exports are unchanged. Consumers using `import { presets } from '@pyreon/kinetic-presets'` still get the full library; consumers importing one preset now ship only that one.
