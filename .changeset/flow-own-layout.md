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

**Performance at 1000 nodes**, after fixing three quadratic hot paths found by measurement rather than review: layered 2618ms → 10ms, force 53441ms → 450ms, stress 8312ms → 883ms. Every algorithm now completes in well under a second, locked by a test at each size.
