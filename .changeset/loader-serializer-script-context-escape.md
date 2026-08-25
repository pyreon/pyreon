---
'@pyreon/router': patch
---

Security: harden the SSR loader/store-state serializer against inline-`<script>` context injection.

`stringifyLoaderData` — the shared helper that serializes `window.__PYREON_LOADER_DATA__` and `window.__PYREON_STORE_STATE__` into inline `<script>` bodies — previously escaped only `</`. That is insufficient: the HTML tokenizer enters the script-data-double-escaped state on `<!--` followed by `<script` (neither token contains a slash), so a loader/store value like `<!--<script>` survived verbatim and could corrupt the script boundary (hydration DoS; XSS-adjacent). Raw U+2028/U+2029 in a JSON string were also emitted unescaped and are `SyntaxError`s inside a `<script>`.

The serializer now neutralises the whole `<` class (`<` — makes `</script`, `<!--`, and `<script` all unformable, superseding the old `</`-only escape) plus U+2028/U+2029. Escaped forms parse back to the original characters under `JSON.parse`, so hydrated data is byte-identical — only the serialized representation is neutralised. Both embed sites (loader data and store state) route through this one helper, so both are covered.
