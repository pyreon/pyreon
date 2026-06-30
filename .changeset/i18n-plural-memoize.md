---
"@pyreon/i18n": patch
---

perf: memoize `Intl.PluralRules` per locale in `resolvePluralCategory`. Plural `t()` calls previously allocated a fresh `new Intl.PluralRules(locale)` every call (the `Intl` constructor dominates — `.select()` is cheap), making a plural lookup ~50× a plain interpolation. Caching the `PluralRules` per locale (mirroring the already-memoized number/date/relative-time formatters) drops plural resolution ~11µs → ~700ns (~16×). Output is unchanged; custom-`pluralRules` callers are unaffected (they early-return before the Intl path). Surfaced by the new `bench:i18next` objective benchmark.
