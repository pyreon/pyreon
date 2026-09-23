---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

An option chart's `legend.type: 'scroll'` now pages as ECharts' does. When the entries overflow, they stay on one line, clipped short of ECharts' page controller at the end: a prev arrow, `{current}/{total}` and a next arrow, each arrow dimmed when there is no page that way. The line starts at `scrollDataIndex`, and pages break where ECharts breaks them, so an entry the edge cuts opens the next page. Clicking an arrow pages it. `pageButtonGap`, `pageFormatter` and the page colours are read. A 9-case differential against ECharts holds the controller and the whole entries each page shows.

Native draws such a legend unpaged, and now says so in a warning instead of silently.
