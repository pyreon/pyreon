---
'@pyreon/http': patch
'@pyreon/native-compiler': minor
'@pyreon/native-runtime-swift': minor
'@pyreon/native-runtime-kotlin': minor
'@pyreon/lathe': minor
'@pyreon/query': patch
'@pyreon/mcp': patch
---

Native streams behave like the web in three more places.

- `@pyreon/http` native runtime (Kotlin): the stream loop reads on its own thread but no longer writes from it. Every state write (`events`, `latest`, `status`, `error`) and every `onEvent` call is handed to a main executor — the emit passes `PyreonStreamMain`, the Android main looper (new `PyreonStreamAndroid.kt`) — so `onEvent` code touching main-bound state behaves as it does on the web, where the whole hook runs on one thread. Each queued write re-checks that its stream is still the live one, so a write queued before `stop()` / `idle()` / `abort()` can no longer land after it. On Swift the loop already ran on the main actor; the loop parity test now asserts it.
- `@pyreon/native-runtime-swift` / `@pyreon/native-runtime-kotlin`: `PyreonJSON.stringify` / `PyreonJson.stringify` write exactly the bytes the web's `JSON.stringify` writes for the same value — keys in source order (Swift's `JSONEncoder` did not keep it), numbers laid out by ECMAScript's `Number::toString` (`1`, not `1.0`; `1e+21`; `-0` → `0`; `NaN` → `null`), and strings escaped as `JSON.stringify` escapes them (no `\/`).
- `@pyreon/native-compiler`: `JSON.stringify(x)` lowers to those, so a stream's runtime `json` body (and every other stringified value) is byte-identical across web, iOS and Android. The Kotlin `useStream` emit passes `main = PyreonStreamMain`.
- `@pyreon/lathe`: a stream-only non-GET operation with a JSON body (or none) now reaches native as a TRIGGERED `<Op>Stream` component — `enabled: boolean` opens the stream while true, the body is the `json` prop — the `useStream(src, { enabled })` + runtime `json` shape the native compiler lowers. A form / multipart / text / binary body, or a path parameter named `enabled` / `json` / `children`, stays web and the reach report says which.
- `@pyreon/query`: the `useStream` manifest entry records the main-thread `onEvent` and the byte-identical body.
