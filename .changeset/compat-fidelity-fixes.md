---
'@pyreon/solid-compat': minor
'@pyreon/vue-compat': minor
---

compat: close the cleanly-fixable fidelity gaps (#619 follow-up)

The partial-fidelity shims from #619 that COULD be faithfully implemented
are now real (the rest stay honestly documented as architectural limits):

- **solid-compat `Portal`**: `useShadow` → dedicated `<div>` host + open
  shadow root; `isSVG` → SVG-namespaced `<g>` host; children render into
  the host; host removed on unmount via `onCleanup` (no detached-host
  leak). No `@pyreon/core` change.
- **vue-compat `useAttrs()` / `getCurrentInstance().attrs`**: now compute
  the Vue declared-vs-fallthrough split when `defineComponent({ props })`
  is used; full props object only when no props were declared.
- **vue-compat `getCurrentInstance().emit`**: now provided — invokes the
  matching `on{Event}` prop handler.

Backward-compatible. Verified: unit 804 → 811, solid browser 2 → 4,
e2e compat-layers 12/12, typecheck clean.
