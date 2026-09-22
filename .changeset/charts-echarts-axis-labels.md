---
'@pyreon/charts': minor
---

Option axis tick labels sit where ECharts puts them. They are 8px off the axis (`axisLabel.margin`), and `axisLabel.inside` moves them onto the plot's side. The y axis now reads `axisLabel.rotate`, turning each label about its anchor, and its gutter holds the turned box. Every label's anchor, alignment and rotation is compared against ECharts' SVG.
