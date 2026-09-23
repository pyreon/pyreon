---
'@pyreon/charts': minor
'@pyreon/mcp': patch
---

`<OptionChart>` honours ECharts' tooltip component and animation keys, and the
option contract is now measured against ECharts' own types.

**Animation.** Option charts animate as ECharts does: an entrance (1000 ms
`cubicOut`) and an update tween (300 ms `cubicInOut`), governed by the
option's `animation`, `animationDuration`, `animationEasing`,
`animationDelay`, their `…Update` twins and `animationThreshold`, on the
option or a series, with ECharts' 31-curve easing table. They used to be
pinned off, so these keys were accepted and never read. Set `animation: false`
for a static first paint. Family option charts (pie, sankey, …) keep one host
alive across updates, so an update tweens instead of remounting and replaying
the entrance. The shared canvas host gains `enterDuration`, `enterDelay`,
`updateDelay`, `enterEasing` and `updateEasing`.

**Tooltip.** The option's `tooltip` component now decides the tooltip, as in
ECharts (no component, no tooltip): `trigger` (`item` / `axis`), template and
function `formatter`s (HTML renders through an allow-list), `valueFormatter`,
`order`, every `position` form, `confine`, the look keys, `triggerOn`,
`hideDelay`, `alwaysShowContent`, `enterable`, and `tooltip.axisPointer`
(`line`, `shadow`, `cross` with axis labels). These were dropped without a
warning.

**Fixed on the way.** A redraw whose content equalled a running tween's target
cancelled the tween. Hovering an option chart dropped its brush areas,
visualMap strip, graphic elements and timeline strip from the frame.

**Measured contract.** A new test enumerates every option key the installed
ECharts types define and requires each to be read, inert, or filed as a gap
under a capability-ledger row, which is then capped at partial. Keys the
facade listed as known but never read (polar `barWidth`, graph `edgeSymbol`,
treemap `breadcrumb`, …) now warn by name instead of being silently accepted.
