---
'@pyreon/zero': minor
'@pyreon/server': minor
---

Server-island fragments are signed and gated as the page that declared them. Every marker the server renders now carries `data-page` and `data-sig` — an HMAC-SHA256 signature over the island name, the page's pathname, the encoded props and an expiry — and the client sends them back with the fragment request. `GET /_pyreon/fragment/<name>` verifies the signature before it decodes the props or renders anything (a missing, tampered or expired signature is a 403), runs the declaring page's route middleware, and answers `private, no-store` when that middleware ran or the request carried credentials. Previously the endpoint rendered any registered island with caller-chosen props and none of the page's route middleware.

Breaking (wire contract): an unsigned fragment request is refused. Set `PYREON_ISLAND_SECRET` (≥ 32 characters; comma-separated to rotate) or `createServer({ serverIslands: { secret } })` when more than one server instance serves the app — without it each process signs with its own random secret. Prerendered pages are signed at build time with that shared secret only (set it at build time and on the server); without it the build warns and their fragments are refused. SSR/ISR signatures last `serverIslands.maxAge` seconds (default one day); the ISR cache re-renders an entry past half that lifetime instead of serving it. A marker rendered on the client (SPA navigation) retries a 403 once with the signed marker taken from the current page's server HTML. `@pyreon/server` exports `SERVER_ISLAND_MINT` and `ServerIslandMint`; a custom handler without a mint keeps emitting unsigned markers.

Upgrade: manual — set `PYREON_ISLAND_SECRET` (≥ 32 characters) on every server instance, and at build time when prerendered pages contain server islands; a custom fragment client must send the marker's `page` and `sig` back.
