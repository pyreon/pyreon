---
"@pyreon/document-primitives": patch
"@pyreon/mcp": patch
---

docs(document-primitives): document `DocumentPreview` and `documentTheme` in the manifest. `DocumentPreview` is a paper-sized (A4/A3/A5/letter/legal) browser preview wrapper that ALSO serves as the extraction root (`_documentType: 'document'`, so you don't nest a separate `<DocDocument>`); `documentTheme` is the default colors/fonts/sizes/spacing config for export styling (spread-clone to override — it's a shared module-level object). Source-verified against `DocumentPreview.ts`/`theme.ts`. The re-exported `extractDocumentTree` is already content-covered by the `extractDocNode` entry. Regenerates the MCP api-reference + docs-site reference page.
