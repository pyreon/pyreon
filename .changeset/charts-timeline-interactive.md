---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
'@pyreon/native-cli': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The ECharts `timeline` is interactive on web and native. Clicking a checkpoint jumps to that step, and the play / previous / next controls step it (`controlStyle.showPlayBtn` / `showPrevBtn` / `showNextBtn`). Auto-play honours `loop` and `rewind`, stopping at the end without `loop`. `checkpointStyle`, `lineStyle` and `label` colour the strip. A timeline over a family chart (pie, heatmap, …) now draws its strip, which it never did before. On native, every static step lowers to its own host under the same strip, instead of one frozen step. A pinned `timelineIndex` still renders exactly that step. The strip, its hit test and the stepping rules are one engine module shared by every target.
