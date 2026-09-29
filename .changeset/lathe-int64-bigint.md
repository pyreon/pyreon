---
'@pyreon/lathe': minor
'@pyreon/config': minor
'@pyreon/mcp': patch
---

`int64: 'bigint'` — OpenAPI `format: int64` without precision loss, end to end. The default (`'number'`) is unchanged and its output byte-identical; the `int64-precision` note now names the option.

Under `'bigint'` an int64 field is a `bigint`: its schema widens a safe integer (`preprocess(…, bigint().min(1n))`, for `@pyreon/validate` and zod alike), every other number reads back a bigint as the double `JSON.parse` would have produced, and the client decodes and encodes JSON losslessly — `@pyreon/http/json` on the `pyreon` client, an emitted copy of the same codec on `fetch` / `axios` / `ky` (held identical by a differential test). Error bodies, SSE / NDJSON events, mock fixtures (bigint literals) and faker factories follow. The contract surface names the type `int64`, so an `int32` → `int64` change is reported as breaking.

`responseValidation: 'off'` (for the client, or for an operation whose response carries an int64) is refused under `'bigint'` — validation is what widens a small id. Int64 path / query / header parameters travel as text. Web only: PMTC has no bigint, so the native modules keep the platform integer and a new `int64-native` note says so (Kotlin's `Int` is 32-bit). `@pyreon/config` gains the matching `lathe.int64` key; `@pyreon/mcp`'s API reference documents `losslessJson`.
