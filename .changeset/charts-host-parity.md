---
'@pyreon/charts': minor
'@pyreon/native-compiler': patch
---

`@pyreon/charts/plot`: every family host gets the interaction stack `<PlotChart>` had alone, and the hosts stop re-laying out on every pointer move.

- **Pointer events everywhere**: a finger drags, pans, brushes and pinch-zooms (`dataZoom`) as a mouse does; a tap shows the tooltip. `<PlotChart>` captures the pointer for a drag and sets `touch-action: none` only when it owns a gesture.
- **Keyboard on every host** (`keyboard`, default on): the canvas is focusable, Arrow / Home / End walk the items the accessible table lists, each is announced in a polite live region and ringed where the family can place a ring, Enter / Space select through `onSelect` / `onSelectIndex`, Escape clears. The canvas is `aria-describedby` its table; the table stops at 1,000 rows and says so.
- **Update animation on every host**: a same-shape data change tweens at the draw-list level (`tweenCmds`), so a treemap cell glides and a slice sweeps; a shape change snaps. `updateAnimation` / `updateDuration` on every host.
- **Legend placement** (`legendPosition`: `top` / `bottom` / `left` / `right`) on every host and on `<Legend position>`.
- **`yDomain`** on `<PlotChart>`; `<Axis y domain>` now pins the left domain (it was silently ignored — only `y2` read it).
- **`dash`** on `line` marks.
- **A missing measurement is a gap, not a zero**: `null` / `undefined` / `NaN` / an Infinity from an accessor skips the bar, breaks the line, draws no dot, stays out of the domain, and leaves the tooltip row and table cell empty (it used to plot as `0`). Write `d.v ?? 0` where zero is the truth.
- **Toolbox on every host**: `toolbox={{ saveAsImage: true }}` saves the canvas as a PNG; `<PlotChart>` accepts `'svg' | 'png'` and `onSaveImage(data, format)`.
- `GaugeChart` is built on the shared host (theme, title, description, table, keyboard). `CalendarChart` and `MapChart` gain `onSelectIndex`. `canvasHost` and its types are exported as the extension point for a family of your own; `RadarHitIndex`, `PointMarker`, the `*In` render/hit variants and the tween primitives are exported too.
- `<Plot>` forwards the whole `<PlotChart>` surface (the events/actions model, `toolbox`, `seriesLabels`, `onSelectIndex`).
- **Performance**: one `layoutChart` per frame (paint, crosshair, brush, focus ring and every hit test share it — a pointer move cost four to six); the family hosts hit-test the last draw's layout (a force-directed graph re-simulated on every mousemove); the navigator resolves its series once per data change and thins it to the strip's width; the accessible input is memoized; a decimated selection looks its row up in a map; `graphIndexOf` / `sankeyIndexOf` return at the first match; the canvas text measurer is memoized; animation frames are cancelled on unmount.
- Native: the new props (`legendPosition`, `keyboard`, `updateAnimation`, `updateDuration`, `toolbox`, `onSaveImage`, `accessibleTable`, `yDomain`, `link`, `seriesLabels`) warn by name on iOS/Android instead of being dropped silently; the generated engine gains `renderChartIn` / `barsForIn` / `stackedHitIn` / `plotHitBarsIn` / `plotHitIndexIn` and the gap-safe bar layouts.
