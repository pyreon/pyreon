---
'@pyreon/charts': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

Moving the keyboard focus through a chart formats the one row it announces. It
used to build the chart's whole data table, uncapped, on every arrow key, Home
or End to read that row back out: on a 100,000-point line chart, 100,024
formatted values per keystroke, now 25. The native chart engines are
regenerated from the same table code; their behaviour is unchanged.
