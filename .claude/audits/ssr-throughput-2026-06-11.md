# SSR throughput audit — renderToString profiling campaign (2026-06-11)

Follow-up to the create-path audit: SSR was one of the never-profiled dimensions.
Harness: `packages/core/runtime-server/scripts/bench-ssr.ts` — three real-app-shaped
workloads (blog-index: 50-card page w/ nested components; table-1k: 1,000-row keyed
For; deep-tree: 10-deep component chains ×100), 30 batches, NODE_ENV=production,
`bun --cpu-prof` for attribution.

## Profile (non-GC self-time)

| hot spot | share | fix |
|---|---|---|
| escapeHtml + its regex | ~19% | charCode scan w/ lazy slicing on the dirty path (callback-replace paid fn-call+map-lookup per match) |
| renderElement + renderChildList | ~30% | the structural loop — left alone (string-rope accumulation is already right; see string-concat-not-quadratic) |
| safeKeyForMarker + encodeURIComponent | ~7% | fast paths: numeric keys verbatim (Number.toString can never form `--`), `[\w.:]` strings verbatim (no dash → comment-safe, no `%` → decode-roundtrip-safe); dash-bearing keys keep full encoding (bisect-locked security spec) |
| isVoidElement | ~4% | per-element `tag.toLowerCase()` ALLOCATION removed — direct Set probe for lowercase tags, fallback only for mixed-case |
| toAttrName + renderProp chain | ~7% | memo of resolved+pre-escaped attr names (keys are code-shaped; bounded 1k — leak-class C); on[A-Z] regex → charCode probe |
| h() + runWithHooks + makeReactiveProps | ~12% | core per-component cost — not touched (cross-package, separate campaign if ever) |

## Measured (interleaved A/B/A/B, output byte-identical)

| workload | A1 | B1 | A2 | B2 | effect |
|---|---|---|---|---|---|
| blog-index | 67µs | 60 | 64 | 58 | **−10%** replicated |
| table-1k | 368µs | 329 | 365 | 315 | **−13%** replicated |
| deep-tree | 112µs | 110 | 112 | 113 | ~0 (component-dominated, expected) |

## Not pursued (with reasons)

- The renderChildList/renderElement loop itself: string `+=` is rope-optimized
  (measured 2× faster than array-join in prior work); restructuring risks the
  async-continuation contract for <1ms-class wins.
- Per-component cost (runWithHooks/mergeChildrenIntoProps): deep-tree shows it's
  ~40% of component-heavy pages, but it's @pyreon/core surface shared with CSR —
  a rewrite there needs its own campaign with CSR pairing.
- AsyncLocalStorage (getStore ~2%): structural for request isolation.
