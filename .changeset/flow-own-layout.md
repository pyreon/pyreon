---
'@pyreon/flow': minor
---

Replace `elkjs` with a built-in layout engine — one fewer dependency, and the only copyleft one in the tree.

`elkjs` is a GWT-compiled port of the Eclipse Layout Kernel: ~1.4 MB of generated JavaScript under EPL-2.0, fetched at first `.layout()` call, to produce — in the end — one `{ x, y }` per node. Everything else it computed (edge sections, ports, hierarchy) was discarded by the caller.

All seven algorithms are now implemented directly: `layered` (Sugiyama — cycle breaking, longest-path layering, median-heuristic ordering with adjacent transposition), `tree`, `force` (Fruchterman–Reingold), `stress` (majorisation over BFS distances), `radial`, `box` and `rectpacking`.

The engine is **lazy-loaded**, exactly as elkjs was — an app that renders a flow but never calls `.layout()` pays nothing. What changes is the size of what gets fetched: a ~2 KB chunk instead of ~1.4 MB. `@pyreon/flow`'s main entry is unchanged.

**`computeLayout` keeps its async signature** — a caller awaiting it still works — but the engine underneath is pure and synchronous, so layouts are now **deterministic**: the same graph always produces the same positions, which elkjs did not guarantee.

**Honest quality comparison** against elkjs on five graph shapes (chain, tree, two DAGs, a cycle): zero overlapping boxes in every case, and crossings match on chains, trees and cycles. On a 20-node DAG the layered engine produces 8 crossings where ELK produces 0; on a 40-node DAG they are level (29 vs 28). Bounding-box area runs 16–65% larger. ELK's layered pipeline uses Brandes–Köpf coordinate assignment and a full layer sweep; this uses a median heuristic with transposition, so expect comparable structure and somewhat more crossings on dense graphs.
