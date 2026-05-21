# @pyreon/attrs

## 0.24.1

### Patch Changes

- [#793](https://github.com/pyreon/pyreon/pull/793) [`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): port vitus-labs perf cleanups — measured net wins only

  Mirror the structural cleanups from vitus-labs/ui-system PRs [#244](https://github.com/pyreon/pyreon/issues/244) → [#254](https://github.com/pyreon/pyreon/issues/254)
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

  - `styler.CSSResult._staticResolved` cache (8 repeats): **+85.3%**
  - `attrs.removeUndefinedProps` (10-prop input): **+77.4%**
  - `unistyle.shouldNormalize` (5-key static): **+66.0%**
  - `rocketstyle.pickStyledAttrs` (10-prop input): **+64.4%**
  - `hooks.useBreakpoint buildSortedBpTuples` (5-bp): **+46.5%**
  - `unistyle.createMediaQueries` (5-bp theme): **+31.7%**
  - `unistyle.alignContent isReverted` (mixed): **+30.0%**
  - `unistyle.shallowEqual` (5-key equal): **+27.4%**
  - `elements.Overlay click-close check`: **+20.5%**
  - `styler.HTML_PROPS Set→null-proto-obj` (5-key mix): **+8.3%**
  - `styler.splitRules charCodeAt vs str[i]`: **+8.0%**

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

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732)]:
  - @pyreon/core@0.24.0
  - @pyreon/ui-core@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/ui-core@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/ui-core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/ui-core@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.20.0
  - @pyreon/ui-core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/core@0.19.0
  - @pyreon/ui-core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/ui-core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/ui-core@0.17.0

## 0.16.0

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8)]:
  - @pyreon/core@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/ui-core@0.14.0

## 0.13.0

### Patch Changes

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/ui-core@0.13.0
  - @pyreon/core@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/ui-core@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/ui-core@0.12.11

## 0.1.2

### Patch Changes

- Fix generic type defaults in attrs and rocketstyle — use empty objects instead of Record<string, unknown> to preserve component prop types through SpreadTwo merges

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
