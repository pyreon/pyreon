---
'@pyreon/flow': minor
---

Replace `elkjs` with a built-in layout engine — one fewer dependency, and the only copyleft one in the tree.

`elkjs` is a GWT-compiled port of the Eclipse Layout Kernel: ~1.4 MB of generated JavaScript under EPL-2.0, fetched at first `.layout()` call, to produce — in the end — one `{ x, y }` per node. Everything else it computed (edge sections, ports, hierarchy) was discarded by the caller.

All seven algorithms are now implemented directly: `layered` (Sugiyama — cycle breaking, longest-path layering, median-heuristic ordering with adjacent transposition), `tree`, `force` (Fruchterman–Reingold), `stress` (majorisation over BFS distances), `radial`, `box` and `rectpacking`.

The engine is **lazy-loaded**, exactly as elkjs was — an app that renders a flow but never calls `.layout()` pays nothing. What changes is the size of what gets fetched: a ~2 KB chunk instead of ~1.4 MB. `@pyreon/flow`'s main entry is unchanged.

**`computeLayout` keeps its async signature** — a caller awaiting it still works — but the engine underneath is pure and synchronous, so layouts are now **deterministic**: the same graph always produces the same positions, which elkjs did not guarantee.

**Measured against elkjs across all seven algorithms** on four graph shapes.

**Zero overlapping nodes everywhere** — a stronger guarantee than elkjs, whose stress layout leaves 22 / 6 / 29 overlapping pairs on the same graphs. Physical layouts (force, stress, radial) get a bounded overlap-relaxation pass, since optimising distance does not imply separation.

Crossings: we WIN clearly on force (0/1/8 against ELK's 34/19/135) and match on chains, trees and cycles. We LOSE on `layered` for a 20-node DAG (8 against 0), on `tree` for a 40-node DAG (56 vs 16), and on `radial` (145 vs 67). ELK's layered pipeline uses Brandes–Köpf coordinate assignment and a full layer sweep; this uses a median heuristic with transposition, so expect comparable structure and more crossings when graphs get dense.

**Performance at 1000 nodes** (median of 7 warm runs), after fixing three quadratic hot paths plus a round of allocation work — numeric grid keys instead of `\`${cx},${cy}\`` strings, no argument-list spreads, a flattened pivot-distance buffer, `sqrt` over `hypot`:

| | before | after |
|---|---|---|
| layered | 2,618ms | **5ms** |
| force | 53,441ms | **72ms** |
| stress | 8,312ms | **56ms** |
| radial | — | **5ms** |
| tree / box / rectpacking | — | **≤1ms** |

Quality is byte-identical before and after the optimisation work — same crossing counts on every graph, still zero overlaps — so the speedups are behaviour-preserving.

**Verified through the render path too**, in real Chromium: five specs mount a `<Flow>`, run each algorithm, and read `getBoundingClientRect()` from the DOM rather than the returned numbers — no visual overlap, children below parents, `RIGHT` laying out across the screen, and a tall node genuinely pushing the next layer down (proving measured boxes reach the engine). Bisect-verified: an all-zeros layout fails four of the five.
