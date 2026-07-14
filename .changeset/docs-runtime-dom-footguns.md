---
"@pyreon/runtime-dom": patch
"@pyreon/mcp": patch
---

docs(runtime-dom): source-verified `mistakes[]` foot-gun catalogs added to render,
KeepAlive, _bindText, _tpl, sanitizeHtml — and TWO doc-bug fixes caught by
source-verification: KeepAlive's signature/summary/example were documenting Vue's
`include`/`exclude`/`max` API when the real prop is `active={() => boolean}`
(CSS-hides children, keeps them mounted); sanitizeHtml's summary claimed an
"identity function" fallback when the real fallback is a tag-allowlist sanitizer.
Regenerates the MCP api-reference runtime-dom region. Docs/manifest only — no
runtime behavior change.
