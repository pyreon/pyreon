---
'@pyreon/styler': patch
'@pyreon/vite-plugin': patch
---

fix(styler, vite-plugin): rocketstyle-collapse resolver serializes resolve() + resets SSR buffer per render-pair

Two entangled bugs in the rocketstyle-collapse pipeline, both surfaced in the post v0.25.1 framework audit (findings #7 + #8). Bundled into one PR because the fix vector is shared.

### Bug #8 — `ssrBuffer` monotonic accumulation

`StyleSheet.ssrBuffer` is a module-level singleton (`packages/ui-system/styler/src/sheet.ts:44`). `insert()` / `insertKeyframes()` append to it during SSR; `getStyleRules()` returns the full buffer. It was reset only on `reset()` (per-request) or `clearAll()` (HMR) — **never between successive `resolve()` calls in a build**.

Result: resolving site A populated the buffer with A's rules. Resolving site B then captured `[...A's rules, ...B's rules]`. By the Nth site, the captured payload contained all 1..N sites' rules. The FNV-1a `ruleKey` became unique-per-site, defeating the cross-site `injectedBundles` runtime dedup the design relied on. Inline CSS payload grew O(N²) in collapsed site count.

### Bug #7 — Concurrent `resolve()` cross-contamination

`createCollapseResolver().resolve()` is async — awaits 4 `ssrLoadModule` + 2 `renderToString`. Vite `transform()` hooks fire in parallel across files. Two concurrent `resolve()` calls shared the SAME singleton sheet. Site A's `renderToString(light)` and site B's `renderToString(light)` interleaved → A's `getStyleRules()` captured rules from B's still-in-flight render → wrong rules cached under A's key. Persisted for the build's lifetime.

### Fix — single-flight queue + per-render-pair buffer reset

Two surgical changes:

1. **`StyleSheet.resetSSRBuffer()`** (new public method, `sheet.ts`): clears ONLY `ssrBuffer`. Leaves `cache` / `insertCache` / `domRules` / **`injectedBundles`** intact (the cross-site dedup guard MUST survive across resolves).

2. **Single-flight promise chain + reset-before-renders** (`rocketstyle-collapse.ts`): every `resolve(input)` chains onto a module-level `resolveChain = resolveChain.then(success, failure)`. The body (now extracted as `doResolve`) calls `sheet.resetSSRBuffer()` AFTER the cache-hit short-circuit and BEFORE the light/dark `renderToString` pair. The `.then(success, failure)` shape ensures a single rejected resolve doesn't poison the chain.

Combined effect: buffer is fresh per pair; concurrent calls observe the reset in strict serial order; cross-site dedup is restored. Wall-clock builds become serial in the resolver (vs the prior pseudo-parallel-but-broken behavior) — acceptable trade-off for build-time correctness; collapse is opt-in and most builds resolve only a handful of distinct sites.

### Bisect-verify

3 new specs in `packages/tools/vite-plugin/src/tests/rocketstyle-collapse.test.ts` (`audit #7+#8: resolver serialization + per-site buffer isolation` describe block):

**Spec A — sequential, isolates bug #8**: resolve 3 distinct sites sequentially. Assert each site's `.rules` array contains ONLY its own classes (no accumulated rules from prior sites). Revert ONLY the `resetSSRBuffer()` call → fails with `AssertionError: expected 0 to be greater than 0` on `expect(ruleInAnotInB.length).toBeGreaterThan(0)` — B's captured rules become a strict superset of A's (the accumulation signature).

**Spec B — concurrent, isolates bug #7**: resolve 2 sites via `Promise.all`. Assert the resulting FNV ruleKeys differ (proves no cross-contamination). Revert ONLY the chain serialization → fails with `AssertionError: expected 'ug96np' not to be 'ug96np' // Object.is equality` on `expect(a.key).not.toBe(b.key)` — concurrent renders interleave against the same singleton sheet, see the merged buffer at the same moment, produce IDENTICAL keys.

**Spec C — sheet identity proof**: 2 consecutive resolves with unique dimension tuples both produce non-empty `rules.length` AND distinct keys. Only possible if the same singleton sheet survives between resolves (proven indirectly via the behavioral chain — direct `===` check was deliberately omitted because `ssrLoadModule` returns a wrapping module namespace, not the singleton directly).

Reverting BOTH the reset + the chain fails Specs A and B simultaneously. Restoring → 3/3 audit specs + 255/255 vite-plugin + 428/428 styler + both typechecks clean.

### API contract

- `StyleSheet.resetSSRBuffer()` is a NEW public method on the styler. Internal-use (intended for the rocketstyle-collapse resolver during SSR builds). No breaking changes — it's purely additive.
- `CollapseResolver.resolve()` signature unchanged. Behavior change: calls are serialized via an internal chain. Wall-clock latency increases for parallel transforms (N sites → N × render latency), but dedup integrity is guaranteed.
- No public API surface changes for end users.
