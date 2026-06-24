# @pyreon/rocketstyle

## 0.35.0

### Patch Changes

- Updated dependencies [[`97fa631`](https://github.com/pyreon/pyreon/commit/97fa6312304951e8cfd24fb8f0f405f94dc609db), [`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`3d47b98`](https://github.com/pyreon/pyreon/commit/3d47b987d244be4ad6b5453cd07ed39be85427bf)]:
  - @pyreon/styler@0.35.0
  - @pyreon/ui-core@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/sized-map@0.35.0

## 0.34.0

### Patch Changes

- [#1618](https://github.com/pyreon/pyreon/pull/1618) [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore` comments on genuinely
  unreachable/defensive branches plus a handful of behavior-preserving
  restructures (dead `else if` → `else`, a redundant early-return removal, an
  extract-variable). No runtime behavior change; verified by the existing node +
  real-Chromium browser suites.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`3c6b8fd`](https://github.com/pyreon/pyreon/commit/3c6b8fd19805f2e41b9aa19929845ae9e3262f74)]:
  - @pyreon/sized-map@0.34.0
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/styler@0.34.0
  - @pyreon/ui-core@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.32.0

### Minor Changes

- [#1528](https://github.com/pyreon/pyreon/pull/1528) [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Opt-in CSS-variables theming mode: `init({ cssVariables: true })` (options: `{ prefix, attribute }`). When enabled, `PyreonUI` autogenerates custom properties from the theme JSON via unistyle's `themeToCssVars` and injects the `:root` block once (SSR-aware — the block rides `getStyleTag()` / the stream flush); the provided theme tree carries `var(--px-…)` leaves; PyreonUI renders a layout-neutral `display: contents` wrapper carrying the mode attribute (server-rendered, so SSR/SSG ship the right mode — nested `inversed` providers scope via the cascade). rocketstyle's `mode(a, b)` pairs become hashed deduped var pairs (`--px-m-<fnv1a>`) resolved by `[data-theme]` rules, theme resolution turns mode-free (the `_rsMemo` key drops its mode segment and the mode signal is not even read), and a dark/light flip is ONE attribute write — measured in real Chromium: computed styles change with zero className writes, `styler.resolve: 0`, `rocketstyle.getTheme: 0`. Flag off is byte-identical to previous behavior. Note: under the flag, `mode(a, b)` values should be unit-complete strings (numbers warn in dev — units cannot be applied to var pairs emitted verbatim).

- [#1528](https://github.com/pyreon/pyreon/pull/1528) [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094) Thanks [@vitbokisch](https://github.com/vitbokisch)! - CSS-variables mode — FOUC fix (Phase 4b) + document export (Q2):

  - `@pyreon/ui-core`: under `init({ cssVariables: true })` the ROOT `PyreonUI` now writes the mode attribute to `document.documentElement` (at `:root`, where the var rules cascade from and where a pre-paint script writes) and returns children unwrapped; only NESTED / `inversed` providers render the `display:contents` wrapper scoping an override to their subtree. New `cssVariablesPrePaintScript({ attribute?, storageKey?, fallback? })` builds the blocking `<head>` script that sets the attribute from localStorage / `prefers-color-scheme` before first paint — the standard dark-mode FOUC fix. (zero apps can keep using the existing `themeScript` export, which writes the same attribute.)
  - `@pyreon/rocketstyle`: `resolveModeVar(value, mode)` — resolve a `mode(a, b)` var pair to its raw light/dark value for non-CSS render targets (document export), backed by a registry the var-pair factory populates.
  - `@pyreon/connector-document`: `resolveStyles` + `extractDocumentTree` gained an optional `resolveVar` hook (+ exported `VarResolver` type) that inlines `var(--…)` style values to raw values during extraction — keeps the bridge dependency-light (only `@pyreon/document`).
  - `@pyreon/document-primitives`: `extractDocNode({ theme?, mode? })` auto-builds the resolver (composing `resolveModeVar` with unistyle's `resolveCssVarReferences` over a `themeToCssVars(theme)` registry), so PDF/DOCX/email export inlines CSS-variable theme values to raw values. Doc primitives that emit raw literals are unaffected.

  Measured/locked in real Chromium; bisect-verified. Flag off (classic path) is byte-identical.

  Also: `PyreonUI` now provides the core context via lazy getters instead of an eager object, so reading `.theme` no longer transitively subscribes to the mode signal. Under cssVariables this makes a theme toggle do ZERO per-component re-runs (the cascade handles it) — a real-app 300-component toggle measures ~1.9× faster (~2.05× at 600 components, holds under 4× CPU throttle); classic mode (which reads `.mode`) is unchanged. New `examples/cssvars-bench` + `scripts/bench-cssvars.ts` for the measurement.

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`3d90e89`](https://github.com/pyreon/pyreon/commit/3d90e89b824d346a33732af929acdbc7fdd81094), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`ae3c3fd`](https://github.com/pyreon/pyreon/commit/ae3c3fd529250e7211657e4283fb5e6c3246bf00)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.30.0

### Patch Changes

- [#1348](https://github.com/pyreon/pyreon/pull/1348) [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(core): `removeUndefinedProps` — the reactive-prop-aware undefined filter moves into core, retiring two hand-rolled copies

  `@pyreon/core/props.ts` owns Pyreon's reactive-prop encoding (`_rp`,
  `makeReactiveProps`, `REACTIVE_PROP`) and the descriptor-preserving merge/split
  utilities (`mergeProps`, `splitProps`). It did NOT own the **one remaining
  operation on that encoding** every prop-forwarding HOC needs: "copy a props
  object, dropping `undefined` data keys while preserving getter-shaped reactive
  props verbatim."

  So `@pyreon/attrs` and `@pyreon/rocketstyle` each hand-rolled it
  (`utils/attrs.ts:removeUndefinedProps`) — byte-identical bodies. **And the
  `@pyreon/attrs` copy historically shipped as a value-copy** (`result[key] =
props[key]`), which fires getter-shaped reactive props at HOC-setup time and
  collapses the live signal to a static snapshot — silently breaking reactive-prop
  forwarding for any consumer using `attrs(Component)` directly (its own docstring
  records this). Two divergent copies of an operation core should own = the exact
  shape that lets one regress while the other stays correct.

  New `removeUndefinedProps` is exported from `@pyreon/core`, next to `mergeProps`
  / `splitProps` / `makeReactiveProps`. Both `@pyreon/attrs` and
  `@pyreon/rocketstyle` now re-export it from core (call sites import from
  `../utils/attrs` unchanged); the duplicate implementations are deleted.

  - `@pyreon/core`: new `removeUndefinedProps` export (+ manifest entry, 6 specs).
  - `@pyreon/attrs`: `utils/attrs.ts` re-exports from core (hand-roll deleted).
  - `@pyreon/rocketstyle`: `utils/attrs.ts` re-exports from core (hand-roll deleted).

  Bisect-verified (`core/src/tests/remove-undefined-props.test.ts`): replacing
  the descriptor-copy with a value-copy fails the getter-preservation specs (the
  getter fires + the prop becomes a static value); restored → 6/6. No behavior
  change — both copies were already the correct descriptor-copy form.

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/sized-map@0.33.0

## 0.29.0

### Patch Changes

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`f4ea1a1`](https://github.com/pyreon/pyreon/commit/f4ea1a1e5af38b37b4eb2feb14f4594e3c3c3482), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0
  - @pyreon/sized-map@0.33.0

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

- [#1232](https://github.com/pyreon/pyreon/pull/1232) [`e8d00a7`](https://github.com/pyreon/pyreon/commit/e8d00a763b713aab51172b1e16c6529feac028d3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(rocketstyle): replace O(n²) accumulating-spread reduces with mutate-accumulator

  `removeNullableValues`, `chainOrOptions`, and `chainReservedKeyOptions` built
  their result objects with `reduce((acc, x) => ({ ...acc, ... }), {})` — spreading
  the accumulator every iteration is O(n²) in the number of keys. These run on the
  rocketstyle reserved-keys / dimension pipeline per component definition. Switched
  to mutate-and-return (`acc[k] = v; return acc`) — behavior-identical, O(n). No
  public API change; all 308 rocketstyle tests pass unchanged.

- Updated dependencies [[`a448ff4`](https://github.com/pyreon/pyreon/commit/a448ff4fa5b5627622be0fcd7fbe65b5f8c51991), [`ad5bd29`](https://github.com/pyreon/pyreon/commit/ad5bd29dbed3ee0517bddf63ff839c427bfd7edf), [`e975f3a`](https://github.com/pyreon/pyreon/commit/e975f3aa9a5ca0fa7983c8f4fa47c412cea7d735), [`4058727`](https://github.com/pyreon/pyreon/commit/40587271deeb30f968dcf297ee7781e2993ca1e8), [`cb4e2e6`](https://github.com/pyreon/pyreon/commit/cb4e2e6e96de147089fd80ba782152865ec6695a)]:
  - @pyreon/sized-map@0.28.1
  - @pyreon/ui-core@0.28.1
  - @pyreon/styler@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies [[`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3)]:
  - @pyreon/sized-map@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.27.1

### Patch Changes

- [#1189](https://github.com/pyreon/pyreon/pull/1189) [`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: publish `@pyreon/sized-map` and force topological build order

  The 0.27.0 release silently failed: `bun run --filter='./packages/*/*' build`
  runs in parallel, and seven framework packages (`@pyreon/core/router`,
  `@pyreon/core/runtime-dom`, `@pyreon/tools/lint`, `@pyreon/ui-system/elements`,
  `@pyreon/ui-system/rocketstyle`, `@pyreon/ui-system/kinetic`, `@pyreon/zero/zero`)
  listed `@pyreon/sized-map` in `devDependencies` despite IMPORTING it from `src/`.
  Bun's filter respects `dependencies` for topological ordering but not
  `devDependencies`, so a consumer could start building before sized-map's `lib/`
  existed, crashing with `[UNLOADABLE_DEPENDENCY] Could not load .../sized-map/lib/index.js`.

  This also closes a type-leak: `@pyreon/router/lib/types/index.d.ts:3` carries
  `import { SizedMap } from '@pyreon/sized-map'`, which would degrade to `any`
  for npm consumers if sized-map stayed private.

  Changes:

  - `@pyreon/sized-map` is now publishable to npm (was `private: true`). The
    package is a small, focused, bounded-Map primitive (FIFO or LRU-on-read) —
    safe to use directly even though Pyreon's main consumers are framework-internal.
  - All 7 consumers move `@pyreon/sized-map` from `devDependencies` →
    `dependencies`. This forces `bun run --filter` to respect topological order
    and makes the transitive dep explicit for npm consumers.
  - Added to `.changeset/config.json` `fixed[0]` group so it ships with every
    other framework package at the synced version.

  First-publish is bootstrapped manually following the OIDC trusted-publisher
  procedure documented in CLAUDE.md.

- Updated dependencies [[`0fae784`](https://github.com/pyreon/pyreon/commit/0fae784fdb1bd1ef0c41ffc2f58472c4392ce781)]:
  - @pyreon/sized-map@0.27.1
  - @pyreon/styler@0.27.1
  - @pyreon/ui-core@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/styler@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.26.3
  - @pyreon/ui-core@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/styler@0.26.2
  - @pyreon/ui-core@0.26.2

## 0.26.1

### Patch Changes

- [#1154](https://github.com/pyreon/pyreon/pull/1154) [`487f1aa`](https://github.com/pyreon/pyreon/commit/487f1aa56e3b10746366f17deff2f4ba4cae827b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(rocketstyle, styler): reactive props on chained rocketstyle components

  A downstream consumer reported reactive props on rocketstyle-wrapped
  components (`<Button href={signal() ? a : b}>`) stayed static through the
  chained HOC pipeline (`.config()` / `.attrs()` / `.theme()` / `.states()`
  / `.sizes()` / `.compose()`). Investigation found TWO distinct value-copy
  sites that the PR [#584](https://github.com/pyreon/pyreon/issues/584) reactive-prop sweep missed:

  **1. `@pyreon/rocketstyle/src/context/createLocalProvider.ts`** — the HOC
  inserted between `EnhancedComponent` and the styled leaf when
  `options.provider: true` (top-level rocketstyle wrappers including all
  ui-components Buttons). Pre-fix shape used a parameter-destructure
  (`({ onMouseEnter, …, ...props })`) and a final value-spread
  (`{ ...props, ...events, $rocketstate }`) — both fire every getter
  descriptor on the incoming props at HOC setup, snapshotting the
  `_rp(() => signal())`-driven reactive props that `makeReactiveProps`
  installs.

  Fix: receive `props` as a single argument; read event-handler keys lazily
  inside the event closures (so handler-descriptor getters fire at
  event-fire time, not HOC setup); build `restProps` via `omit()` from
  `@pyreon/ui-core` (descriptor-copy); merge with `mergeDescriptors` from
  `@pyreon/rocketstyle/utils/attrs`.

  **2. `@pyreon/styler/src/forward.ts:buildProps`** — class-merging
  code value-read `rawProps.class` even when the descriptor was a getter,
  capturing the snapshot and emitting a static merged class. The pre-fix
  comment "Reading rawProps.class synchronously is fine" was wrong for the
  reactive case.

  Fix: detect getter-shaped `class` / `className` descriptors and wrap the
  merge in a getter that re-reads + re-composes on every access. The
  emitted getter carries the reactive subscription through to `applyProp`
  which DOES fire its renderEffect on descriptor read. Static class still
  takes the simple value-merge fast path.

  **Heavy test coverage** added to lock the contract — bisect-verified at
  both unit AND browser layers:

  - `createLocalProvider.descriptors.test.ts` (14 new unit specs) — fires/no-fires
    counts on getter descriptors, descriptor verbatim forwarding, mixed
    static + reactive props, large prop sets, edge cases (empty props,
    $rocketstate accessor function form, symbol-keyed props,
    event-handler interaction)
  - `reactive-prop-chained.browser.test.tsx` (19 new real-Chromium specs):
    - per-chain-shape reactive `href` (8 cases: bare / .config / .attrs /
      .theme / .states / .sizes / .compose / full chain)
    - reactive ternary expressions
    - reactive `class` / `data-*` / `aria-*`
    - multiple independent reactive props on one component
    - mixed reactive + static prop forwarding
    - pseudo-state event handlers + reactive props coexist

  Bisect:

  - revert `createLocalProvider.ts` → 6 of 14 unit tests fail with
    `expected 1 to be +0` (getters fired at HOC entry when they should fire
    zero times)
  - revert `styler/forward.ts` → 1 of 19 browser tests fails (reactive
    class no longer swaps)
  - both restored → 309/309 unit + 31/31 browser pass

  Adjacent suites stay green: `@pyreon/styler` 428/428, `@pyreon/elements`
  497/497, `@pyreon/ui-components` (all green).

- Updated dependencies [[`487f1aa`](https://github.com/pyreon/pyreon/commit/487f1aa56e3b10746366f17deff2f4ba4cae827b), [`5af2864`](https://github.com/pyreon/pyreon/commit/5af28641ab1ad31a0c3feaf1c6a95163e83935d3)]:
  - @pyreon/styler@0.26.1
  - @pyreon/ui-core@0.26.1

## 0.26.0

### Patch Changes

- [#1111](https://github.com/pyreon/pyreon/pull/1111) [`421fc21`](https://github.com/pyreon/pyreon/commit/421fc211ca6da19a332ed7dc5b51545181ee58da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(ui-system): batch() multi-signal writes + LRU-bound kinetic splitCache

  Four hot multi-signal write sites previously notified subscribers twice per event. `batch()` collapses notify cycles to one per event:

  - `@pyreon/rocketstyle` `createLocalProvider.ts` `onMouseLeave` — `hover` + `pressed` (fires on every styled-hover-state mouseleave).
  - `@pyreon/rocketstyle` `usePseudoState.ts` `onMouseLeave` — `hover` + `pressed` (fires on every `usePseudoState` consumer).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` `hideContent` — `active` + `isContentLoaded` (fires on every overlay dismiss path).
  - `@pyreon/elements` `Overlay/useOverlay.tsx` position recompute — `innerAlignX` + `innerAlignY` (fires on every scroll-driven recompute).

  Doubling subscriber work per event compounds visibly on UIs with many overlay or styled-hover-state consumers; the change is invisible to single-signal consumers.

  `@pyreon/kinetic` `utils.ts` `splitCache` was an unbounded `Map<string, string[]>` keyed by class-name strings — Class C leak per the anti-pattern catalog. Real-app inputs are stable per kinetic definition, but HMR cycles, dynamic theme generation, and A/B-tested variants can grow it without limit. Bounded at 128 entries with insertion-order eviction (matches `@pyreon/styler` `classCache`).

- Updated dependencies [[`448073c`](https://github.com/pyreon/pyreon/commit/448073c3066bda0e54c71d85cf6bcfebc148a6f0), [`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/styler@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/ui-core@0.33.0

## 0.25.1

### Patch Changes

- [#901](https://github.com/pyreon/pyreon/pull/901) [`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Bundle-size shrink across browser-shipped packages — **~7 KB gzipped saved** total. A typical Pyreon app shipping `runtime-dom + reactivity + core + router` is now **~5.7 KB lighter**.

  ## Wins (gzipped, measured at the production-define bundle level)

  | Package               | Before | After | Saved                      |
  | --------------------- | ------ | ----- | -------------------------- |
  | `@pyreon/runtime-dom` | 12,655 | 9,719 | **−2,936 B (−23%)**        |
  | `@pyreon/reactivity`  | 7,870  | 6,328 | **−1,542 B (−20%)**        |
  | `@pyreon/core`        | 4,972  | 4,191 | **−781 B (−16%)**          |
  | `@pyreon/router`      | 10,148 | 9,582 | **−566 B (−6%)**           |
  | `@pyreon/rocketstyle` | 4,390  | 3,992 | **−398 B (−9%)**           |
  | `@pyreon/styler`      | 5,624  | 5,453 | **−171 B (−3%)**           |
  | `@pyreon/server`      | 3,575  | 3,431 | **−144 B (−4%)**           |
  | `@pyreon/attrs`       | 1,017  | 915   | **−102 B (−10%)**          |
  | (8 more)              | ...    | ...   | smaller wins (1–98 B each) |

  17 packages shrunk total. Net **−7,153 B** gzipped across the published Pyreon footprint.

  ## Two complementary fixes

  **1. `check-bundle-budgets.ts` now measures the PRODUCTION-stripped size.** The script's `Bun.build` invocation was missing `define: { 'process.env.NODE_ENV': '"production"' }`. As a result, the budget measurement INCLUDED every `if (process.env.NODE_ENV !== 'production') console.warn(...)` string from `lib/` — overstating the real consumer bundle by 5–20% per package and forcing budget bumps for dev-only diagnostic growth that never reaches end users. Real consumers (Vite/Webpack/esbuild) all set this define at their build time; the measurement now matches what they actually ship.

  **2. Removed the `const __DEV__ = process.env.NODE_ENV !== 'production'` alias** from 22 files across 7 browser-shipped packages, in favor of the bare gate `if (process.env.NODE_ENV !== 'production')` at the use site. The alias pattern is recognized by `dev-guard-warnings` lint rule but is silently worse for downstream bundle size — Bun.build and several esbuild configurations don't propagate the const-folded value through the alias even when the production define is set. The bare gate folds reliably at the use site because the bundler replaces the expression with a literal `false` directly. This is the bundler-agnostic library convention used by React, Vue, Preact, Solid.

  Pure internal optimization — no API change, no behavior change. DEV mode behavior unchanged (warnings still fire identically in development). The migration is locked in by `pyreon/no-process-dev-gate` lint rule and the regenerated `scripts/bundle-budgets.json` floor.

  ## QA

  - All 1,378 compiler tests + 680 runtime-dom tests + 521 router tests + 168 server tests + 998 zero tests pass (storage test failures are pre-existing on main, unrelated to this PR)
  - Whole-repo `bun run lint` + `typecheck` clean
  - `gen-docs --check` clean
  - `bench:fair` (real-Chromium across 8 frameworks): Pyreon at top of tied cluster on 4 of 7 tests (create-1k, replace-all, partial-update, create-10k), tied in cluster on the other 3 — no regression
  - One pre-existing test (`dev-gate-treeshake.test.ts non-Vite consumer runtime correctness`) updated to reflect the new bare-gate contract: esbuild's `platform: 'browser'` default replacement (`process.env.NODE_ENV = "development"`) folds the bare gate AND the minifier strips the warn body — strictly better than the old `__DEV__` alias pattern the test was guarding

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/styler@0.25.1
  - @pyreon/ui-core@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/ui-core@0.25.0
  - @pyreon/styler@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/styler@0.24.6
  - @pyreon/ui-core@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/styler@0.24.5
  - @pyreon/ui-core@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/styler@0.24.4
  - @pyreon/ui-core@0.24.4

## 0.24.3

### Patch Changes

- [#837](https://github.com/pyreon/pyreon/pull/837) [`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `rocketstyle` Provider Theme — `rootSize` is no longer required at the type level.

  The deprecated public `Provider` exported from `@pyreon/rocketstyle` had `rootSize: number` (required) in its `Theme` type. Passing a minimal theme without `rootSize` was a TypeScript error even though the runtime tolerates it gracefully: `enrichTheme` defaults `rootSize` to `16`, `makeItResponsive` short-circuits to plain CSS when breakpoints are empty, and the `value()` unit converter defaults `rootSize` to `16` internally.

  The type now matches every other theme contract in the UI system (`@pyreon/unistyle` `PyreonTheme`, `@pyreon/ui-core` Provider, `@pyreon/unistyle` `makeItResponsive`): both `rootSize` and `breakpoints` optional. Apps that don't need responsive design just omit `breakpoints`; apps that want a custom root font size pass `rootSize`; apps that want neither pass neither.

  ```ts
  // All of these now type-check (previously the first three failed):
  <Provider theme={{ colors: { primary: '#228be6' } }}>           {/* minimal */}
  <Provider theme={{ breakpoints: { xs: 0, sm: 576 }, colors }}>  {/* responsive only */}
  <Provider theme={{ rootSize: 16, colors }}>                     {/* rem only */}
  <Provider theme={{ rootSize: 16, breakpoints: {…}, colors }}>   {/* full (pre-existing) */}
  ```

  Backward-compat: every existing theme that passed `rootSize` still type-checks. Non-breaking.

  Bisect-verified: reverting `rootSize?: number` → `rootSize: number` produces `TS2322: Property 'rootSize' is missing in type '{ colors: ... }' but required in type 'Theme'` on the two regression specs (`packages/ui-system/rocketstyle/src/__tests__/minimal-theme.test.ts`). Restored → 5/5 specs pass + 295/295 rocketstyle tests pass.

- Updated dependencies [[`b5b87ab`](https://github.com/pyreon/pyreon/commit/b5b87abd2dcdf315260595b3f0b6d3908789c1fb)]:
  - @pyreon/ui-core@0.24.3
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/styler@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/styler@0.24.2
  - @pyreon/ui-core@0.24.2

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

- Updated dependencies [[`e39d2c2`](https://github.com/pyreon/pyreon/commit/e39d2c2699ea5108bec76188ff66819a507ebab9)]:
  - @pyreon/styler@0.24.1
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/ui-core@0.24.1

## 0.24.0

### Patch Changes

- [#762](https://github.com/pyreon/pyreon/pull/762) [`f803527`](https://github.com/pyreon/pyreon/commit/f8035271120088a3fee3a8cdeb8e50848428d2aa) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(rocketstyle): raise `_rsMemo` LRU cap from 32 to 128 to eliminate cache thrashing on high-cardinality workloads

  The dimension-prop memo's previous cap of 32 was sized for the E2 perf-
  dashboard reference workload — true for that specific benchmark, NOT
  true for any real app with:

  - Data tables where every cell has a `(state, size, variant)` derived
    from row data
  - Design systems with many named tokens crossed with size/variant axes
  - Dashboards rendering many small interactive components

  ## Measurement (closed PR [#761](https://github.com/pyreon/pyreon/issues/761), branch `spike/rocketstyle-precompute`)

  Real `<Button>` from `@pyreon/ui-components` mounted under real
  `<PyreonUI>` provider, 200 mounts × 5 runs, real Chromium via
  `@vitest/browser`:

  | Profile     | unique tuples | cap=32 timed | cap=128 timed | Δ        | cold-getTheme (32 → 128) |
  | ----------- | ------------- | ------------ | ------------- | -------- | ------------------------ |
  | HOT_1       | 1             | 5.10ms       | 5.10ms        | 0        | 0 → 0                    |
  | MIXED_12    | 12            | 4.90ms       | 5.10ms        | 0        | 6 → 0                    |
  | MEDIUM_32   | 32            | 5.40ms       | 5.50ms        | 0        | 25 → 0                   |
  | **COLD_60** | **60**        | **9.40ms**   | **5.10ms**    | **−46%** | **888 → 0**              |

  For workloads ≤ cap, the LRU never evicts → bumping the cap has no
  effect (proven by the HOT_1 / MIXED_12 / MEDIUM_32 cells above being
  within noise). For workloads > cap, every mount past the cap thrashes
  → raising the cap closes that gap entirely.

  ## Trade-off

  Memory cost is ~12KB per definition per theme at the new cap (128
  entries × ~100 bytes per `RsMemoEntry`). For a typical real app with
  30 rocketstyle definitions across 2 themes, that's ~720KB — negligible
  vs the 46% wall-clock improvement on high-cardinality surfaces.

  ## Bisect verification

  `packages/ui-system/rocketstyle/src/__tests__/memo-cap.test.ts` ships
  3 specs:

  - 64 unique tuples warm-pass must have ZERO cold resolves (cap ≥ 64)
  - 100 unique tuples warm-pass must have ZERO cold resolves (cap ≥ 100)
  - 200 unique tuples — control: still evicts (cap < 200), guards
    against an accidental "remove cap entirely" change that would let
    the memo grow unbounded

  Reverted `RS_MEMO_CAP` to 32 → the first two specs fail with `expected
N to be 0` (N=64 and N=100 respectively); control spec stays green
  (workload still exceeds cap=32, just by less). Restored to 128 →
  3/3 pass.

  ## Surfaces updated

  - `packages/ui-system/rocketstyle/src/rocketstyle.ts` — `RS_MEMO_CAP`
    32 → 128 + rationale comment
  - `packages/ui-system/rocketstyle/src/__tests__/memo-cap.test.ts` —
    3 regression specs locking the cap behavior via the
    `rocketstyle.getTheme` counter
  - `CLAUDE.md` — rocketstyle `_rsMemo` claim updated (32 → 128 +
    rationale + regression-test pointer)

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/styler@0.24.0
  - @pyreon/ui-core@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/styler@0.23.0
  - @pyreon/ui-core@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/styler@0.22.0
  - @pyreon/ui-core@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/styler@0.21.0
  - @pyreon/ui-core@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b), [`65e61eb`](https://github.com/pyreon/pyreon/commit/65e61eba20741a012b753b4c8c69045f408768b7)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/styler@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/ui-core@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838), [`5431467`](https://github.com/pyreon/pyreon/commit/5431467ac41ccd1374359120b3e71f4af5d6745e)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/styler@0.19.0
  - @pyreon/ui-core@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/styler@0.18.0
  - @pyreon/ui-core@0.18.0

## 0.17.0

### Patch Changes

- [#584](https://github.com/pyreon/pyreon/pull/584) [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Preserve reactive props through component-JSX spread + framework prop pipelines.

  **Bug class.** Pyreon's reactive-prop contract is that `<Comp prop={signal()}>` compiles to `h(Comp, { prop: _rp(() => signal()) })` and `mount.ts:makeReactiveProps` converts `_rp`-branded thunks into property GETTERS on the props object. Any prop-pipeline step that VALUE-COPIES `props[key]` (plain assignment, spread, or `Object.assign`) fires the getter at HOC setup time — outside any tracking scope — and stores the resolved value as a static data property. Every downstream JSX accessor reading `props.x` then sees the captured-once value, never re-subscribing to the underlying signal.

  **Two layers of fix:**

  1. **Compiler-level (closes the bug class for all consumers, including user code).** Both the JS compiler (`src/jsx.ts`) and the Rust native binary (`native/src/lib.rs`) now wrap component-JSX spread arguments with the new `_wrapSpread(...)` helper from `@pyreon/core`. `<Comp {...source}>` compiles to `jsx(Comp, { ..._wrapSpread(source) })` — `_wrapSpread` replaces getter descriptors with `_rp`-branded thunks, so the JS-level spread carries function values (no getters fire), and `makeReactiveProps` converts them back to getters on the consumer side. Fast path: when `source` has no getter descriptors, `_wrapSpread` returns the source unchanged — zero overhead for the 99% of spread sources that don't carry reactive props. Lowercase-tag (DOM) spreads route through the template path's `_applyProps` (already reactive) and skip the wrap.

  2. **Framework-level (closes every observed leak site in shipped packages):**
     - `@pyreon/rocketstyle` — `removeUndefinedProps` + `mergeDescriptors` (new helper in `utils/attrs.ts`) replace 3 spread sites in `rocketstyleAttrsHoc.ts` and `rocketstyle.ts`'s `mergeProps`. `finalProps.ref` / `$rocketstyle` / `$rocketstate` writes use `Object.defineProperty` (handles getter-only descriptors).
     - `@pyreon/styler` — `buildProps` in `forward.ts` copies descriptors via `copyDescriptor` instead of value-reads.
     - `@pyreon/ui-core` — `omit` / `pick` in `utils.ts` copy descriptors.
     - `@pyreon/elements` — Wrapper's `buildStyledProps` builds props via descriptor-preserving copy and forwards `ref` / `as` / extras via `Object.defineProperty`.
     - `@pyreon/core` — `jsx-runtime.ts`'s `jsx()` has a slow path that preserves descriptors when `props` arrives with getters (for direct `h()` callers).
     - `@pyreon/runtime-dom` — `applyProps` in `props.ts` detects getter descriptors and wraps the write in `renderEffect`.

  **Bisect-verified at TWO layers:**

  - **Unit / browser**: `packages/ui-system/rocketstyle/src/__tests__/reactive-props-preservation.test.ts` (9 specs) + the new `rocketstyle.browser.test.tsx` spec covering the full pipeline. Reverting any of the 4 leak-site fixes individually fails the relevant spec with `expected 'count: 1' to be 'count: 0'`.
  - **Real-Chromium e2e**: `e2e/ui-showcase-regression.spec.ts:793 — signal-driven prop on Button updates the DOM on flip` exercises a rocketstyle Button with a `title={\`count: \${count()}\`}` prop fed by a signal. Reverting the compiler-level fix (`packages/core/compiler/src/jsx.ts`+`native/src/lib.rs`+ rebuilding the Rust binary) → spec fails with`unexpected value "count: 0"` after click — proving the spread reactivity contract holds end-to-end through the entire prop pipeline (rocketstyle attrs HOC → styler buildProps → Element Wrapper → runtime-dom applyProps).

  **No public API breakage.** `_wrapSpread` is an internal compiler-emitted helper; users never call it directly. Framework-internal helpers (`mergeDescriptors` in rocketstyle, `copyDescriptor` in styler, etc.) are not exported. The only public surface change is that getter-shaped reactive props now survive every framework boundary — i.e. the reactive-prop contract finally works as documented.

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/styler@0.17.0
  - @pyreon/ui-core@0.17.0
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Minor Changes

- [#564](https://github.com/pyreon/pyreon/pull/564) [`6cda881`](https://github.com/pyreon/pyreon/commit/6cda8819d4c3cb7b1b5a4904aadc3e417524795c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Split `.attrs()` into two explicit overloads (callback form first, object form second) AND widen the DFP (calculated final props) type so JSX call sites with EA (extended-attrs) generics don't require redundant prop annotations.

  **Overload split**: `attrs(callback, config?)` and `attrs(object, config?)` were one polymorphic signature. TS picked the wrong one for `<P>`-typed object literals (the callback overload distributes `Partial<DFP & P>` over the callback's props arg; the object overload binds `P` directly to the literal). Splitting into two declarations lets TS pick the structurally-correct overload at the call site.

  **Asymmetric callback shape** (Pyreon-specific): callback PROPS narrow to `Partial<DFP & P>`, callback RETURN stays loose as `Partial<P> & Record<string, unknown>`. This preserves the convention where `.attrs()` callbacks return runtime-only fields like `_documentProps` / `tag: 'a'` overrides that aren't on the user's `<P>` generic.

  **DFP widening with `OA extends infer O` distribution**: `MergeTypes<[OA, EA, DefaultProps, ExtractDimensionProps<...>]>` now distributes over each branch of `OA` (when `OA` is a union, e.g. from a multi-overload base component). Pairs with PR [#565](https://github.com/pyreon/pyreon/issues/565) (`ExtractProps` overload narrowing) — DFP now correctly fans out across every overload's props instead of collapsing to the last one.

  **`NoInfer<DFP>` on the object form** (TS 5.4+): prevents TS from inferring `P` from `DFP` in the second overload — `P` must come from the user's literal or stays at its `TObj` default. Fixes "no overload matches this call" errors at consumer call sites in `document-primitives`, `ui-components`, `ui-primitives`. Mirrors vitus-labs commit.

### Patch Changes

- [#565](https://github.com/pyreon/pyreon/pull/565) [`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Multi-overload-aware `ExtractProps<T>`. Pattern-matches up to 4 call signatures and returns the UNION of their first-argument types instead of capturing only the LAST overload (TS's overload-resolution-against-conditional-types default). Multi-overload primitives like `Iterator` / `List` / `Element` ship 3 overloads where the LAST one is the loosest (`ChildrenProps`); pre-fix `ExtractProps<Iterator>` returned just `ChildrenProps` and lost `SimpleProps<T>` + `ObjectProps<T>` — wrapping Iterator through `rocketstyle()` / `attrs()` silently downgraded the public prop surface to the loose children-only form.

  Single-overload functions still work — TS fills missing slots by repeating the last overload, so the union of 4 copies of the same shape dedupes back to one.

  Kept in sync across the 4 copies in `@pyreon/core`, `@pyreon/elements`, `@pyreon/attrs`, `@pyreon/rocketstyle`. Pairs with the upcoming Iterator/List `LooseProps` fallback overload (separate PR), which gives the now-wider union a binding home at the JSX site.

  Mirrors vitus-labs PR [#222](https://github.com/pyreon/pyreon/issues/222).

- [#560](https://github.com/pyreon/pyreon/pull/560) [`21ccd15`](https://github.com/pyreon/pyreon/commit/21ccd153f29fff8ed629a2761a0c33cf33ae0ebe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix `isDark`/`isLight` helper swap in `rocketstyle`'s `getDefaultAttrs`. The attrs callback received `isDark: mode === 'light'` and `isLight: mode === 'dark'` — exact inverse of the documented semantics. Any user code reading `helpers.isDark` / `helpers.isLight` from `.attrs(callback)` got the wrong flag for both light and dark mode. Inversed mode (`inversed: true`) was also affected since it flows through the same helper. Mirrors vitus-labs commit.

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`53b230c`](https://github.com/pyreon/pyreon/commit/53b230cc9715129af0088da516f572e6572a2117), [`3b61ea9`](https://github.com/pyreon/pyreon/commit/3b61ea986e45fa5c4560d766532123276033abb8)]:
  - @pyreon/core@0.16.0
  - @pyreon/styler@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/ui-core@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/styler@0.14.0
  - @pyreon/ui-core@0.14.0

## 0.13.0

### Patch Changes

- [#258](https://github.com/pyreon/pyreon/pull/258) [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Performance rearchitecture: reactive theme/mode/dimension switching via computed (not effect).

  - **styler**: `DynamicStyled` uses one `computed()` per component (not `effect()`) to track theme + mode + dimension signals. The resolve itself runs `runUntracked()` to prevent exponential cascade. String-equality memoization eliminates redundant DOM updates. Per-definition WeakMap cache (Tier 2) skips resolve entirely for repeated identical inputs.
  - **styler**: `ThemeContext` is a `createReactiveContext<Theme>`. `useThemeAccessor()` returns the raw accessor for tracking inside computeds.
  - **ui-core**: `PyreonUI` nested `inversed` prop inherits parent mode reactively — inner section automatically flips when outer mode changes.
  - **unistyle**: `styles()` uses key→index lookup (Tier 1) — 257 descriptor iterations reduced to ~10-20 per call.
  - **rocketstyle**: passes `$rocketstyle`/`$rocketstate` as function accessors tracked by the styled computed.
  - **router**: `RouterLink` guards non-string `props.to` in activeClass (fixes SSR crash with `styled(RouterLink)`).
  - **core**: `popContext()` is a silent no-op on empty stack.

  Expected impact: 2+ GB memory → < 100 MB, 20s render → < 2s for 150-component pages.

- Updated dependencies [[`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/styler@0.13.0
  - @pyreon/ui-core@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- [#257](https://github.com/pyreon/pyreon/pull/257) [`f2c2606`](https://github.com/pyreon/pyreon/commit/f2c2606f59584f564b28b2f188d6537766d3060b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Align `useBooleans` type default with runtime default (`false`). Previously the type default was `true` while the runtime default was `false`, so boolean dimension props like `<Heading level3 />` typechecked but were silently dropped at runtime — components rendered with only their base `.theme()` styles, missing all `.sizes()` / `.variants()` / `.states()` overrides. Consumers that relied on boolean shorthand must either pass `useBooleans: true` explicitly or switch to the object form (`size="level3"`, `state="primary"`, `variant="secondary"`).

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/styler@0.12.15
  - @pyreon/ui-core@0.12.15

## 0.12.14

### Patch Changes

- [#252](https://github.com/pyreon/pyreon/pull/252) [`25949e7`](https://github.com/pyreon/pyreon/commit/25949e79484f169ac905bb9feecf31c702de1db6) Thanks [@vitbokisch](https://github.com/vitbokisch)! - T1.1 Phase 5 Batch 2 — browser smoke tests for rocketstyle + coolgrid + connector-document

  Adds real-Chromium Playwright smoke tests for three more ui-system
  packages. happy-dom can't compute styles from the injected stylesheet
  or resolve `@media` queries, so the rocketstyle → styler → DOM cascade,
  the coolgrid grid math, and the connector-document real-`h()`
  extraction pipeline went untested end-to-end.

  `@pyreon/rocketstyle` (`src/__tests__/rocketstyle.browser.test.tsx`,
  6 tests). Wraps a real `ComponentFn` (not `'div' as any`), matching
  production rocketstyle usage (Element/Text bases).

  - `.theme()` mounts and Chromium computes the authored color/padding
    via styler; emits a `pyr-*` class.
  - `state` prop swaps the resolved `$rocketstyle` theme.
  - `variant` layers on top of state.
  - `modifier` transform derives styles from the accumulated state theme.
  - `m(light, dark)` theme callback resolves per `PyreonUI` mode.
  - Reactive mode swap: `mode` is a signal on `PyreonUI`, rocketstyle's
    `$rocketstyleAccessor` reads `themeAttrs.mode` (ReactiveContext
    getter), styler's `isReactiveRS` effect observes the change and
    swaps classList in place — no remount. This is the only axis that
    survives the rocketstyle HOC spread (`{...filteredProps}` in
    `rocketstyleAttrsHoc` collapses `_rp()` getter props to values, so
    dimension props like `state={stateSig()}` aren't currently reactive
    end-to-end; mode flows via context, not props, so it stays live).

  `@pyreon/coolgrid` (`src/__tests__/coolgrid.browser.test.tsx`, 7 tests).
  Wraps in `PyreonUI` (deprecated `<Provider>` from @pyreon/unistyle
  replaced).

  - Container mounts with `display: flex; flex-direction: column`.
  - Col size=6/12 → ~50% of Row; two size=6 Cols sum to ~100%
    side-by-side.
  - `flex-basis: 25%` for size=3/12.
  - **columns != 12**: `theme.grid.columns = 6`, size=2/6 → 33.3333%
    — proves the math is `size / columns`, not hardcoded.
  - **`gap` subtraction**: Row `gap={24}`, Col size=6 emits
    `calc(50% - 24px)`; Chromium preserves the literal in computed
    `flex-basis`, col width < 50% of Row but > 40% (subtraction not
    failure).
  - **Responsive `size={[12, 6, 4]}`**: at the ~414px vitest viewport
    (below `sm`=576), the xs entry applies → size=12 → 100% of Row.

  `@pyreon/connector-document`
  (`src/__tests__/connector-document.browser.test.tsx`, 5 tests).

  - **Path A strict**: component body throws; if `extractDocumentTree`
    falls through to Path B and invokes the component, the test fails
    with the throw. Passing proves Path A reads `_documentProps` off
    the JSX vnode without invoking the component.
  - Path B: `extractDocumentTree` invokes the component to recover
    `_documentProps` from the post-call vnode (the rocketstyle
    attrs-HOC pattern).
  - Function-valued `_documentProps` resolve to LIVE values at
    extraction time — same vnode, signal mutated between calls, second
    extraction reads the new value.
  - Transparent (non-documentType) wrappers built with real `h()`
    flatten correctly.
  - `resolveStyles` produces a plain style record in the browser bundle
    (color/backgroundColor/fontSize=24/padding=[8,16] all parse; no
    Node-only dep leaks).

  Bisect-verified (load-bearing hot-path revert per suite):

  - **rocketstyle**: (a) emptied dimension theme merge → 3/6 failed
    (state, variant, modifier). (b) Static-returned `mode` in `useTheme`
    → 2/6 failed (reactive mode swap, m-callback dark-mode test).
    Restored, 6/6 pass.
  - **coolgrid**: (a) emptied Col `widthStyles` → 3/7 failed
    (size-ratio tests + flex-basis literal + gap + responsive).
    (b) Ignored `hasGap`, always plain percentage → gap-subtraction
    test failed with `calc(50% - 24px)` assertion. Restored, 7/7 pass.
  - **connector-document**: Path A strict test is self-bisecting —
    the component body throws, so any regression that causes the
    extractor to invoke it fails immediately with a real error.
    Additionally, gating Path B (`else if (false && typeof type ===
'function')`) → Path B + reactive accessor tests fail, 2/5.
    Restored, 5/5 pass.

  Also removes the three packages from `PHASE_5_PENDING_PACKAGES` in
  `scripts/check-browser-smoke.ts`. 7 packages remain pending
  (ui/{theme,components,primitives} + 4 compat layers).

- Updated dependencies [[`10a4e3b`](https://github.com/pyreon/pyreon/commit/10a4e3b53eb38b401f65f8436b94809ec4f1ee13)]:
  - @pyreon/styler@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/ui-core@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/styler@0.12.13
  - @pyreon/ui-core@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/styler@0.12.12
  - @pyreon/ui-core@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/styler@0.12.11
  - @pyreon/ui-core@0.12.11

## 0.1.2

### Patch Changes

- Fix generic type defaults in attrs and rocketstyle — use empty objects instead of Record<string, unknown> to preserve component prop types through SpreadTwo merges

- Updated dependencies []:
  - @pyreon/ui-core@0.1.2
  - @pyreon/styler@0.1.2

## 0.1.1

### Patch Changes

- [#25](https://github.com/pyreon/ui-system/pull/25) [`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Replace workspace:^ peer dependencies with explicit version ranges to prevent unresolved workspace references in published packages

- Updated dependencies [[`d1d941b`](https://github.com/pyreon/ui-system/commit/d1d941b2e676c4bec7e0d5c67dba47c222cfe756)]:
  - @pyreon/ui-core@0.1.1
  - @pyreon/styler@0.1.1

## 0.0.3

### Patch Changes

- Update pyreon framework peer dependencies to >=0.4.0 <1.0.0, fix Element Wrapper children type for multi-child JSX patterns, add publish script improvements (--no-provenance, --otp support).

- Updated dependencies []:
  - @pyreon/ui-core@0.0.3
  - @pyreon/styler@0.0.3

## 0.0.2

### Patch Changes

- [#17](https://github.com/pyreon/ui-system/pull/17) [`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial release of Pyreon UI System packages

- Updated dependencies [[`d3c1e6e`](https://github.com/pyreon/ui-system/commit/d3c1e6e64e221e01a747e24ad93f7cfc1cf3b4ef)]:
  - @pyreon/ui-core@0.0.2
  - @pyreon/styler@0.0.2
