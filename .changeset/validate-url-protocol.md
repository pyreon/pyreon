---
'@pyreon/validate': minor
'@pyreon/compiler': patch
---

`@pyreon/validate`: `s.string().url({ protocol })` (and the `/mini` `url({ protocol })` action) accepts any RFC 3986 absolute URI whose scheme matches the RegExp — the same option as zod 4's `z.url({ protocol })`. The default is unchanged (`http:` / `https:`): widening it would admit `javascript:` and `data:` in apps that used `.url()` to keep them out of rendered links.

`@pyreon/compiler`: the build-time validator emitter no longer compiles `.url({ protocol })` or `.email({ precision })` to the default check (which would have rejected in a compiled build what the runtime accepts); a schema carrying either option falls back to the runtime.
