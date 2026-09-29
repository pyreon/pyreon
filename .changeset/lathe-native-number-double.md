---
'@pyreon/native-compiler': patch
---

A decoded model's `number` fields now follow the endpoint's response schema: `s.number()` lowers to `Double` and `s.number().int()` stays `Int`. Previously every `number` defaulted to `Int`, so an OpenAPI `type: number` field failed to decode a fractional value like 4.5 on iOS and Android.
