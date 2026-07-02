---
'@pyreon/zero': minor
---

Render-mode DX, Tier 2 — kill the remaining silent failures:

- **Computed `renderMode` warning** — a non-literal `export const renderMode` still works at runtime (namespace-import fallback) but defeats inlining and is invisible to the build mode table / dev banner / SSG completeness checks; the build now says so once per file.
- **Pasteable fix lines in mode errors** — the `mode: 'ssg'|'spa'` × server-route build error now carries a per-route `→ change to \`export const renderMode = '…'\`` line.
- **`ssg.paths` precedence surfaced** — explicit paths REPLACE auto-detection (now documented on the option); when route-level `getStaticPaths` exports would be silently ignored, the build warns and names them.
- **`revalidate` layers documented** — route `export const revalidate` (build-time platform manifest) vs `isr.revalidate` (runtime SWR TTL) cross-referenced in both JSDoc sites.
- **ISR: `cacheKey: 'path-only'` shorthand** — keys by pathname, stripping analytics params; deliberately does NOT relax the `Vary: Cookie` auth-refusal. Suppresses the default-key dev warning (it's an explicit choice).
- **ISR: `expireOnTimeout`** — opt-in: a timed-out background revalidation drops the stale entry so the next request renders fresh instead of serving stale forever.
- **`ssg.format: 'both'` auto-canonical** — the duplicate-URL pair now carries a root-relative `<link rel="canonical">` to the clean URL in both copies (skipped when the page already has one, and for meta-refresh redirect stubs).
