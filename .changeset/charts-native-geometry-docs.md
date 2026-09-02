---
'@pyreon/charts': patch
'@pyreon/compiler': patch
'@pyreon/native-compiler': patch
---

Docs: the README gains a "Native geometry" section stating that every `@pyreon/charts/plot` family is generated into `PyreonChartEngine.swift` / `.kt`, which API shapes exist because of the crossing (index hits, `{ min, max }` domains, ISO/day dates, `rampColor`, `calendarValues`, `parallelRows`, the seeded LCG), and what stays web-only (hosts, gestures, sonification, the tween, the option facade); the manifest's multiplatform rationale says the same, and the derived web-only rationale in `@pyreon/compiler`'s native audit and `@pyreon/native-compiler`'s web-only warning carries the same text.
