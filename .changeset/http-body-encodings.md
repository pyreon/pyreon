---
'@pyreon/http': minor
---

Request bodies beyond JSON. `form` sends `application/x-www-form-urlencoded` (per-field OpenAPI `style`/`explode` via `formEncoding`, including `deepObject` brackets — what Stripe and Twilio require), `multipart` sends `FormData` (a `Blob`/`File` becomes a file part), `body` is now accepted by endpoints, and `cookies` writes a `Cookie` header (server-side/native). `json`, `form`, `multipart` and `body` are mutually exclusive and passing two throws. A header record may carry numbers, booleans and `undefined` (omitted, instead of the literal text `"undefined"`). An endpoint's declared `headers` now MERGE with per-call `headers` instead of being replaced by them, and `formEncoding` can be declared on the endpoint. `encodeForm`, `encodeMultipart` and `encodeCookies` are exported.
