---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`<Field kind="date" | "time" | "datetime">` picks a date, a time or both, on the web, iOS and Android.

The value is the zone-free wall-clock string an `<input type="date" | "time" | "datetime-local">` produces: `YYYY-MM-DD`, `HH:mm` (24-hour) or `YYYY-MM-DDTHH:mm`. `''` means no value. `min` and `max` take strings in the same format and bound what can be picked.

On the web it renders the matching `<input>`. On iOS it is a `DatePicker`; on Android, Material 3's date picker and time picker dialogs. With no value the native field shows the placeholder (or the locale's date pattern), and a clear button returns it to `''`. Material's time picker cannot disable hours, so on Android a time bound is applied when the choice is confirmed.

A static `min` or `max` that is not in the kind's format, or is not a real date, is ignored by a browser; the compiler drops it on iOS and Android too and names it. `min` after `max` is kept and named. `onSubmit` is not allowed on a date kind, because a picker has no keyboard submit.
