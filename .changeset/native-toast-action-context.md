---
'@pyreon/toast': minor
---

On iOS and Android, a toast action's `onClick` may now take the `{ id, dismiss }` context (destructured, or as one name used through `.id` / `.dismiss()`), and `toast.dismiss(id)` / `toast.dismiss()` lower to the native runtime instead of being warned and dropped.
