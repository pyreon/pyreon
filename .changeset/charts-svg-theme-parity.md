---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

The static SVG helpers and the canvas hosts now read the same theme

`gaugeToSvg` drew its value arc `#0f766e`, its track `rgba(132,150,165,0.22)`
and its value text `#10161d`, while `<GaugeChart>` — same props, same default
theme — drew `theme.palette[0]` (`#4f7df3`), `theme.grid` and `theme.text`.
Three of three colours differed, so the SSR/static export of a chart did not
match the chart the browser drew. `radarToSvg` had the same shape on its rings.

Fifteen of the seventeen `*ToSvg` helpers also took no `theme` at all, and
eleven families defaulted their own label / grid / axis colours to fixed
light-mode literals on BOTH paths — `#334155` labels on a dark ground is
roughly 1.4:1 contrast, i.e. invisible.

Every helper now takes `theme`, and every family that draws chrome defaults
its colours from it on both the canvas host and the SVG twin; a per-family
option still wins. Labels drawn ON a coloured block (treemap, sunburst, river,
funnel, pie) keep their fixed white — that is a legibility choice, not a theme
value. Font sizes stay per-family: colour follows the theme, layout does not.

The native emitters get the same merge, generalised from `palette` alone to
the named theme fields, so a Compose/SwiftUI chart follows the system colour
scheme where it previously did not.

Graph and tree edges are themed too, and that one is a contrast bug rather than
a parity bug: `linkColor` defaulted to a hardcoded `#94a3b8` that no host ever
overrode, so both paths agreed and both were wrong on light. It reads 6.93:1 on
the dark ground and **2.56:1 on white** — under WCAG 1.4.11's 3:1 for non-text
contrast, on the DEFAULT theme. The value was clearly chosen for dark: it is
dark's own `label` (`#9aa5b5`) to within (6, 2, -3). So it now reads `label`,
dark is visually unchanged, and only light actually moves. A graph without
visible edges is a scatter plot, so this is the family's meaning, not its
chrome — which is also why it reads `label` (5.50:1 / 7.12:1) rather than
`axis`, whose 3.05:1 / 3.14:1 clears the bar only barely.
