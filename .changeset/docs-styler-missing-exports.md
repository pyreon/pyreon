---
"@pyreon/styler": patch
"@pyreon/mcp": patch
---

docs(styler): document the two remaining public exports missing from the manifest.
The styler manifest was already at a high bar (12 mistakes blocks, 5 gotchas
covering descriptor-copy prop forwarding, CSP nonce, singleton sheet, theme
reactivity). This closes the "every public export in api[]" gap: the FNV-1a hash
primitives (`hash`/`hashUpdate`/`hashFinalize`/`HASH_INIT` — the class-name/rule
dedup hash, with the streaming-vs-one-shot contract + the non-cryptographic
caveat) and `setStyleExtraction` (the internal CPSE dependency-injection seam that
`@pyreon/ui-core`'s `init({ styleExtraction: true })` uses to thread in
`@pyreon/unistyle`'s rewriter — apps enable CPSE via the init flag, not this call).
Both verified against source (hash.ts, styled.tsx). Regenerates the MCP
api-reference + llms-full styler sections + snapshot key list. Docs/manifest only —
no runtime behavior change.
