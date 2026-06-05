---
title: "Reactive context"
summary: "Use createReactiveContext for live values; never destructure context return."
seeAlso: [signal-writes]
---

# Reactive context

## The pattern

Two context kinds in `@pyreon/core`, pick by whether the value changes over time:

### Static context — `createContext`

For values that don't change after mount (config, service references, theme tokens frozen at startup):

```ts
import { createContext, useContext, provide } from '@pyreon/core'

const ConfigCtx = createContext<{ apiUrl: string }>({ apiUrl: '' })

// Provider
provide(ConfigCtx, { apiUrl: '/api' })

// Consumer
const { apiUrl } = useContext(ConfigCtx)    // destructure is fine — value is static
```

### Reactive context — `createReactiveContext`

For values that update over time (theme mode, locale, user session):

```ts
import { createReactiveContext, useContext, provide } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

const ModeCtx = createReactiveContext<'light' | 'dark'>('light')

// Provider — pass a getter so the consumer sees live updates
const mode = signal<'light' | 'dark'>('light')
provide(ModeCtx, () => mode())

// Consumer — useContext returns () => T
function ThemedPanel() {
  const getMode = useContext(ModeCtx)
  // Inside reactive scopes (JSX expressions, effects, computeds):
  return <div class={() => (getMode() === 'dark' ? 'dark-theme' : 'light-theme')}>...</div>
}
```

## Why

Pyreon components run once — so if a context value changes over time, the consumer needs a way to subscribe. `createReactiveContext` solves this by returning a **function accessor** from `useContext`: calling it subscribes like a signal read.

If you use plain `createContext` for a live value, consumers capture the snapshot at mount and never see updates. The compiler can't rewrite the read because the type doesn't signal "this is reactive".

## Anti-pattern

```tsx
// BROKEN — destructures the accessor at setup, loses reactivity
const ModeCtx = createReactiveContext('light')
provide(ModeCtx, () => mode())

function Consumer() {
  const { mode: currentMode } = useContext(ModeCtx)   // typeof is `() => T`, destructure fails
  // Even if destructure worked, currentMode would be a static copy.
}
```

```tsx
// BROKEN — passes a plain value to a reactive context
const mode = signal('light')
provide(ModeCtx, mode())    // reads ONCE at provide time
// All consumers see 'light' forever, even when mode changes to 'dark'
```

```tsx
// FIX — pass a getter function
provide(ModeCtx, () => mode())
```

## Related

- Reference API: `createContext`, `createReactiveContext`, `useContext`, `provide` — see `get_api({ package: "core", symbol: "..." })`
- Anti-pattern: "Destructuring context values" and "Static provide for dynamic values" in `context` category
