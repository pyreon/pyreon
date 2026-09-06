---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

**The grammar: `<Plot>` with mark children.** `<Plot data={rows} x="month"><Bar y="revenue" /><Line y="target" /><Axis y format={currency('$')} /><Tip /><Legend /></Plot>` — channels are FIELD NAMES (typed `keyof T`) or accessors, marks are JSX children (so layering is composition and a `<Show>` around a mark is ordinary Pyreon), and `<Rule>` / `<Axis>` / `<Tip>` / `<Legend>` / `<Zoom>` declare annotations, axes, the tooltip, the legend and zoom/navigator/presets/brush/linking as data. Marks are branded components `<Plot>` scans structurally (the `Switch`/`Match` precedent) and resolves into the `marks={[bars(…)]}` props `<PlotChart>` already takes — the array form stays the config form and the two are one spec. A `color` channel on `<Plot>` pivots long-format rows into one series per distinct value (categories from `x`, gaps where a pair is absent, bars grouped unless `stack`). `resolveGrammar` and `channel` are exported.

Native: the compiler desugars `<Plot>` to the `<PlotChart marks>` element the plot host lowers — the grammar form emits byte-identical Swift/Kotlin to the array form — while the runtime `color` pivot and a stray mark outside `<Plot>` warn by name.
