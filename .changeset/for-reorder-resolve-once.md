---
"@pyreon/runtime-dom": patch
---

perf(runtime-dom): mountFor reorder resolves each cache entry once (3× → 1× Map.get) + gates the prod-dead duplicate-key Set

The `<For>` keyed reorder hashed every key THREE times per update — once in
`computeForLis` (`cache.get(key).pos`), once in `applyForMoves`
(`cache.get(key)`), and once in the trailing pos-refresh loop. It now resolves
the entries ONCE into a reused buffer (`LisState.entries`) and indexes that, so a
1k-row reorder drops ~2k Map hashes per update. Separately, `collectNewKeys`'s
per-update duplicate-key `Set` is purely a DEV diagnostic on the update path (it
never skips in production — keys must match item length), so it's now gated
behind `process.env.NODE_ENV !== 'production'`: the production reorder path is a
tight key loop with zero Set allocation. (The fresh-render path keeps its
load-bearing dedup, which DOES skip duplicates to prevent DOM corruption.)

Measured (real Chromium, drift-controlled back-to-back A/B, 5000-row full-reverse
×60, dev build where only the Map-get reduction applies): median **1.40ms →
1.20ms (~14%)**, non-overlapping distributions. Production additionally removes
the per-update Set, so the production win is ≥ the measured dev win. The
synthetic 2-row-swap-in-1000 benchmark op is floor-bound (~700µs, CI95-tied with
Vanilla) and does not show this — the win scales with reorder size, so it helps
real apps that sort/reorder large lists. Zero behaviour change: 699 runtime-dom
tests pass.
