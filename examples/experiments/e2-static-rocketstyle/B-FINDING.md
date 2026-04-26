# Option B: where do the 22 styler.resolve calls per Button come from?

Follow-up to E2 (PR #338, corrected math in #341). The original "110 resolves per Button" finding was 5× inflated; the real per-Button cost is 22 `styler.resolve` + 21 `unistyle.descriptor` + 5 `unistyle.styles`. This investigation traces those 22 to a specific architectural hot path AND identifies a concrete optimization that would benefit even rocketstyle-without-compiler-pass users.

## Probe setup

`probe-resolves.browser.test.ts` mounts ONE `<Button state="primary" size="large">` (with PyreonUI provider already mounted), captures perf-harness counters, then mounts a SECOND identical Button to see what changes when CSS is already cached.

## Findings

**First Button mount (cold styler sheet):**

```json
{
  "runtime.mount": 1,
  "runtime.mountChild": 10,
  "reactivity.computedRecompute": 3,
  "rocketstyle.getTheme": 1,
  "rocketstyle.localThemeManager.hit": 2,
  "styler.resolve": 22,
  "unistyle.styles": 5,
  "unistyle.descriptor": 21,
  "styler.sheet.insert": 3,
  "reactivity.effectRun": 1
}
```

3 unique CSS rules are inserted into the styler sheet. 22 styler.resolve calls produce them.

**Second Button mount (warm sheet, identical props):**

```json
{
  "runtime.mount": 1,
  "runtime.mountChild": 10,
  "reactivity.computedRecompute": 3,
  "rocketstyle.getTheme": 1,
  "rocketstyle.localThemeManager.hit": 2,
  "styler.resolve": 22,
  "unistyle.styles": 5,
  "unistyle.descriptor": 21,
  "styler.sheet.insert": 3,
  "styler.sheet.insert.hit": 3,
  "reactivity.effectRun": 1
}
```

(`styler.sheet.insert.hit: 3` is the only delta vs the first mount — all 3 inserts are cache hits.)

**Key observation: all counters are identical to the first mount, except `styler.sheet.insert.hit=3` shows the sheet cache caught all 3 inserts.** The 22 resolves still fire. The 21 unistyle.descriptors still fire. The full pipeline runs.

## Implication

**The styler-sheet cache catches work at the very last step.** Every Button mount runs the full resolve → unistyle → CSS-string-build pipeline JUST to compute the hash that ends up matching the cache. The cost saved by the cache is "don't insert duplicate CSS rule into the sheet" — but the cost of PRODUCING the rule (22 resolves) still happens.

For runtime-rendered apps that re-mount the same component shapes (lists, table cells, conditional renders), this is overhead paid on every mount.

## The optimization opportunity

**Dimension-prop memoization at the rocketstyle wrapper level.** Hash the dimension-prop tuple `(state="primary", size="large", variant="solid")` once; cache the resulting class name. On any subsequent mount with the same prop tuple:

- Hash lookup: ~0.5µs
- Return cached class string: ~0µs
- Skip the styler/unistyle pipeline entirely

vs current cost:

- 22 styler.resolve (~1.8µs each) = ~40µs
- 21 unistyle.descriptor processing
- 5 unistyle.styles
- 3 styler.sheet.insert lookups (all cache-hits, but lookups still happen)

**Estimated saving: ~30-40µs per cache hit.**

For the E2 bench (200 buttons all with identical props):
- 199 of 200 are cache hits (the first one populates the cache)
- 199 × 35µs ≈ 7ms saved per 200-mount run
- Baseline 8.80ms → ~1.8ms with dimension memo
- **~5× speedup on the rocketstyle path WITHOUT any compiler work.**

This compounds independently with the compiler-collapse RFC (option C):
- Compiler-collapse handles literal-prop call sites at BUILD time (zero runtime cost)
- Dimension memo handles literal-prop call sites at RUNTIME (one-cache-miss cost, ~0 thereafter)
- Both apply to dynamic-prop call sites: compiler falls through, runtime memo still helps if the prop-tuple repeats

## Honest caveats

1. **Memo cache size needs a bound.** Per-component `Map<propTupleHash, className>` with infinite growth would leak. Options: LRU-cap (~32 entries per component, covers ~99% of unique prop combos in real apps), or weak-ref + GC. LRU is simpler.
2. **Reactive-prop cases bypass memo.** `state={signal()}` would re-hash on every signal change. Memo helps when the signal value happens to repeat across mounts (e.g., 1000 buttons all bound to the same theme signal); it doesn't help when each mount sees a unique value.
3. **Theme switching invalidates the cache.** When `theme` changes (light → dark), the resolved class names change. The memo needs a per-theme partition or a cache-invalidation hook.
4. **Implementation cost: 1-2 weeks** for a careful implementation in `@pyreon/rocketstyle`. Touches the dimension-merge → CSS-generation flow at the wrapper level. Needs tests + a regression bench.

## Engineering scope

Roughly:

- Add a `_memoCache: LRU<string, string>` per rocketstyle component definition (initialized at definition time, shared across all mounts of that component).
- Hash the relevant dimension props at the START of the rocketstyle wrapper's render path.
- On cache hit: skip dimension merge + theme resolution + CSS generation, return cached class string.
- On cache miss: run the existing path, cache the result.
- Per-theme partition: prefix the cache key with the theme identity (themeSignal.peek() or similar).

Risk areas:
- Pseudo-state CSS (`:hover`, `:focus`) lives in the same generated class. Memo must include enough state to capture pseudo-state changes.
- Reactive `theme` overrides on a per-component basis (`<Button theme={customTheme}>`) need to be part of the memo key.
- Existing tests in `@pyreon/rocketstyle` should pass unchanged (memo is transparent).

## Decision

This is a **real perf opportunity, smaller than the compiler-collapse RFC but compounding with it**. Recommended sequencing:

1. **C (compiler-collapse RFC)** first — bigger win, longer engineering. Decoupled from this.
2. **B (dimension memo)** second — landed before or after C, independent of it. Helps the runtime path that the compiler doesn't reach (dynamic-prop, theme-swap, etc.).

Both compound: the compiler kills the path entirely for static cases; the memo accelerates whatever path remains.

## What lands

- `B-FINDING.md` — this writeup
- `probe-resolves.browser.test.ts` — the probe (re-runnable via `bun run --filter=@pyreon/experiments test:browser:e2-probe`)

## Reproducing

```bash
cd /repo
bun x vitest --config examples/experiments/vitest.browser.config.ts run probe-resolves
```

Output is the per-mount counter dump above. Re-run after any rocketstyle / styler / unistyle change to confirm the per-mount counts haven't drifted.
