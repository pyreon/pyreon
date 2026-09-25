---
'@pyreon/lathe': minor
'@pyreon/http': minor
'@pyreon/config': minor
---

`@pyreon/lathe`: a public plugin API and author control over the output.

- `definePlugin({ name, requires?, setup?, transformDocument?, emit? })` — third-party emitters and IR transforms, listed in `plugins` beside the built-in names. Hook failures name the plugin and the hook; the document a hook receives is frozen (return a modified copy; a copy with dangling model references is refused); each hook runs twice and must agree with itself, so a plugin cannot break byte-identical regeneration; plugin files are listed in `lathe-manifest.json` (pruned when dropped), compared by `lathe check`, passed to `format`, and refused on a path collision. The IR types, the `SourceFile` writer and the identifier helpers are exported for plugin authors.
- `filters` — generate a subset: `include` / `exclude` matchers by tag (every tag), path glob, operationId glob (spec id or generated name) and method. Unreached models and their notes are dropped (`models: 'all'` keeps them). A matcher that selects nothing is an error with a suggestion.
- `patches` — RFC 6902 `add` / `replace` / `remove` at RFC 6901 pointers, applied before the spec is read. A patch whose target moved fails the run.
- `operations` — per operation, keyed by endpoint name or spec `operationId`: `hook` (a name, or `false` for no hook, preview or native component), `responseValidation`, and `pagination` (the same entry the top-level `pagination` takes).
- `naming` — `operation` / `model` / `file` / `hook` functions receiving Lathe's own choice as `default`; results are validated and collision-checked (file names case-insensitively). `hook` may return `false`.
- `format` — `(code, path) => string | Promise<string>`, applied before a file is written and before `lathe check` (and the Vite plugin's `checkOnBuild`) compares. `formatFiles` is exported for programmatic use.
- New note code `plugin` (severity `loss`) for losses a plugin reports through `ctx.note`.

Behaviour changes: `runPass` from `@pyreon/lathe/vite` is now async (it may run an async formatter). With the `queries` plugin on, generated hook names are now checked for collisions (with each other, with endpoint names and with `@pyreon/query`'s exports) and a collision is an error naming both sides — previously it produced a module that did not compile.

`@pyreon/http`: a per-request `validate` option and a per-endpoint `validate` in `api.endpoint(spec, { validate })` override the client's response-validation mode (static or accessor) for that request or endpoint.

`@pyreon/config`: `LatheSection` gains `operations`, `filters`, `patches`, `naming` and `format`, and `plugins` accepts `definePlugin` plugins (`LathePluginObject`), kept in parity with `@pyreon/lathe` by its compile-time test.
