---
'@pyreon/charts': minor
---

Boxplot family: `fiveNumber` (R-7 interpolated quartiles, Tukey 1.5-IQR fences, outliers), `boxplotExtent`, `renderBoxplot` (whiskers with caps, Q1–Q3 box, median line, outlier dots, entrance growing from the median), `hitBox`, `<BoxplotChart>` (reactive canvas host over raw observations, `onSelect`, accessible summary table), `boxplotToSvg` (server-safe, accepts precomputed summaries), and the option facade maps `type: 'boxplot'` (ECharts' `[min, Q1, median, Q3, max]` tuples, with a companion `scatter` series read as outliers). Conformance corpus 18 → 19, floor 16 → 17.
