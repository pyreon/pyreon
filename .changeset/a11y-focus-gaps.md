---
'@pyreon/hooks': minor
'@pyreon/a11y': patch
---

Focus-management hardening (audited a11y gaps):

- **`useFocusTrap` upgraded to focus-scope quality.** Concurrent traps now form a scope STACK — one shared pair of document listeners, only the most recently activated trap whose container exists handles events, and deactivating/unmounting it reactivates the trap beneath (stacked modals no longer fight over the same Tab event). NEW focusin containment: a programmatic `.focus()` or mouse click that lands focus outside the container is recaptured back in (Tab-only trapping missed those escapes); the recapture is microtask-deferred and re-checked so a close flow that restores focus + unmounts in the same flush is never fought. `initialFocus: true` now prefers a `[data-autofocus]` descendant over the first tabbable. Existing call shapes (`useFocusTrap(getEl)`, positional `active`, options object) are unchanged.
- **New `useInertOthers(getEl, options?)` hook** — applies the native `inert` attribute to every sibling subtree outside the given element (walking up to `document.body`), making `aria-modal="true"` actually true for sighted keyboard users AND assistive tech. Exact-restore on cleanup (elements that were already `inert` stay inert), per-element refcount so stacked overlays never un-inert what an outer overlay still needs, live regions (`[aria-live]`) skipped so announcements keep working, reactive application via a signal-backed getter.
- `@pyreon/ui-primitives` `ModalBase` (private) now wires `useInertOthers` behind its open lifecycle and arms its focus trap in OPEN order.
- `@pyreon/a11y` README: documents the shipped `<LiveRegion>` + `<SkipLink>` (previously absent) and the `<RouteAnnouncer>` ↔ `RouterView announceRouteChanges` double-announcement overlap.
