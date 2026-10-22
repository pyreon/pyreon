---
'@pyreon/native-compiler': patch
---

Kotlin: `Math.round` now yields a Double, matching what PMTC infers and what the Swift emit produces. `java.lang.Math.round` returns a Long, so `const pct = computed(() => Math.round(x * 100))` shown with `{String(pct())}%` failed to compile on Android ("actual type is 'Long', but 'Double' was expected"), with no warning. Rendered text is unchanged: whole numbers still print without `.0`.
