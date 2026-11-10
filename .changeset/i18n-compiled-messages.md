---
'@pyreon/i18n': patch
---

`t()` now resolves and compiles each message once per active locale, key and plural/context variant, then renders from that cache. A repeated call builds no cache-key string, does no LRU reordering, and runs no regex: a plain message returns its string, and `{{…}}` placeholders are split ahead of time, with inline format specs already parsed. The cache is cleared at the same two points as before (`addMessages` and a resolved `loadNamespace`). It is bounded per instance: 8 active locales, 2 × 1,000 keys per locale, and 32 plural/context variants per key. Intl number, date, relative-time and list formatters are cached per locale with no key string built for a named format or for no options. That cache used to grow without limit and is now bounded to 64 locales and 64 option sets per locale. Fallbacks, namespaces, `defaultValue`, `onMissingKey` (still called on every miss) and reactivity on locale changes behave as before.
