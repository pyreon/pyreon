---
'@pyreon/primitives': minor
'@pyreon/native-compiler': minor
---

`<Field multiline>` is a text area on the web, iOS and Android.

Add `multiline` (and optionally `lines`, the number of visible rows, default 3) to a `<Field>` to get a multi-line text input. It lowers to `<textarea rows>` on the web, `TextField(axis: .vertical)` with `.lineLimit(lines, reservesSpace: true)` on iOS, and a `TextField` with `minLines`/`maxLines` on Android. On every target the field is exactly `lines` rows tall and scrolls past them, and Return inserts a newline. `lines` can be reactive.

A text area has no keyboard `kind` and no `onSubmit`, so the types reject both on the multiline shape, and the native compiler warns by name if they reach it anyway. `multiline` selects a different control, so it must be a static value; a dynamic one warns and renders a single-line field.

Fixed on Android: a plain single-line `<Field>` now passes `singleLine = true`. Material's `TextField` defaults to multi-line, so before this Return inserted a newline and long text wrapped onto more rows on Android only, while the web and iOS fields were one line.
