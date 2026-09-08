---
'@pyreon/native-compiler': minor
---

`<ChartThemeProvider mode theme>` lowers on native as a compile-time theme scope. It was transparent: a dark-mode app rendered light charts on the phone, with a warning telling the author to theme every chart by hand. The emitter now resolves the provider — the literal mode's theme, the provider's literal `theme` fields over it, an outer provider's scope under both — while it emits the children, and every chart host without its own `theme` reads that scope; a chart's own `theme` still wins, the web's three layers in the web's order, byte-identical to giving each chart `theme={chartThemes.dark}` itself. What cannot be read at compile time is named: a reactive `mode` (an app's signal) or an absent one (the web follows the system scheme) — the light theme applies and the compiler says so once per provider.
