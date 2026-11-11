---
'@pyreon/i18n': patch
---

In development, `t()` now warns once per (locale, key) when a key is missing and no `onMissingKey` is set, instead of silently rendering the key. When `t('ns:key')` names a namespace with no messages while the default namespace has `ns.key`, the warning suggests `t('ns.key')` (the mistake that made the app-showcase Shop render raw keys). A namespace a `loader` has not loaded yet does not warn; at most 200 warnings per instance.
