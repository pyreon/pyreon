---
'@pyreon/lathe': minor
'@pyreon/config': minor
'@pyreon/cli': minor
---

Add `@pyreon/lathe` — spec-to-client code generation for the Pyreon stack.

Reads an OpenAPI 3.x document and emits `@pyreon/validate` schemas,
`@pyreon/http` endpoints, `@pyreon/query` hooks, deterministic mock fixtures and
`@pyreon/atlas` scenarios. Available as `pyreon lathe generate` alongside
`pyreon atlas` and `pyreon loom`, and configured from a `lathe` section in
`pyreon.config.*`.

The `multiplatform` target is the part without a direct analogue elsewhere. The
native compiler lowers only a subset of TypeScript and has no module graph — it
recognises a client, a schema and a call only when they share one file's top
level — so Lathe emits an additional self-contained module per tag, a layout no
human would maintain and exactly the one the compiler wants. It then runs the
real compiler over its own output and checks for the POSITIVE marker, because
zero warnings is not evidence of lowering: a standalone hook wrapping `useQuery`
produces no warnings and emits Swift that cannot find the symbol.

Spec parsing is first-party, including a YAML reader scoped to the OpenAPI
subset that refuses anchors, merge keys, explicit tags and tab indentation with
a line number rather than mis-reading them.
