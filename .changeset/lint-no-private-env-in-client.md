---
"@pyreon/lint": minor
---

Add the `pyreon/no-private-env-in-client` lint rule (opt-in, `@pyreon/zero`-gated).

Flags raw `process.env.X` / `import.meta.env.X` reads in client-reachable zero
code — `process.env` is `undefined` in the browser and `import.meta.env` is
bundler-specific. It steers you to `publicEnv()` from `@pyreon/zero/env` with a
`ZERO_PUBLIC_`-prefixed var (inlined into the client bundle at build, secrets
kept out by construction).

Conservative by design: `process.env.NODE_ENV` and Vite's `import.meta.env`
built-ins (`DEV`/`PROD`/`MODE`/`SSR`/`BASE_URL`) are never flagged, and
server-only files (`*.server.*`, `api/`, `entry-server`, `*.config.*`,
`scripts/`) are skipped so a legitimate server-side `process.env.SECRET` isn't
touched. Opt-in best-practice (off in `recommended`, on under `best-practices`);
surfaces in `pyreon doctor` automatically via the lint gate.
