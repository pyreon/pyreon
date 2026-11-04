---
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
---

`JSON.parse` now lowers to iOS and Android. It decodes into the type the source names — `JSON.parse(s) as T`, `const x: T = JSON.parse(s)`, or the return type of a helper that returns it — through the new runtime `PyreonJSON.parse` (Swift `JSONDecoder`) and `PyreonJson.parse` (kotlinx-serialization, unknown keys ignored as on the web). It throws on malformed input, so it rides the `try`/`catch` lowering. An untyped call or a reviver argument is named in a warning instead of being guessed. The native decode is stricter than the web: input whose shape does not match the type throws.
