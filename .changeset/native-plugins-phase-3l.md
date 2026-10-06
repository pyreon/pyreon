---
'@pyreon/native-compiler': minor
'@pyreon/machine': minor
'@pyreon/i18n': minor
'@pyreon/toast': minor
'@pyreon/a11y': minor
'@pyreon/table': minor
'@pyreon/dnd': minor
'@pyreon/sync': minor
---

Native lowering for machine, i18n, toast, a11y, table, dnd and sync moves out of the compiler into package-owned plugins. A bare transform with no plugins no longer lowers these libraries; `<Toaster/>` must be imported from `@pyreon/toast`.
