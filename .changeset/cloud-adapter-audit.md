---
'@pyreon/zero': patch
---

Cloud adapter audit pass — fix swallow-error in Cloudflare + Netlify emitted servers, hoist per-request dynamic import in Vercel, remove dead code in Cloudflare worker.

Follow-up to the bun (#752) and node (#753) adapter audits, which each found 1-2 real bugs in their emitted server harnesses under runtime-contract gates. The cloud adapter family (vercel/cloudflare/netlify) doesn't have runtime-contract gates yet (each needs its own CLI emulator install — wrangler dev / vercel dev / netlify dev, ~150 MB each), but a static audit pass surfaces four concrete production bugs that don't need runtime emulation to diagnose:

**Cloudflare** (`packages/zero/zero/src/adapters/cloudflare.ts`)
- **Silent catch**: the emitted `_worker.js` had `try { ... } catch (err) { return new Response("Internal Server Error", { status: 500 }) }` with NO `console.error(err)`. Production crashes shipped a bare 500 to clients AND ZERO diagnostic info to Cloudflare Tail logs (the standard Workers debugging surface). Now logs `[Pyreon SSR] handler failed:` + the full error.
- **Dead code**: the emitted worker computed `const ext = url.pathname.split(".").pop()` then ran an `if (ext && ...) { /* comment */ }` block with an **empty body** — pure dead code that did nothing at runtime, just consumed cold-start budget per request. Removed.

**Netlify** (`packages/zero/zero/src/adapters/netlify.ts`)
- **Silent catch**: same shape as Cloudflare — `catch (err) { return 500 }` with no log. Now logs to Netlify Function logs panel (also reachable via `netlify functions:log`).

**Vercel** (`packages/zero/zero/src/adapters/vercel.ts`)
- **Per-request dynamic import**: the emitted function called `(await import("./entry-server.js")).default` inside the handler — Node's module cache makes subsequent calls near-free, but the FIRST request on every fresh serverless instance (i.e. every cold start) paid the full module evaluation cost inside the request budget, observable as a TTFB spike on cold starts. Now hoisted to module scope (`import handler from "./entry-server.js"` at the top), evaluated once at function-init before the first request.
- **No error logging**: pre-fix the handler had NO try/catch — SSR throws propagated to Vercel's launcher which logged them generically. Now wrapped with the same `[Pyreon SSR] handler failed:` prefix so the cause is trivially greppable in the dashboard log stream.

Shape assertions added to the existing `vercel/cloudflare/netlify adapter build` tests:
- Cloudflare: asserts `console.error([Pyreon SSR]` present, asserts the dead `ext` computation is absent.
- Netlify: asserts `console.error([Pyreon SSR]` present.
- Vercel: asserts `import handler from "./entry-server.js"` is hoisted at module-scope, asserts `await import("./entry-server.js")` is absent, asserts `console.error([Pyreon SSR]` present.

**Bisect-verified per fix**: reverting just one adapter's source (TEMP BISECT) fails ONLY that adapter's test; the other two stay green. All three restores → 957/957 zero tests pass. No `TEMP BISECT` remnants. Lint + typecheck clean. No lockfile drift.

Out of scope (follow-up PRs): full runtime-contract gates via `wrangler pages dev` / `vercel dev` / `netlify dev` — each adds a ~150 MB CLI install to CI and likely surfaces additional bugs. The shape-level audit pass here is the cheap first cut.
