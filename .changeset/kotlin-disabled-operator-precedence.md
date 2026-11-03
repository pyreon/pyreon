---
'@pyreon/native-compiler': patch
---

Android: `disabled={…}` with an operator expression now compiles.

Compose spells `disabled` as `enabled = !<expr>`, and `!` binds tighter than `==`, `&&`, `||` and `?:`. So `<Button disabled={tab() === ''}>` emitted `enabled = !tab == ""`, which applies `!` to a String and fails to build (`unresolved reference 'not' for operator '!'`). The same source built on iOS, where `.disabled(tab == "")` needs no inversion. The inversion is now parenthesised for anything but a bare read, on `Button`, `Field`, `Toggle` and `Press`.

The Kotlin validation stub for `Modifier.clickable` now mirrors the real signature (`enabled`, `onClickLabel`, `role`, `onClick`). It took only `onClick`, so it rejected the correct `<Press disabled>` emit and that shape had never been compile-checked.
