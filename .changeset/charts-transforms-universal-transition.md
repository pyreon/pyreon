---
'@pyreon/charts': patch
'@pyreon/native-compiler': patch
---

`PlotChart` takes `universalTransition`: a series or row-count change runs a command-level morph (the same `cmd-tween.ts` machinery the canvas host uses), so a shape change tweens instead of snapping. Native's runtime canvas is shape-agnostic and already emitted the flag.
