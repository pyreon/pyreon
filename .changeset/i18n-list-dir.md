---
'@pyreon/i18n': minor
---

Add `i18n.l(values, options?)` for locale-aware list joins via `Intl.ListFormat` ("a, b, and c" / "a or b"), the inline `{{items, list}}` / `{{items, list, disjunction}}` / `{{items, list, unit, narrow}}` message specs, named `listFormats`, and `i18n.dir(locale?)`, which returns `'ltr'` or `'rtl'` for a locale (reactive to the current locale when called without an argument).
