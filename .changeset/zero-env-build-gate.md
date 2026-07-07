---
"@pyreon/zero": minor
---

Add a `zero({ env })` build-time gate for public env vars.

Declare your public (`ZERO_PUBLIC_*`) env schema in the plugin config and the
**build fails** when a declared var is missing or invalid — so you catch "forgot
to set `ZERO_PUBLIC_API_URL`" before it ships to the browser as `undefined`. In
dev it warns instead (an incomplete local `.env` doesn't block iteration).

```ts
zero({ env: { API_URL: url(), ANALYTICS_ID: String } })
```

Keys are un-prefixed (matching `publicEnv()`); values are any env schema entry
(a default, `String`/`Number`/`Boolean`, `url()`/`oneOf()`, or a Standard
Schema). This is the safety net for the "works in dev, undefined in prod" trap.
