---
'@pyreon/charts': minor
---

Two cartesian variants in the engine: `Series.effect` draws two translucent halo rings under every point (the effectScatter look, frozen at a frame and scaled with the entrance), and `Series.symbol` + `symbolRepeat` draw bars as a stretched or repeated symbol (`rect` / `circle` / `diamond` / `triangle` — the pictorialBar look, repeating along the bar's own axis and dropping a partial last unit). Exposed on the mark options (`points(y, { effect })`, `bars(y, { symbol, symbolRepeat })`) and mapped by the option facade (`type: 'effectScatter'`, `type: 'pictorialBar'` incl. `stack`/grouped; a path or image symbol falls back to a rect with a warning). The generated native chart engine carries both. Conformance corpus 30 → 31, floor 28 → 29.
