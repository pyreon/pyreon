---
'@pyreon/document': minor
---

feat(document): implement json/jsonl renderers + fix two silent-drop bugs (markdown table cell escaping, docx page-break)

- **json / jsonl formats** — previously in the `OutputFormat` type (and documented as "20 output formats" in README/CLAUDE.md) but with NO registered renderer, so `render(doc, 'json')` threw at runtime. Now implemented: `json` serializes the round-trippable `DocNode` tree; `jsonl` emits one content block per line (chunking/embedding/ingestion shape). Added `toJson()`/`toJsonl()` builder methods + `.json`/`.jsonl`/`.ndjson` download extensions.
- **markdown table cell escaping** — a raw `|` in a cell split the column structure (N pipes ⇒ N+1 apparent columns, mismatching the separator row = corrupt GFM table) and a newline broke the row. Cells now escape `\`/`|` and collapse newlines to `<br>`.
- **docx page-break** — `<PageBreak/>` was silently dropped in DOCX (its `processNode` switch had no `case 'page-break'` and no default) while HTML/PDF/md/text all honored it. Now emits a real `<w:br w:type="page"/>`.
- docs: published the primitive × format support matrix; corrected the `download(node, filename, options?)` signature in README + manifest; added a render-throughput bench (`bun run bench:document`).
