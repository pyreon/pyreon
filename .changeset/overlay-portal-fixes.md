---
'@pyreon/elements': patch
'@pyreon/runtime-dom': patch
---

fix: overlay content now positions on open + Portal wires its own event delegation

Two long-standing bugs reported by a downstream consumer, both verified and fixed at the root:

**`useOverlay` never positioned content on open.** `setContentPosition()` was only reachable through the throttled window resize/scroll handlers — nothing ran it when the content actually mounted, so every dropdown/tooltip/popover portaled to `document.body` rendered at the page's flow position (bottom-left) until a scroll or resize. The hook now subscribes to `active` + `isContentLoaded` in `setupListeners()` and repositions one animation frame after open (re-checked against a racing close). `setContentPosition` is also exposed from the hook for content whose size changes while open (async option lists).

**`useOverlay` auto-attaches its listeners.** `setupListeners()` previously returned un-attached and only the built-in Overlay component remembered to call it — raw `useOverlay` consumers shipped dead triggers. The hook now auto-attaches via `onMount`; `setupListeners` stays exported for manual control and is idempotent (a second call returns the first call's cached cleanup; cleanup resets so KeepAlive re-mounts re-attach). A dev warning fires if `showContent()` runs with listeners never attached (outside-setup usage that skipped manual wiring).

**`<Portal>` wires its own event delegation.** Pyreon delegates bubbling events at the app's mount container; portal content lives outside it, so every delegated handler (`onClick` etc.) inside any Portal was silently dead unless the app manually delegated the target. The Portal mount branch now calls `setupDelegation(target)` itself. Safe when the target is an ancestor of the app root (`document.body`): the per-dispatch invoked-set dedupes, so app handlers don't double-fire — both directions locked by real-Chromium tests. Downstream workarounds (synthetic-resize dispatch, manual `setupDelegation(document.body)`) can be removed.
