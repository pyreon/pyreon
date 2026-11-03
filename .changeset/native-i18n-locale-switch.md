---
'@pyreon/i18n': minor
---

Switching language now works on iOS and Android. On the web you read the active locale with `i18n.locale()` and change it with `i18n.locale.set('de')`. Natively, both forms used to compile to code that neither Swift nor Kotlin accepted: a call on a string property, and an assignment to a read-only one. The native `PyreonI18n` containers now have a settable, observed `locale`. The compiler plugin lowers `i18n.locale()` to a read of that property, and `i18n.locale.set(x)` already lowers to an assignment, so every `t()` read re-translates in place when the language changes.
