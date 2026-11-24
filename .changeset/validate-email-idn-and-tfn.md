---
'@pyreon/validate': patch
'@pyreon/validation': patch
'@pyreon/compiler': patch
---

`email()` accepts internationalised domains at every precision (#4821). An address whose domain is written in its own letters (`jan@müller.de`, `a@пример.рф`) passes at `html5`, `standard` and `rfc5322`, as its punycode form already did: a domain label may use any Unicode letter or decimal digit, plus combining marks after its first character. The shape rules are unchanged (no leading hyphen, no empty label, a 2+ letter TLD outside `html5`, the rfc5322 length limits), so invalid shapes are still refused, and an all-ASCII address gets exactly the verdict it had before. The local part stays ASCII. The same grammar now applies on every target: the compiled validator emit (`@pyreon/compiler`) and the Swift / Kotlin lowering (`@pyreon/validation`'s native plugin), which used to lower every `.email()` to zod's ASCII approximation and ignored `precision`. A `precision` the native compiler cannot read is now reported by name and left unchecked on device, instead of guessed.

`TFn` accepts `@pyreon/i18n`'s `t` directly (#4822). `formatError`, `formatErrors`, `formatErrorsByPath`, `toFormValidator` and `resolveMetaField` refused i18n's `t` under `strictFunctionTypes` (TS2345), because its `values` parameter is `InterpolationValues`. `TFn` is now a method-signature type, so any `(key, params?) => string` translate function, a key-typed i18n instance's `t` included, is accepted without a cast; a function of a different shape is still rejected.
