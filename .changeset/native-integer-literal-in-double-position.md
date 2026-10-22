---
"@pyreon/native-compiler": patch
"@pyreon/hooks": patch
---

Native emit: an integer literal in a position that expects a `Double` is now emitted as a `Double` (`0.0`), on both targets (#3956). Kotlin does not coerce an integer literal into a `Double`, so `const ZERO: Double = 0`, a `Double[]` of whole numbers, a `Double` function that returns `0`, an argument to a `Double` parameter, and the `0` in `half(geo.latitude ?? 0)` all failed `gradle` while building on the web and iOS; Swift lost the annotation on a local (`const x: Double = 0` emitted `let x = 0`, an Int). One expected-type pass now types every one of those positions, and an Int context is never touched. Also silences the Swift 6 concurrency warning in the staged `PyreonClipboard` runtime (the reset task now runs on the main actor instead of capturing a weak `self` var in a concurrently-executing closure).
