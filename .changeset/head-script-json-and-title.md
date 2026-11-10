---
"@pyreon/core": patch
"@pyreon/head": patch
"@pyreon/zero": patch
"@pyreon/compiler": patch
---

Head serialisation of script and title text.

- `@pyreon/head`: a JSON data block (`application/ld+json`, `speculationrules`, `importmap`, any `+json` / `/json` type) now escapes every `<` as `<`. The generic rewrite turned `<!--` into `<\!--`, and `\!` is not a JSON escape, so JSON-LD whose data contained `<!--` stopped parsing and its structured data was dropped. A `%s` title template now inserts the title literally on the server and the client: `$&`, `` $` ``, `$'` and `$$` in a title were expanded as replacement patterns.
- `@pyreon/core`: new `escapeJsonForScript(json)`, the one inline-script JSON recipe `@pyreon/head` and `@pyreon/zero` share.
- `@pyreon/zero`: `jsonLd()` uses the shared helper, and `render404Page` inserts the rendered body into the template literally.
- `@pyreon/compiler`: `diagnoseError` explains the `JSON.parse` invalid-escape error (V8, Firefox and JavaScriptCore wordings) that a JSON `<script>` body given the `<\!--` script-code escape produces, and points at `escapeJsonForScript`.
