---
'@pyreon/native-compiler': patch
---

Native (PMTC) emit: a single space between two JSX expression containers (`{a} {b}`) is now preserved, following the JSX whitespace rule (only whitespace containing a line break is layout); and an integer literal compared against a Double operand (`d !== 0`) emits as a Double literal on Kotlin, which has no Int/Double `==`/`!=`.
