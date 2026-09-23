---
'@pyreon/native-runtime-kotlin': patch
---

Android charts draw their text at the right size. The chart canvas paints under `scale(density)`, and the native canvas it draws text through carries that transform, but text size and the label halo's stroke were multiplied by the density again. Text came out density² — about 2.6× too large on a 420dpi phone — while layout measured it at 1×, so axis labels overlapped each other and the dataZoom strip.
