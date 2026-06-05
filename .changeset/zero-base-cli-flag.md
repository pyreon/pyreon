---
'@pyreon/zero': patch
---

fix(zero): honor `vite --base=PATH` CLI flag (was silently swallowed)

The zero Vite plugin's `config()` hook unconditionally returned
`base: config.base` (defaulting to `/`), which empirically beat
Vite's `--base` CLI flag in the merge order — every asset on a
subpath deploy 404'd.

Same bug class already fixed for `--port` via `argvHasPortFlag`.
This adds the `--base` counterpart: `argvHasBaseFlag` plus a
carve-out at the base-handling block so the plugin omits its base
return when `--base` is on argv AND user didn't explicitly set
`zero({ base })`. Also extends `configResolved` to sync
`__ZERO_BASE__` to the FINAL resolved base, so client-side router
matching picks up CLI overrides too.

Precedence is now (CLI > user vite.config > zero({base}) > '/'):
matches what the rest of the Vite ecosystem expects.

Discovered when docs-zero's preview deploy at `/pyreon/preview/`
shipped a white screen with 404s on every asset.
