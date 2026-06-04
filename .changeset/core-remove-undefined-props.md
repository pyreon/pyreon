---
"@pyreon/core": minor
"@pyreon/attrs": patch
"@pyreon/rocketstyle": patch
---

feat(core): `removeUndefinedProps` — the reactive-prop-aware undefined filter moves into core, retiring two hand-rolled copies

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
