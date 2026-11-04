---
'@pyreon/toast': minor
---

`toast(msg, { description })` shows its description as the native card's second line on iOS and Android (13pt, grey, as on the web); `PyreonToastItem` and `add` gain an optional `description`. Toast options that don't lower natively (`icon`, `action`, `onDismiss`, a JSX description, a non-literal `duration` or `dismissible`) are now warned by name instead of silently dropped.
