---
'@pyreon/charts': minor
---

Funnel family: `layoutFunnel`/`renderFunnel`/`hitFunnel` (pure trapezoid geometry — descending/ascending/none sort that still names INPUT indices, per-stage taper toward the next stage, `minWidthRatio`, left/center/right alignment, entrance progress), `<FunnelChart>` (reactive canvas host with `onSelect` and the accessible table), `funnelToSvg` (server-safe), and the option facade maps `type: 'funnel'` (`sort`, `minSize`, `funnelAlign`, labels). Conformance corpus 17 → 18, floor 15 → 16.
