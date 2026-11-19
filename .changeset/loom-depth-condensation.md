---
'@pyreon/loom': patch
---

A dependency cycle no longer inflates `depth`. Depths were relaxed through the cycle until the V−1 bound, so one three-package loop in a 14-package workspace reported depth 13 where the longest acyclic chain is about 5. Depth is now the longest path on the condensation: each cycle is collapsed to one node, and its members share one depth. `loom-report.json`'s `graph.depths` and `stats.depth` change for workspaces with a runtime cycle.
