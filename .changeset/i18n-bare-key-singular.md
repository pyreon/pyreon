---
'@pyreon/i18n': patch
---

Fix a plural regression from the CLDR change: with `{ item: '{{count}} item', item_other: '{{count}} items' }`, `t('item', { count: 1 })` returned `"1 items"` (v0.53 returned `"1 item"`). The bare key is the singular form again. For category `one` the lookup is `key_one` → `key` → `key_other` (the `_other` form is now only a last resort when no singular exists); for every other category it stays `key_<category>` → `key_other` → `key`, so an untranslated Czech `few` still shows the plural. The same order holds with `context` (every singular form is tried before any `_other` for `one`) and in the native SwiftUI and Compose `PyreonI18n` runtimes, which had the same regression.
