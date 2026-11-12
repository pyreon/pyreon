---
'@pyreon/url-state': patch
---

`useUrlState(key, default, options)` compiled for iOS / Android now warns by name about each option the native binding does not apply (`serialize`, `deserialize`, a non-zero `debounce`, `replace: false`, `arrayFormat: 'repeat'`, `onChange`, or options that are not an inline object). They used to be dropped silently, so native could read a different value than the web.
