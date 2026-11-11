---
'@pyreon/server': minor
'@pyreon/zero': minor
---

Add an `onError(error, { request, phase })` hook to `createHandler` and zero's `createServer`, so server errors can be forwarded to Sentry, OpenTelemetry or a log shipper. It receives a throwing middleware or API route (`'middleware'`), a failed render (`'render'` / `'stream'`), a throwing server action (`'action'`) and errors a middleware reports through the new `ctx.reportError`. The hook runs after the existing console line, never changes the response, and a failing hook is caught.

Upgrade: none
