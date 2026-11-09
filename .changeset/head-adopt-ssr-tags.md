---
'@pyreon/head': patch
---

Hydration no longer duplicates server-rendered head tags. The client syncer adopts tags marked with `data-pyreon-head="<key>"`, but the SSR serializer never wrote that attribute. As a result, every hydrated page appended a second copy of each `<meta>`, `<link>` and JSON-LD `<script>` beside the server's copy. `renderWithHead` / `serializeHead` now stamp each keyed tag with its key, so the client patches the server's tags in place. The attribute is written last, after the tag's own attributes; `<title>` is unchanged. The serializer itself moved to `src/serialize.ts`, which has no `@pyreon/runtime-server` import, and `@pyreon/head/ssr` still exports `serializeHead`.
