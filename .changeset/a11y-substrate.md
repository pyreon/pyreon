---
'@pyreon/a11y': minor
---

New package `@pyreon/a11y` — zero-setup accessibility primitives:

- **`announce(message, options?)`** — speak status updates and errors to
  screen readers via an `aria-live` region created lazily on first call. No
  provider, no component to mount; SSR-safe (no-op on the server). `polite`
  (default, queued) / `assertive` (interrupts) politeness, optional
  `clearAfter`, and identical consecutive messages re-announce (clear-then-set).
- **`<VisuallyHidden>`** — content invisible on screen but kept in the
  accessibility tree (unlike `display:none` / `hidden`).
- **`createA11yId(prefix?)`** — stable, SSR-safe ids for ARIA relationship
  attributes (`aria-labelledby` / `aria-describedby` / `for`).

The shared foundation other Pyreon packages build on for out-of-the-box
accessibility (router announcements, form field wiring, etc.).
