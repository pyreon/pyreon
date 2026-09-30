---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
---

A scrolling legend now pages as ECharts' does. When the entries overflow, they stay on one line, clipped short of the page controller at the end: a prev arrow, `{current}/{total}` and a next arrow, each arrow dimmed when there is no page that way. Pages break where ECharts breaks them, so an entry the edge cuts opens the next page. Clicking an arrow pages it.
