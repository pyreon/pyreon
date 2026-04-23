---
title: Event listeners
summary: Use useEventListener from @pyreon/hooks — never raw addEventListener in component bodies.
seeAlso: [ssr-safe-hooks]
---

# Event listeners

## The pattern

Register DOM event listeners via `useEventListener` from `@pyreon/hooks`. It handles cleanup on unmount, SSR safety, and listener re-binding when the target changes:

```tsx
import { useEventListener } from '@pyreon/hooks'

function KeyboardShortcuts() {
  useEventListener(window, 'keydown', (e) => {
    if (e.key === 'Escape') closeModal()
  })

  return null
}
```

Targets can be:

- `window` — page-level keybinds, resize/scroll, online/offline
- `document` — delegation, focus management
- An element signal / ref — `useEventListener(() => buttonEl, 'click', handler)`
- A ref callback — wire via `ref={(el) => buttonEl = el}` then pass `() => buttonEl`

The listener runs on mount, is removed on unmount, and is rebound if the target signal changes.

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
