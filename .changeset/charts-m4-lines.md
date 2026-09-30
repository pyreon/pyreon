---
'@pyreon/charts': minor
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

A line with more points than its plot has pixels is drawn from at most eight points per CSS pixel (M4: the first, lowest, highest and last point of each half-pixel column), which is how uPlot draws large series. A 1,000,000-point line on an 800px plot now strokes about 3,000 points instead of a million. Measured in real Chromium, the reduced line covers exactly the same pixels as the full one; antialiasing shade along a dense zigzag can differ slightly, because the full path overlaps itself hundreds of times per column. Horizontal charts and non-monotone point sets are drawn unchanged. iOS and Android use the same reduction.
