---
'@pyreon/hooks': minor
'@pyreon/native-compiler': patch
---

`useFilePicker().pick(accept)` limits which files can be chosen, on the web, iOS and Android.

`accept` uses the `<input accept>` vocabulary: MIME types (`'application/pdf'`), wildcards (`'image/*'`) and extensions (`'.csv'`). On the web it sets the file input's `accept` attribute. On iOS each entry maps to a UTType: MIME types and extensions through UTType's own tables, wildcards to `.image` / `.movie` / `.audio` / `.text`. On Android it becomes the MIME types the system document picker takes. An entry a platform cannot resolve widens that pick to any file rather than hiding the file the user is looking for. Calling `pick()` with no argument is unchanged.

Native pickers previously always opened with "any file", whatever the app asked for, and `pick([...])` did not compile on iOS or Android.
