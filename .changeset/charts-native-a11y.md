---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Every native chart canvas is now NAMED, and the plot host is DESCRIBED from its own data.

A canvas is one opaque node to a screen reader. The web hosts have always answered that with the engine's `describeChart` sentence as the `aria-label` plus an offscreen table; natively only a `title` was ever applied — so an untitled chart was a blank rectangle to VoiceOver and TalkBack, and a titled one said its title and nothing about its data.

- `a11y.ts` crosses with the engine (`ENGINE_FILES`), so `describeChart` / `chartTable` are generated into `PyreonChartEngine.swift` / `.kt` and both targets read the SAME sentence the web does. Its two subscript reads are bounds-checked for the native subset (a Swift subscript is never optional), which also fixes a real web edge: a series longer than the categories, or shorter than its siblings, now renders an empty cell instead of reading past the end.
- Both emitters apply the label in the web host's order of precedence: an explicit `accessibilityLabel`, else the data description (the plot host, built from the series and categories the canvas painted and through the chart's own `format`), else `title`, else the family word (`chartDefaultLabel`: `PieChart` → "Pie chart", `PlotChart` → "Chart"). The description is emitted INSIDE the scope holding the hoisted series, which is the only place those bindings exist.
- Device-asserted on both platforms: the tasks showcase's bar chart is queried for its label / content description and must carry the title, the series and the category count.
