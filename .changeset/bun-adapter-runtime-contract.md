---
'@pyreon/zero': patch
---

`bunAdapter` — fix `Bun.resolveSync` crash on SSR routes + add runtime-contract gate.

The emitted Bun.serve harness used `Bun.resolveSync(filePath, ".")` for its static-file / path-traversal check. `Bun.resolveSync` is MODULE resolution (looks for a JS module on disk), not path normalization — it throws `ENOENT` on any non-existent file. So **every GET request whose URL didn't match a literal static file** (i.e. every SSR route) crashed inside the static-file branch with `Cannot find module '<clientDir>/<route>' from '.'` and returned 500 instead of reaching the SSR handler.

The harness now decodes the URL once, normalizes the path via `node:path.normalize`, asserts the candidate stays within `clientDir`, then checks `Bun.file(candidate).exists()`. Same security guarantees (path traversal rejected, null bytes rejected, malformed percent-encoding rejected with 400), but `normalize` is pure string arithmetic — never throws on missing files. SSR routes now correctly fall through to the handler.

**New gate**: `bun adapter — runtime contract` describe block in `packages/zero/zero/src/tests/adapters.test.ts` spawns `bun run dist/index.ts` as a subprocess against the mock build fixture and drives real HTTP requests against the emitted server:

1. SSR fallback: `GET /api/anything` → handler response (`"ok"`).
2. Static file: `GET /` → mock `index.html` with `cache-control` header.

Skipped when `bun` isn't in PATH (vitest can run under Node too); auto-detected at test time. Each spec takes ~60ms (bun spawn is fast).

**Bisect-verified**: reverting the adapter fix to the `Bun.resolveSync` shape → both runtime-contract tests FAIL with `expected 500 to be 200` (the SSR route and the static `/` route BOTH crash with `Cannot find module`); restored → both pass × 5 stability runs. Full zero suite 957/957 (1 skipped pre-existing). Lint + typecheck clean.

Path-traversal-specific test was deliberately NOT added: both `Bun.serve`'s HTTP parser AND the URL spec's mandatory `new Request(url)` normalization collapse `..` segments BEFORE the bytes reach the fetch handler (empirically verified — `GET /../../etc/passwd` arrives as `/etc/passwd` no matter whether the client is fetch, undici, curl, or a raw `node:net` socket). The traversal check in the harness is still useful defense-in-depth for non-Bun.serve consumers (e.g. embedding the entry into Deno / edge runtimes that don't normalize), but it can't be exercised through a spec-compliant HTTP path; the SSR-fallback test proves the load-bearing fix.

First adapter to gain a runtime-contract gate. Cloudflare / Vercel / Netlify gates need their respective CLI emulators (`wrangler dev` / `vercel dev` / `netlify dev`) which add ~150MB install each — they're separate follow-up PRs.
