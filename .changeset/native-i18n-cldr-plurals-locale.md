---
'@pyreon/i18n': minor
---

Native i18n now matches the web `createI18n` on plurals and locale switching (#3981). The SwiftUI and Compose `PyreonI18n` runtimes resolve the full CLDR cardinal category set (`zero`/`one`/`two`/`few`/`many`/`other`) for the active locale, fractional counts included (Czech `1.5` takes `many`), from one shared CLDR 48 rule table tested against `Intl.PluralRules`; a language outside the table uses the English-shaped one/other rule. `i18n.locale.set('pl')` now works on native (the runtime `locale` is writable and observable, so every `t()` read re-renders) and `i18n.locale()` lowers to the property read instead of an uncompilable call.

Web behaviour change: when the CLDR category for a count is NOT `one` (`two`/`few`/`many`) and has no message of its own, `t()` now tries `key_other` before the bare `key`, so a missing Czech `few` form shows the plural instead of the singular. The bare key is still the singular form, so `one` keeps its order (`key_one` → `key`, with `key_other` only as a last resort when neither exists): `{ item, item_other }` still renders `"1 item"` / `"2 items"`. Both native runtimes resolve the same candidate order.
