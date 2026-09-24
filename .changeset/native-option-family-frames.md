---
'@pyreon/native-compiler': minor
---

A literal `<OptionChart>` funnel, treemap, sankey or sunburst now sits on iOS and Android where ECharts places it: a funnel in its 80 / 60 margins, a treemap in 10%, a sankey in its 5% / 20% box, a sunburst at a 75% radius, all under the series' own box keys and `center`. Before, it filled the native canvas. The host renders into the frame the web computes, resolved at the device's size, and taps are mapped into it. A non-literal option can't be framed at compile time, so its box keys are named in a warning instead of dropped.
