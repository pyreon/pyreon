---
title: "SSR-safe hooks"
summary: "Guard browser globals with typeof or bucket browser-only work into onMount."
seeAlso: [dev-warnings, event-listeners]
---

# SSR-safe hooks

## The pattern

Any hook or helper that touches `window`, `document`, `navigator`, `IntersectionObserver`, `ResizeObserver`, or `matchMedia` must run safely on the server where those globals don't exist.

Two equivalent approaches — pick per case:

### 1. Bucket browser-only work into `onMount`

Preferred when the browser API is a subscription (listener, observer, timer):

```tsx
import { onMount, signal } from '@pyreon/reactivity'

export function useWindowWidth() {
  const width = signal(0)
  onMount(() => {
    width.set(window.innerWidth)
    const onResize = () => width.set(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })
  return width
}
```

`onMount` only runs on the client, so `window` access inside is always safe. Return a cleanup function directly from `onMount` — don't pair it with a separate `onUnmount` call.

### 2. Early-return on `typeof` guard

Preferred when the helper is synchronous and returns a value:

```ts
export function getViewportSize() {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return { width: window.innerWidth, height: window.innerHeight }
}
```

The `pyreon/no-window-in-ssr` lint rule recognises `if (typeof window === 'undefined') return …` at function head as a guard for the whole body, so subsequent `window.X` reads are accepted.

## Why

Pyreon ships with SSR (`@pyreon/runtime-server`) as a first-class rendering target. Hooks that assume browser-only context will crash the SSR render and bring down the entire page.

`@pyreon/hooks` does this work once for every common case (`useEventListener`, `useElementSize`, `useIntersection`, `useMediaQuery`, `useOnline`, etc.) — reach for the hook before writing your own guard logic.

## Anti-pattern

```tsx
// BROKEN — fires at setup, crashes on SSR
export function useWindowWidth() {
  const width = signal(window.innerWidth)  // ReferenceError: window is not defined
  window.addEventListener('resize', () => width.set(window.innerWidth))
  return width
}
```

```tsx
// ALSO BROKEN — wraps the hook call, skips registration on SSR client-shell
function Component() {
  if (typeof window !== 'undefined') {
    const size = useWindowWidth()  // mount-order violation in the SSR shell
  }
  // …
}
```

Hooks are cheap on SSR — they return sensible defaults (0, null, false) so the client hydration picks up listeners after mount. Don't gate the hook call itself.

## Related

- Detector: `raw-add-event-listener` / `raw-remove-event-listener` — the MCP `validate` tool flags raw DOM-listener registrations that should use `useEventListener`
- Reference: `@pyreon/hooks` — 30+ SSR-safe hooks
- Anti-pattern: "Browser-only helpers called from event handlers without an explicit SSR guard"
