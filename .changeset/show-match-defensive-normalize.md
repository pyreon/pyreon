---
"@pyreon/core": minor
---

`Show` and `Match` now accept either an accessor or a value for the `when` prop. Previously, `<Show when={signal}>` (bare signal reference) compiled to `<Show when={signal()}>` via the compiler's signal auto-call, which passed a boolean — and `Show` then crashed with `TypeError: props.when is not a function`. The fix adds defensive normalization (`typeof === 'function'` check), so both shapes work. Reactive cases still need the accessor form (`when={() => signal()}`) for true re-evaluation on signal change; the value form covers static booleans and the auto-call edge case. The `ShowProps['when']` type widens from `() => unknown` to `unknown | (() => unknown)`.
