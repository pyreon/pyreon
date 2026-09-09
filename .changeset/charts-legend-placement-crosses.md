---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Legend PLACEMENT crosses to native — `legendPosition` lowers, and an 8px divergence closes

`chrome.ts` already crossed what a legend LISTS and what a tap SAYS. Where the
legend GOES stayed in the web host as a four-branch block, so the native
emitters drew every legend at the top and warned that `legendPosition` does not
lower — and the one placement both targets did implement disagreed anyway: the
emit drew the legend at `x: 0` across the full width while the web host inset it
by 8 on each side and pushed the plot 8 further down.

`placeLegend(entries, area, position, opts, measure)` in the crossing
`legend.ts` is now the single implementation. The web host calls it, both
emitters call it, and `legendPosition` (`top` / `bottom` / `left` / `right`)
lowers on every host that draws its chrome through the shared seam — a side
legend narrows and indents the plot on a phone exactly as in a browser, with the
tap offset folded into the chrome's own `tapX` so no host can forget it.

The four hosts whose engines draw their own frame (Gauge, Candlestick, Heatmap,
Boxplot) do not read the prop and still say so. `legendColumnWidth` moved from
the web host into `legend.ts` with it, and the runtime gained
`pyreonShiftCmdsXY` for the two-axis offset a side legend needs.

Separately, every unlowered `<PlotChart>` prop now says WHY. Sixteen of the
nineteen warned with only their name — a status, not a reason — against this
repo's own standard, which `<MapChart>`'s decline had a spec for and nothing
held the rest to. The reasons divide deliberately into two kinds: a prop whose
MECHANISM is the web platform (a DOM element, a hover, a download) and one that
is EMIT WORK, so a reader can tell a wall from a backlog item.

`<PlotChart>` carried its OWN copy of the four branches — a THIRD
implementation — and the copies had already drifted: a top legend sat at
`x: 0` there and `x: 8` in the family hosts, and a bottom one reserved
`height + 4` against `height + 8`. Neither difference was reported by anything.
It now calls `placeLegend` too, so the plot host, the sixteen family hosts and
both native emitters share one placement.

