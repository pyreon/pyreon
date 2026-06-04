---
"@pyreon/server": minor
"@pyreon/zero": minor
"@pyreon/compiler": patch
---

feat: islands work natively in @pyreon/zero (self-hydrating island())

Declaring an island in a `@pyreon/zero` route was broken: the build crashed
(duplicate-`@pyreon/server` singleton sentinel) and, even forced past it, the
island never hydrated (the route error boundary caught a thrown async render).
Root cause: zero's route is a **reactive child of RouterView**, so on the client
the SSR route DOM is **discarded and re-mounted** (not hydrated in place). That
defeats the islands model — an inline async `island()` render throws inside the
host mount/hydrate (no Suspense boundary), and the one-shot `hydrateIslandsAuto`
scan races the async lazy-route mount.

`island()` now **self-hydrates on the client**: it renders only the
`<pyreon-island>` marker, then `onMount` loads the chunk and mounts the
component into the marker per the `data-hydrate` strategy (load/idle/visible/
interaction/media), reusing the existing schedulers (`scheduleHydration` /
`schedulePrefetch`, now exported from `@pyreon/server/client` and dynamically
imported so they stay out of the SSR graph). The island owns its own hydration
lifecycle, so it's robust whether the host hydrates the page (a static islands
app) or re-mounts the route (`@pyreon/zero`). The server branch is unchanged
(async `loader()` → marker + content for SSR/SEO/first-paint).

`@pyreon/zero` re-exports `island` (+ `IslandOptions`/`IslandMeta`) from the
client-safe `@pyreon/server/client`, so a zero app declares islands with
`import { island } from '@pyreon/zero'` — no `@pyreon/server` dependency, just
`startClient({ routes })`, no manual `hydrateIslandsAuto`.

Verified end-to-end in real Chromium (`e2e/zero-islands.spec.ts`: a
`hydrate:'visible'` island hydrates with zero manual wiring and a click drives
its signal — no sentinel, no `reading 'ref'` crash) with the 9 islands-showcase
strategy specs (the static model) staying green.

`@pyreon/compiler`: the `dead-island` islands-audit detector
(`pyreon doctor --check-islands` / MCP `audit_islands`) no longer false-positives
on islands declared in `src/routes/**` files. fs-router routes are auto-loaded
entry points (the generated virtual route module `lazy()`-imports them), so no
hand-written source imports the file — the heuristic now skips route files.
