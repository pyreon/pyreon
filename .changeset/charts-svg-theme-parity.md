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

**The theme gains semantic and ramp slots, because `linkColor` was not the
whole class.** A sweep of every `options?.X ?? '<literal>'` colour default in
the engine, cross-checked against what the hosts actually feed, found seven
that no host feeds at all — so the constant always shipped:

| | on `#ffffff` | on `#141821` |
| --- | ---: | ---: |
| `calendar.emptyColor` / `geo.emptyColor` `#e2e8f0` | 1.23:1 | **14.41:1** |
| `candlestick.downColor` / `parallel.highlightColor` `#b42318` | 6.57:1 | **2.70:1** |
| `candlestick.upColor` `#15803d` | 5.02:1 | 3.54:1 |
| `gantt.todayColor` `#dc2626` | 4.83:1 | 3.68:1 |

Plus `HEAT_RAMP`, a module constant shared by heatmap, calendar and geo.

Measured on a real dark render, this is worse than low contrast — the chart
**inverts**. A dark calendar drew 40 empty cells at 14.41:1 and its
highest-value cell at 2.04:1, because a light→dark blue ramp loses contrast as
the value rises on a dark ground. Absence of data was the loudest mark on it.

So `ChartTheme` gains `positive`, `negative`, `muted` and `ramp`, both themes
get values, and the host sites feed them. `muted` cannot be one value for both
grounds: its job is to recede into `background`, which is definitionally
theme-relative.

Light is deliberately unchanged, with **one** exception worth naming rather
than burying. The new light values ARE the old constants, so no draw-list
golden moves — except gantt's today rule, which was `#dc2626` and is now
`negative` (`#b42318`, the down-candle red). Two near-identical reds collapsing
into one semantic token is the point of having the token, and the survivor is
the better of the two on white (6.57:1 vs 4.83:1); but it IS a visible change
on the light theme, and no golden renders a today rule, so nothing would have
told you.

Two native bugs fell out, both found by reading the emit rather than trusting a
green suite. `chartThemeFields`' list branch read `palette` unconditionally —
right while palette was the only list field, so a native calendar emitted the
ten-hue categorical palette as its four-stop value ramp. And its override loop
`continue`d on every list field, so `theme={{ ramp: [...] }}` was dropped in
silence; a literal now lowers and a non-literal warns by name.

The locks are invariants rather than values: a ramp must RISE in contrast
against its own ground (the shipped one fell, 16.32:1 → 2.04:1), `positive` and
`negative` must clear 3:1 there, and `muted` must stay under 1.5:1 while
remaining tellable from the ramp's floor. That last one failed on the first
draft of the dark values — `muted` and `ramp[0]` were 1.03:1 apart, so "no
data" and "zero" were indistinguishable — which is the test catching the
values, not the values passing the test.

The heatmap needed its own fix, because a FRAME host does not take its ramp
through `themeDefaults` — the emitters build that argument themselves, and both
hardwired `HEAT_RAMP_DEFAULT` there. So the inversion was still live on device
after the web half was fixed. Both now emit `pyreonTheme.ramp`, reading the
theme the emit already resolved one line above, which picks up a `theme` prop,
a `<ChartThemeProvider>` scope and the device's colour scheme at once. An
explicit `colors` prop still wins.

