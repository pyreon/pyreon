---
'@pyreon/validate': patch
'@pyreon/validation': patch
'@pyreon/compiler': patch
---

`email()` accepts internationalised domains at every precision (#4821), in both forms. Written in its own letters (`jan@müller.de`, `a@пример.рф`, also with the ideographic full stops `。` `．` `｡` as separators and ZWNJ / ZWJ inside a label) or in punycode (`a@xn--e1afmkfd.xn--p1ai`, the form a browser's `<input type=email>` returns — a punycode TLD used to be refused at `standard` / `rfc5322`). Invalid shapes are still refused (no leading hyphen or joiner, no empty label, a 2+ letter or `xn--` TLD outside `html5`). Two all-ASCII verdicts change: a punycode TLD now passes, and `rfc5322` now refuses a domain label longer than 63 characters (the DNS limit). The IDNA context and bidi rules are not checked, so the check is a superset of valid IDNs. The local part stays ASCII. The same grammar now applies on every target: the compiled validator emit (`@pyreon/compiler`) and the Swift / Kotlin lowering (`@pyreon/validation`'s native plugin), which used to lower every `.email()` to zod's ASCII approximation and ignored `precision`. A `precision` the native compiler cannot read is now reported by name and left unchecked on device, instead of guessed.

`TFn` accepts `@pyreon/i18n`'s `t` directly (#4822). `formatError`, `formatErrors`, `formatErrorsByPath`, `toFormValidator` and `resolveMetaField` refused i18n's `t` under `strictFunctionTypes` (TS2345), because its `values` parameter is `InterpolationValues`. `TFn` is now a method-signature type, so any `(key, params?) => string` translate function, a key-typed i18n instance's `t` included, is accepted without a cast; a function of a different shape is still rejected.
