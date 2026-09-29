---
'@pyreon/native-compiler': minor
'@pyreon/toast': minor
'@pyreon/dnd': minor
'@pyreon/sized-map': minor
'@pyreon/hooks': minor
'@pyreon/http': minor
'@pyreon/sync': minor
'@pyreon/charts': minor
---

Finish the Kotlin `Int` to `Long` move for the runtime APIs emitted code reaches. `PyreonToast.maxToasts`, `PyreonSortable.moveIndex`, `PyreonRateLimit` delays and scheduler, `PyreonSizedMap` (`maxEntries`, `size`), `PyreonScreenOrientation.angle`, `PyreonStream` (`maxEvents`, reconnect `attempts`) and the chart web-view selection indices now use `Long`, and the emit adds the `L` suffix to the literals it passes them. `PyreonChartPoints` takes `Long` counts, which fixes a real `gradle assembleDebug` failure in every chart-bearing Android example. `syncedSignal` and `PyreonCrdtMap.set` now accept `Long` (a `Long` signal previously threw `unsupported value type`).
