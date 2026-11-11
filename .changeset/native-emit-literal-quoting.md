---
'@pyreon/native-compiler': patch
'@pyreon/validation': patch
'@pyreon/charts': patch
'@pyreon/flow': patch
'@pyreon/url-state': patch
'@pyreon/dnd': patch
'@pyreon/rocketstyle': patch
---

Security: a string in shared source can no longer become Swift or Kotlin code in the iOS and Android output.

Some native emitters wrote strings without the compiler's quoters (`swiftStr` / `kotlinStr`), so text from a `.tsx` file ran as native code:

- `@pyreon/validation`: `.regex()` and `@pyreon/validate`'s `.url({ protocol })` were written into a Swift raw string (`#"…"#`), where `\#(…)` still runs Swift. A `pattern` in an untrusted OpenAPI spec could reach this through lathe's native output. Patterns are now ordinary escaped strings, so a pattern that contains `"#` now lowers instead of being refused.
- Kotlin `$name` / `${…}` templates stayed live in strings written with `JSON.stringify`. This affected chart theme, label and toolbox strings, flow node data, toolbars, edge types and the FlowWebView HTML, `useUrlState` string defaults, and `styled()`, token and rocketstyle values.
- `@pyreon/dnd`: `useDraggable({ data })` keys were written raw inside `"…"`.
- Values that become an enum case or identifier are now checked against fixed lists. An HTTP `method` other than GET, POST, PUT, PATCH or DELETE warns and is sent as GET. A flow `<Handle position>` other than top, right, bottom or left warns and the handle is not attached. Theme token names and rocketstyle state, size and property names that are not plain identifiers are skipped with a warning.
