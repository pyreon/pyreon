---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

The chart theme swapped its palette and nothing else

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
