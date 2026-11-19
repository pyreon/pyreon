---
'@pyreon/native-compiler': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
'@pyreon/hooks': patch
'@pyreon/query': patch
'@pyreon/validation': minor
---

Native JSON decodes now accept what the web accepts:
- A quoted member name in a type (`'content-type': string`) is no longer dropped from the struct.
- Android accepts `3.0` for a field typed as an integer.
- iOS decodes and encodes `Record<number, T>` as a JSON object.

`@pyreon/validation`'s `number()` is a Double natively, so a fraction such as `1.5` passes, as it does on the web. Only `number().int()` is an integer.
