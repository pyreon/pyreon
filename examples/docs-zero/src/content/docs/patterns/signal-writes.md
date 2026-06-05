---
title: "Signal reads and writes"
summary: "Signals are callable. Read with mySignal(), write with mySignal.set(...), never mySignal(value)."
seeAlso: [controllable-state]
---

# Signal reads and writes

## The pattern

Pyreon signals are callable functions. The API is tiny:

```ts
import { signal } from '@pyreon/reactivity'

const count = signal(0)

count()                          // read: 0
count.set(5)                     // write: 5
count.update((n) => n + 1)       // write via function: 6
count.peek()                     // read WITHOUT subscribing (rare — loop-prevention only)
```

In JSX, bare signal references auto-call (the compiler rewrites them):

```tsx
const AutoCall = () => <div>{count}</div>               // compiled → <div>{() => count()}</div>
const AlreadyCalled = () => <div>count = {count()}</div> // already called — compiler leaves it alone
```

For reactive expressions, call the signal explicitly inside the expression:

```tsx
const HotCold = () => <div class={() => (count() > 10 ? 'hot' : 'cold')}>{count()}</div>
```

## Why

A callable signal is one identifier with two behaviours — read (no arg) or update (`.set` / `.update` / `.peek`). The alternative — `.value` getter/setter (Vue refs) — requires destructuring or property access that breaks reactivity tracking: `const { value } = mySignal` captures once. Pyreon chose callable for that reason.

## Anti-pattern

```ts
const count = signal(0)

count(5)              // DOES NOT WRITE. The argument is read and ignored.
                      // Dev mode prints a warning; production silently no-ops.

count.value = 5       // TypeError — signals have no .value property
```

```tsx
// BROKEN — destructuring loses reactivity
function Counter(props: { n: Signal<number> }) {
  const { n } = props            // captures the signal reference once, fine so far…
  const value = n()              // …but value is a plain number, not reactive
  return <div>{value}</div>      // never updates
}
```

```tsx
// BROKEN — reading inside setup captures the initial value
const Counter = (props) => {
  const initial = props.count()  // static
  return <div>{initial}</div>    // never updates
}

// FIX — read inside the reactive expression
const Counter = (props) => {
  return <div>{() => props.count()}</div>
}
```

## Related

- Detector: no static check for `signal(value)` writes — this is scope-tracked and requires type info (see future `migrate_pyreon` work)
- Dev warning: `signal.set()` must be used to write — the runtime warns in dev mode on `signal(value)` calls that look like writes
- Anti-pattern: "signal(newValue) to write" in `context` category
