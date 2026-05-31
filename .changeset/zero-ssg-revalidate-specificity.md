---
'@pyreon/zero': patch
---

`buildRevalidateManifest` resolves each concrete path to its most-specific route (PR-S11)

Pre-fix `buildRevalidateManifest` iterated routes outer × paths inner, setting `manifest[concretePath] = value` on every match. If two routes matched the same concrete path (a static route AND a catch-all), whichever route iterated LAST won — silently wrong because the static route is structurally more specific and should claim the path.

**Real-world hazard**: a route tree with `/blog/special/static.tsx` (static, no revalidate export) alongside `/blog/[...slug].tsx` (catch-all, `revalidate = 3600`) would map `/blog/special/static` to `3600` in the revalidate manifest — even though the static route owns that path at runtime. The adapter (Vercel / Cloudflare / Netlify ISR) would then attempt to revalidate the path via the catch-all's TTL, but the runtime router serves the static page instead. Result: stale-vs-fresh confusion, or the adapter ignores the revalidation entirely.

**The fix**: invert the loop direction. For each concrete path, find ALL matching candidate routes, sort by specificity (more static segments wins, more total segments breaks ties), pick the top one, and ONLY emit its `revalidateLiteral` (if any) into the manifest. If the most-specific match has no revalidate export, the path is OMITTED from the manifest — the catch-all's TTL doesn't claim a path it doesn't structurally own.

Candidate matchers + specificities are precomputed once per `buildRevalidateManifest` call (linear in route count). Per-path resolution is `O(routes)` worst case but with cheap predicate-and-arithmetic ops. For typical SSG sites with ~50 routes and ~1000 written paths, this is microseconds total.

**Regression coverage**: 4 new tests in `ssg-plugin.test.ts` under the `buildRevalidateManifest (PR I)` describe block (static-wins-over-catchall, static-revalidate-wins-over-catchall-revalidate, dynamic-vs-catchall-tiebreaker, declaration-order-independence). Bisect-verified: reverting `ssg-plugin.ts` fails 3 of 4 with documented assertions; the 4th is a sanity test that passes either way (no overlapping paths). Restored → 115 ssg-plugin tests + 1026 zero tests pass.

**No public API change**: function signature unchanged; the manifest shape (`Record<string, number | false>`) is byte-identical. The observable change is the per-path resolution semantics — apps relying on the (wrong) last-route-wins behavior would notice, but that behavior was never documented or expected.
