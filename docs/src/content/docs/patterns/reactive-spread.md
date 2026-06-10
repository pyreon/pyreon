---
title: 'Reactive prop forwarding via JSX spread'
summary: 'JSX spread on a component is reactivity-safe — the compiler emits _wrapSpread so getter-shaped reactive props survive the spread. For manual prop-merging helpers, copy descriptors not values.'
seeAlso: [signal-writes, controllable-state]
---

# Reactive prop forwarding via JSX spread

## The pattern

Forwarding props through a component with JSX spread is safe. The Pyreon compiler ensures reactive props survive:

```tsx
import { splitProps } from '@pyreon/core'

const Card = (props) => {
  const [own, rest] = splitProps(props, ['title'])
  return (
    <article {...rest}>
      <h2>{() => own.title}</h2>
    </article>
  )
}

// Usage — `class` is reactive, survives the spread end-to-end.
const App = () => {
  const flagged = signal(false)
  return <Card title="hi" class={() => (flagged() ? 'urgent' : '')} />
}
```

You don't need to think about which props are reactive. `<Comp {...rest}>` always preserves reactivity.

## Why

Pyreon's reactive-prop contract: `<Comp prop={signal()}>` compiles to a getter-shaped descriptor on the props object. Reading `props.prop` inside any tracking scope subscribes to the underlying signal.

esbuild's automatic JSX runtime compiles `<Comp {...source}>` to `jsx(Comp, { ...source })`. JS-level object spread fires every getter on `source` and stores resolved values — collapsing reactive props to static snapshots before `Comp` ever runs.

The Pyreon compiler intercepts this. For any **component** JSX with `{...source}`, it emits `<Comp {..._wrapSpread(source)}>`. `_wrapSpread` walks `source`'s own keys without firing getters and re-brands each getter-shaped value as an `_rp` thunk pointing back at the live source. JS spread copies the thunks (plain function values, no getters fire), then the framework's `makeReactiveProps` converts them back to getters on the consumer side — preserving the subscription end-to-end.

Fast path: when `source` has no getter descriptors, `_wrapSpread` returns the source object unchanged. Plain object literals (`{ foo: 1 }`) and any source built without `splitProps` / `mergeProps` / signal-bound props pay zero cost.

DOM-element spreads (`<div {...rest}>`) go through a different compiler path (`_applyProps`) and have always been reactivity-safe.

## Manual prop-merging helpers

If you write a helper function that copies props (not via JSX spread), copy **descriptors**, not values:

```ts
// SAFE — descriptors carry the getter through; reactivity survives
export function mergeMyProps<T extends Record<string, unknown>>(...sources: T[]): T {
  const result = {} as T
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) {
      const desc = Object.getOwnPropertyDescriptor(source, key)
      if (desc) Object.defineProperty(result, key, { ...desc, configurable: true })
    }
  }
  return result
}
```

Or just use the canonical helpers from `@pyreon/core`:

```ts
import { mergeProps, splitProps } from '@pyreon/core'

const merged = mergeProps(defaults, props)       // descriptors preserved
const [own, rest] = splitProps(props, ['title']) // descriptors preserved on both halves
```

## Anti-pattern

```ts
// BROKEN — plain value-read + value-write fires getters at HOC setup time,
// collapsing reactive props to static values before downstream JSX accessors
// can subscribe.
function copyProps(source) {
  const result = {}
  for (const key in source) {
    result[key] = source[key]  // reads source[key] — fires getter
  }
  return result
}
```

```ts
// BROKEN — same shape via Object.assign / spread in plain JS
const copy = Object.assign({}, source)  // fires getters
const copy = { ...source }              // fires getters (this is a JS-level spread, NOT JSX)
```

The JSX-level spread `<Comp {...source}>` is fine because the compiler wraps it. The JS-level spread `{ ...source }` inside a function body is NOT touched by the compiler — use `mergeProps` or copy descriptors manually.

## Related

- API: `mergeProps`, `splitProps`, `_rp` (compiler emits), `_wrapSpread` (compiler emits) — all in `@pyreon/core`
- Anti-pattern: "JSX spread on a component value-copies getter-shaped reactive props" (now handled by the compiler) and "Manual prop-pipeline wrappers value-copying getter-shaped reactive props" (the framework-internal cases)
- Reference fix: PR #584 — compiler-level fix in `@pyreon/compiler` JS + Rust backends, with framework-internal HOC fixes in `@pyreon/rocketstyle` / `@pyreon/styler` / `@pyreon/ui-core` / `@pyreon/elements`
