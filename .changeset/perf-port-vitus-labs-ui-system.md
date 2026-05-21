---
"@pyreon/styler": patch
"@pyreon/unistyle": patch
"@pyreon/rocketstyle": patch
"@pyreon/attrs": patch
"@pyreon/coolgrid": patch
"@pyreon/elements": patch
"@pyreon/hooks": patch
---

perf(ui-system): port vitus-labs perf cleanups — measured net wins only

Mirror the structural cleanups from vitus-labs/ui-system PRs #244 → #254
across Pyreon's ui-system. Each port carries an inline comment naming the
source commit + the upstream-measured delta.

**Policy: only ports that show measurably better under Pyreon's runtime
were kept.** Two upstream changes were measured neutral/worse here and
deliberately reverted:

- `styler.hashUpdate` 4-char unroll — measured +1.6% short / +2.1% long
  under Bun (both inside the ±2% JIT noise band). Reverted to the simple
  single-char loop.
- `elements.Iterator` filterValidItems + detectKind fusion — measured
  -16.3% on a 20-item all-valid complex list (V8's `.filter()` is
  hyper-optimized for arrays with primitive predicates; manual fusion
  loses for small all-valid inputs). Reverted to the two-pass shape.

**Measured wins** (paired before/after micro-bench via
`bun scripts/perf/port-vitus-labs-bench.ts`, Bun 1.3.13, 3 warmup + 7
timed runs, report median):

- `styler.CSSResult._staticResolved` cache (8 repeats):  **+85.3%**
- `attrs.removeUndefinedProps` (10-prop input):          **+77.4%**
- `unistyle.shouldNormalize` (5-key static):             **+66.0%**
- `rocketstyle.pickStyledAttrs` (10-prop input):         **+64.4%**
- `hooks.useBreakpoint buildSortedBpTuples` (5-bp):      **+46.5%**
- `unistyle.createMediaQueries` (5-bp theme):            **+31.7%**
- `unistyle.alignContent isReverted` (mixed):            **+30.0%**
- `unistyle.shallowEqual` (5-key equal):                 **+27.4%**
- `elements.Overlay click-close check`:                  **+20.5%**
- `styler.HTML_PROPS Set→null-proto-obj` (5-key mix):     **+8.3%**
- `styler.splitRules charCodeAt vs str[i]`:              **+8.0%**

Plus 6 structural cleanups (no perf claim, allocation reductions only):

- `styler.globalStyle` length-check vs `.trim()`
- `unistyle.normalizeTheme` / `transformTheme` for-in (drops
  Object.entries tuple-array allocations)
- `rocketstyle` `PSEUDO_AND_META_KEYS` module-scope hoist (per-definition
  allocation removed)
- `rocketstyle.getThemeByMode` recursive for-in
- `coolgrid.useGridContext` direct prop access (drops `pickThemeProps`
  wrapper — 2 `get()` calls saved per render)
- `elements.Text` ternary tag assignment (drops `renderContent` closure)

**Behavioural lock-in tests** (ported from vitus-labs `60fc25c1`, 8 new
specs in `@pyreon/styler`):

- `CSSResult._isDynamic` memoization: populate-on-first / cache-on-
  subsequent (values-mutation sentinel) / nested-propagation.
- `CSSResult._staticResolved` cache: populate-on-first / cache-hit-via-
  sentinel / no-cache-for-dynamic / fallthrough-when-unclassified.
- LRU-2 cacheRef test was React-specific and not ported (Pyreon uses
  signals, not React refs).

**Bisect-verified-with-restore**:

- Disabled `_isDynamic` cache → `× returns cached result on subsequent
  calls without rescanning values` fires; restored → 425/425 pass.
- Disabled `_staticResolved` cache → 2 lock-in specs fire; restored →
  425/425 pass.

**Honest framing**: micro-benches isolate ONE hot path under tight loops;
real-app aggregate deltas are smaller because each path is 1-10% of
per-component mount-time, not 100%. Real-app benchmark
(`examples/benchmark/`) NOT re-run for this PR — the proof here is
per-function structural wins, not a real-app headline number.

**Verification**:

- 1832 tests pass: styler 425 (+8 lock-ins) + unistyle 240 + rocketstyle
  290 + attrs 89 + coolgrid 106 + elements 463 + hooks 219.
- Browser smokes: elements 16, styler 12, rocketstyle 12, unistyle 6,
  coolgrid 7 — all pass.
- lint, typecheck, gen-docs --check, check-doc-claims, check-manifest-
  depth, check-distribution, check-bundle-budgets: all green.
