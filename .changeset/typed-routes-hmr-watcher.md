---
"@pyreon/zero": patch
---

Fix typed-routes dev regen firing on the wrong Vite hook (route add/remove was a no-op)

`zero({ typedRoutes: true })` regenerated `src/pyreon-routes.d.ts` from
`handleHotUpdate`, but Vite fires `handleHotUpdate` ONLY for content edits
(`type: "update"`), never for file add/delete — and editing a route file's body
can't change its `urlPath`. So the documented "autocomplete updates on route
add/remove during dev" silently did nothing (only the initial `buildStart` /
production build ever regenerated); adding a route left `<Link href>` without
its new path, and deleting one left a stale typed path, until a dev-server
restart.

Moved the regen to the existing `server.watcher` add/unlink handler — the exact
place route-SET changes actually land (it already invalidates the route virtual
modules there). Regression-locked (bisect-verified) by a new test that drives
the real watcher through a minimal fake dev server: an `add` event writes the
new route into the `.d.ts`, an `unlink` drops it, and it no-ops when
`typedRoutes` is off or the changed file is outside the routes dir.
