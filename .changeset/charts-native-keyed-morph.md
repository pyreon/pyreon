---
'@pyreon/charts': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`<Chart by>` morphs by row key on iOS and Android. `by` lowers to the new `ChartSpec.rowKeys`; with it set, the engine tags every plain, stacked and grouped bar command with its row `key` and the `enter` rect it grows from (`growEdgeRect`, the same helper the web morph uses), and a line whose points are its rows one-to-one with `pointKeys`. `PyreonChartCanvas` on both platforms matches keyed commands by key: a surviving bar slides between slots, an entering one grows from its zero-side edge, an exiting one shrinks into it, and keyed line points move by key. Unkeyed charts and the web draw byte-identically. The compile-time warning that `by` was web-only is gone.

The Kotlin stub extractor used by the native compile checks now ignores comments, so a parenthesis in a runtime data class's doc comment no longer truncates the class.
