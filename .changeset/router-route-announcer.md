---
"@pyreon/router": minor
---

Announce route changes to screen readers (accessibility). In an SPA, navigation swaps content without a full page load, so assistive tech is never told the page changed. The root `<RouterView>` now writes the new page's name into a visually-hidden `aria-live="polite"` region on every navigation (the new `document.title`, falling back to the pathname) — the same pattern Next.js / Remix / gov.uk ship. Zero config, on by default.

Only genuine path changes announce (the initial load and same-path query/hash changes don't), and only the root view announces (nested layout views don't double-announce). Opt out with `<RouterView announceRouteChanges={false}>`. SSR-safe (no-op on the server). Layer-safe — mirrors `@pyreon/a11y`'s live-region pattern inline rather than importing it (router is a core-layer package).
