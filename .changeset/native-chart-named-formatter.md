---
'@pyreon/native-compiler': patch
---

A named function passed as a chart axis formatter (`<Axis y format={kg} />`, `<PlotChart format={kg} xFormat={…} y2Format={…}>`) now compiles on iOS and Android. `function kg(v: number)` lowered its parameter to `Int`, and the formatter slot takes a `Double`, so the chart failed to build on both targets with no compile-time warning. A function passed there, module-level or declared in the component, now takes a `Double`; inline arrows, `date(…)` and formatter factories already worked and are unchanged.
