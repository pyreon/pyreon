---
"@pyreon/elements": patch
"@pyreon/mcp": patch
---

docs(elements): source-verified mistakes[] for Text + a Util doc-bug fix.
Text had no mistakes — added three verified against Text/component.tsx: `tag`/
`paragraph` are STATIC (mount-time, reactive tag swap unsupported — remount to
change); `children` takes precedence over `label` (`children ?? label`); `css` is
reactive while `tag` is not. Util was MISCHARACTERIZED as an "Element-family
structural wrapper without layout semantics" — the source (Util/component.tsx)
shows it adds NO DOM node of its own: it CLONES its child, injecting
`className`/`style` (props are `{ children, className, style }`, no `tag`/layout).
Corrected the signature + summary + added two mistakes. mistakes[] blocks 6 → 9.
Regenerates the MCP api-reference + llms-full elements sections + docs reference
page. Docs/manifest only — no runtime behavior change.
