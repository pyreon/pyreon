---
'@pyreon/toast': minor
'@pyreon/native-compiler': minor
---

`<Toaster />` now shows toasts on iOS and Android the way the web does: a screen-anchored overlay that takes no layout space and stays visible across navigation.

- **Android:** the Toaster rendered nothing before. A `<RouterProvider>` whose routes were known replaced all of its children with the route dispatch, so every sibling of `<RouterView />` (a header, a nav bar, the Toaster) was dropped with no warning. Children now emit as written, and `<RouterView />` becomes the dispatch wherever it sits.
- **iOS:** toasts were an inline stack in the NavigationStack's root, so they pushed the layout and were hidden on every pushed screen. They now live in a pass-through overlay window.
- **iOS router:** the same class hit every sibling of `<RouterView />` (a header, a nav bar): they sat in the NavigationStack's root and were covered by any pushed screen. The RouterView alone now becomes the navigation stack, its siblings render around it, and the router is provided to the whole tree so a sibling can still navigate. A lone `<RouterView />` emits exactly as before.
- **Both:** cards follow the web stylesheet (white card, colored accent per type, error and warning announced with priority), animate in and out, and carry a dismiss button unless the toast was created with a literal `dismissible: false` (lowered from `toast()`'s options; `PyreonToastItem` and `add` gain a defaulted `dismissible`). `<Toaster>`'s literal `position`, `max`, `gap`, `offset` and `duration` props are honoured; a dynamic or invalid value is warned by name and keeps its default.
- **Compiler:** a negative number literal (`offset={-4}`) now counts as static for every lowering that needs a literal, instead of reading as dynamic.
