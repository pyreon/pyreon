---
"@pyreon/rx": patch
"@pyreon/hotkeys": patch
"@pyreon/url-state": patch
"@pyreon/storage": patch
"@pyreon/document": patch
"@pyreon/mcp": patch
---

fix(manifests): correct API inaccuracies that feed llms.txt / llms-full.txt / MCP `get_api`

Several package manifests carried inaccuracies that would break copied code. Corrected
against source + regenerated the AI-facing doc surfaces (`@pyreon/mcp`'s `api-reference.ts`
ships the corrected `get_api` data):

- **rx**: removed the fabricated "curried operators" model — `pipe(source, ...fns)` threads
  the value through plain `(value) => value` transforms; `filter`/`map`/`sortBy` are always
  2-arg `(source, …)` (no 1-arg curried form).
- **hotkeys**: the real option is `enableOnInputs` (not the fabricated `enableOnFormElements`);
  scopes are not reference-counted.
- **url-state**: options are `debounce` / `replace` (not `debounceMs` / `replaceState`); SSR
  initializes to the default value (it does not read the request URL).
- **storage**: custom-backend methods are `get` / `set` / `remove`; serializer options are
  `serializer` / `deserializer`.
- **document**: the format string is `google-chat` (not `gchat`).
