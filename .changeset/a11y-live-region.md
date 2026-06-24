---
"@pyreon/a11y": minor
---

Add `<LiveRegion>` — a declarative `aria-live` region, the persistent and reactive complement to the imperative `announce()`. Place it once in your tree and drive its children with a signal; the browser announces every content change automatically (no `announce()` call, no effect to wire) — for status that lives somewhere specific in the layout: a form's validation summary, a "Saving…" → "Saved" indicator, an async result count, a connection-status banner. Screen-reader-only by default (reuses `VisuallyHidden`'s clipping); pass `visible` for status text that should also be seen. `politeness` accepts `'polite'` (default → `role="status"`), `'assertive'` (→ `role="alert"`), or `'off'` (silences without unmounting). Renders on the server too, so the region exists at hydration and the first reactive update is announced. SSR-safe.
