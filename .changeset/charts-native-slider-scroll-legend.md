---
'@pyreon/charts': patch
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

Native option charts: a slider `dataZoom` under ECharts' grid now draws ECharts' own slider in the grid's bottom margin (the same ported strip the web draws, laid out from the option's box, with its drag overlay over it), instead of Pyreon's navigator band under a shrunk plot. A horizontal `legend.type: 'scroll'` on a cartesian chart now pages one row with the engine legend's pager instead of drawing every entry wrapped.
