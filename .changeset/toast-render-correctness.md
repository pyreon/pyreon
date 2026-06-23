---
'@pyreon/toast': patch
---

fix(toast): toasts now actually render, update, and respond to clicks

The `<Toaster>` render layer had two correctness bugs that were invisible to the
(node-only) store tests because `toaster.tsx` was coverage-excluded with no
browser test:

- **Stale rows** — `ToastItem` read `message`/`type`/`state` statically off the
  snapshot the keyed `<For>` callback receives, so `toast.update`,
  `toast.promise` transitions, and the `entering→visible` promotion never
  reflected: toasts rendered stuck in the entering state (`opacity:0` =
  invisible) and updates never changed the text. Rows now read their live fields
  via a `_toastMap` lookup inside reactive thunks — a single update patches only
  that row in place (0 component re-renders).
- **Dead buttons** — `click` is a delegated event handled at the mount root, but
  the Toaster portals outside it, so the dismiss `×`, the action button, and
  pause-on-focus never fired. The Toaster now renders into a per-instance host
  element and scopes event delegation to it.

Adds the package's first real-Chromium browser test (8 specs) covering the
render + a11y + interaction path.
