---
"@pyreon/attrs": patch
---

fix(attrs): preserve reactive-prop getter descriptors through HOC pipeline

The reactive-prop contract: `<Comp prop={signal()}>` compiles to
`h(Comp, { prop: _rp(() => signal()) })`, and `mount.ts` runs
`makeReactiveProps` to convert each `_rp`-branded function into a
property GETTER on the props object. Any HOC that VALUE-COPIES props
(`result[key] = source[key]`) fires the getter and stores the resolved
value — collapsing the live subscription to a one-shot snapshot.

PR #584 fixed this contract in `@pyreon/rocketstyle`'s
`removeUndefinedProps` + `mergeDescriptors` helpers. The
`@pyreon/attrs` copy of `removeUndefinedProps` (plus 3 spread sites in
`attrsHoc.ts`) was NEVER FIXED — and PR #793 (vitus-labs cleanup port)
rewrote it for perf while keeping the value-copy shape. Result: any
consumer using `attrs(Component)` directly (without rocketstyle
wrapping) silently lost reactivity on signal-driven typed props.

Mirror #584's pattern in `@pyreon/attrs`:
- `removeUndefinedProps` switches to `Object.getOwnPropertyDescriptors`
  + `Object.defineProperty` (preserves getter descriptors)
- New `mergeDescriptors` helper for descriptor-copy merge
- 3 spread sites in `attrsHoc.ts` switched to `mergeDescriptors`

Adds 3 regression tests under
`attrsHoc — reactive-prop descriptor preservation` that lock the
contract (bisect-verified: reverting either helper to plain value-copy
fails 2 of the 3 tests with `expected 1 to be +0` — the getter fires
once during value-copy when it should fire zero times).

The previously-shipped `@pyreon/rocketstyle` fix accidentally insulated
rocketstyle-wrapped components from this regression — which is why the
rocketstyle real-Chromium e2e test passes (rocketstyle uses its own
descriptor-correct helpers, not attrs's). Components built ON TOP of
`@pyreon/attrs` directly are the affected surface.
