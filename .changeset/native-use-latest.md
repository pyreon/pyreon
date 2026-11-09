---
"@pyreon/hooks": minor
---

`useLatest(literal)` now lowers to iOS and Android as a `PyreonLatest<T>` reference box (not view state, so writing `.current` never re-renders, as on the web). A non-literal initial value is a named warning that drops the hook.
