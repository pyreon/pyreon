---
'@pyreon/i18n': minor
---

Native i18n now matches the web `createI18n` on plurals and locale switching (#3981). The SwiftUI and Compose `PyreonI18n` runtimes resolve the full CLDR cardinal category set (`zero`/`one`/`two`/`few`/`many`/`other`) for the active locale, fractional counts included (Czech `1.5` takes `many`), from one shared CLDR 48 rule table tested against `Intl.PluralRules`; a language outside the table uses the English-shaped one/other rule. `i18n.locale.set('pl')` now works on native (the runtime `locale` is writable and observable, so every `t()` read re-renders) and `i18n.locale()` lowers to the property read instead of an uncompilable call.

Web behaviour change: when the CLDR category for a count has no message of its own, `t()` now tries `key_other` before the bare `key`, so a missing `few` form shows the plural form instead of the raw key. Both native runtimes resolve the same candidate order.
