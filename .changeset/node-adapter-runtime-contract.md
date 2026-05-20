---
'@pyreon/zero': patch
---

`nodeAdapter` — fix two production bugs in the emitted server + add runtime-contract gate.

The bun adapter PR (#752) added the first adapter runtime-contract gate and found a real bug under it. Repeating the audit on the node adapter (the gap's most-similar sibling) surfaced **two more concrete bugs** in the emitted server harness:

**Bug A — `GET /` falls through to SSR instead of serving the static `index.html`.** The harness mapped `/` → `clientDir/index.html` in its filePath builder but the next gate `if (ext && ext !== ".html")` excluded `.html` files from the static branch — so the root index was never served and every request for `/` ran through the SSR handler. For static-export-first deploys where `index.html` is an SPA shell, this broke the canonical pattern entirely (and disagreed with the bun adapter's behaviour, which DID serve `/` as static). Fix: drop the `.html` exclusion. `if (ext)` now serves any extension; SSR routes still have no extension and correctly fall through.

**Bug B — `mode: 'stream'` SSR was silently buffered into a single chunk.** The harness called `await response.text()` to drain the entire Response body into a string BEFORE writing to the client socket. For Suspense streaming this defeats the whole point — every chunk queued server-side and arrived at the client all at once at the end (strictly worse than `mode: 'string'` because the buffering happens twice). Fix: pipe the Response body's `ReadableStream` reader directly to `res.write` chunk-by-chunk. For `mode: 'string'` the body is a single chunk and the loop runs once with identical observable behaviour. For `mode: 'stream'` chunks land at the client incrementally.

**New gate**: `node adapter — runtime contract` describe block in `packages/zero/zero/src/tests/adapters.test.ts` adds 5 specs:

1. SSR fallback for non-static paths.
2. Static `.js` file served with `immutable` cache-control.
3. **`GET /` serves the static `index.html`** (Bug A regression lock).
4. **Streamed SSR chunks arrive incrementally** (Bug B regression lock — the 3-chunk × 150ms-spaced mock produces a >100ms gap between first and last chunk arrival; pre-fix the gap was ~0).
5. SSR response status + headers correctly forwarded.

**Bisect-verified per fix**:
- Revert just Bug A's `.html` exclusion → spec #3 fails with `expected received string to contain "STATIC INDEX HTML"`; other 4 pass. Restored → all 5 pass.
- Revert just Bug B's pipe → spec #4 fails with `Node server failed to start within 10000ms` (the buffered server can't respond to the 200ms readiness ping during the 300ms streaming delay — a great demonstration of Bug B's real impact); other 4 pass. Restored → all 5 pass.
- Both restored together: 5/5 pass × 5 stability runs, full zero suite 962/962 (1 skipped pre-existing). Lint + typecheck clean. No lockfile drift.

Second adapter to gain a runtime-contract gate (after bun, #752). Same proven shape — spawn the emitted entry as a subprocess, drive real HTTP requests, assert on responses. Each spec ~60-370ms (300ms for the streaming spec, 60ms for the others). The four-spec pattern (SSR fallback / static asset / root index / response forwarding) generalises to the remaining cloud adapters (Cloudflare via `wrangler dev`, Vercel via `vercel dev`, Netlify via `netlify dev`) — separate follow-up PRs since each needs its own ~150 MB CLI install.

Path-traversal-specific test deliberately omitted — same rationale as the bun PR (both `node:http`'s parser and the URL spec's `new Request(url)` normalization collapse `..` segments BEFORE the bytes reach the handler; the in-harness check is defense-in-depth that can't be exercised through a spec-compliant HTTP path).
