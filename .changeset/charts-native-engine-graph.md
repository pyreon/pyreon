---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Graph geometry joins the generated native chart engine. `layoutGraph` / `renderGraph` are rewritten in the PMTC subset and bundled into `PyreonChartEngine.swift` / `.kt`. The force layout's PRNG is now a Park–Miller LCG in exact Double arithmetic (`graphNextSeed`, exported) instead of mulberry32 — still deterministic per `seed`, but a given seed produces a DIFFERENT arrangement than before. The engine answers hits as an INDEX (`hitGraphIndex`, -1 for none); the web-facing nullable `hitGraph` lives in `graph-hit.ts` and `graphToSvg` moves to `family-svg.ts` (`@pyreon/charts/plot` re-exports are unchanged). `renderGraph` no longer takes a measurer.
