---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-kotlin': minor
'@pyreon/form': minor
'@pyreon/table': minor
---

PMTC lowers a TS integer `number` to Kotlin `Long` (64-bit) instead of `Int` (32-bit), matching Swift's `Int`. One shared source now holds the same values on both targets: `{ createdAt: 1726000000000 }` decoded on iOS and threw `Failed to parse int` on Android, and integer arithmetic past 2147483647 overflowed on Android only. Integer literals emit with the `L` suffix, and the emitter converts at every Kotlin/Compose API that takes `Int` (subscripts, `take`/`drop`/`substring`/`padStart`, `List(n)`, Compose dimensions, shift counts) and widens at every one that returns `Int` (`.size`, `.length`, `indexOf`). `parseInt` lowers to `toLongOrNull`, and a `useUrlState` integer accepts the JS safe-integer range on both targets (it was pinned to 32 bits on iOS too).

Breaking for hand-written Kotlin against these runtime surfaces: `PyreonFieldArray` (`length`, `key`, and every index parameter) and `PyreonTableState` (`page`, `pageCount()`, `filteredCount()`, `setPage`, the `pageSize` and `rowId` index parameters) now use `Long`; the generated chart engine and `PyreonChartHandle` state (`hover`, `selected`, `hidden`, `step`, `seriesCount`) use `Long` indices and counts.
