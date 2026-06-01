---
"@pyreon/rocketstyle": patch
"@pyreon/styler": patch
---

fix(rocketstyle, styler): reactive props on chained rocketstyle components

A downstream consumer reported reactive props on rocketstyle-wrapped
components (`<Button href={signal() ? a : b}>`) stayed static through the
chained HOC pipeline (`.config()` / `.attrs()` / `.theme()` / `.states()`
/ `.sizes()` / `.compose()`). Investigation found TWO distinct value-copy
sites that the PR #584 reactive-prop sweep missed:

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
