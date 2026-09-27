---
title: "Event listeners"
summary: "Use useEventListener from @pyreon/hooks — never raw addEventListener in component bodies."
seeAlso: [ssr-safe-hooks]
---

# Event listeners

## The pattern

Register DOM event listeners via `useEventListener` from `@pyreon/hooks`. It handles cleanup on unmount and SSR safety:

```tsx
// @check
import { useEventListener } from '@pyreon/hooks'

declare function closeModal(): void

function KeyboardShortcuts() {
  useEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })

  return null
}
```

:::warning{title="The signature is event-first — `(event, handler, options?, target?)`"}
`useEventListener(window, 'keydown', handler)` (target first) is a common but **wrong** call — it silently fails to compile against the real overload. The target is the OPTIONAL FOURTH argument, defaulting to `window`:

```tsx
useEventListener('click', onDocClick, {}, () => document)
```

The `target` getter is resolved **once at setup**, not reactively — it does not re-bind if the value it returns later changes. If you pass `() => buttonEl` and `buttonEl` is still `null` at setup time (the common ref-callback race), the listener silently falls back to `window` instead of erroring. Attach to a stable target, or read a ref that is guaranteed populated by the time `useEventListener` runs.
:::

Targets can be:

- `window` (default — omit the 4th argument) — page-level keybinds, resize/scroll, online/offline
- `() => document` — delegation, focus management
- `() => el` — a specific element, where `el` is already populated by setup time

## Why

Raw `addEventListener` in a component body has three failure modes:

1. **No cleanup** — the listener leaks on unmount, fires after the component is gone.
2. **SSR crash** — `window` is undefined on the server; the component render fails the whole page.
3. **Stale closures** — the handler captures signal values at setup time, not at call time, unless you read inside the handler body.

`useEventListener` solves all three at once. Don't reach for the raw API inside component code.

## Anti-pattern

```tsx
// BROKEN — leaks on unmount, crashes on SSR
function KeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })
  return null
}
```

```tsx
// LESS BROKEN — has cleanup, but duplicates what useEventListener does
function KeyboardShortcuts() {
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  return null
}
```

The `onMount` version is technically correct. It just reimplements what `useEventListener` does in 3 lines. Reach for the hook first.

## Exceptions

Framework-host chains like `view.dom.ownerDocument.addEventListener(...)` in CodeMirror plugins are intentional and safe — the host view's own document is accessed through a scoped path, not through a bare `document` global. The `raw-add-event-listener` detector recognises these cases and does not flag them.

## Related

- Detector: `raw-add-event-listener` / `raw-remove-event-listener` — the MCP `validate` tool flags raw listener registrations
- Reference API: `useEventListener` in `@pyreon/hooks` — see `get_api({ package: "hooks", symbol: "useEventListener" })`
- Anti-pattern: "Raw addEventListener / removeEventListener in component or hook bodies"
