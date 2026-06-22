---
'@pyreon/document': minor
---

feat(document): implement `RenderOptions.baseUrl` — relative image `src` values are now resolved against it before rendering. The field was declared but read by no renderer (a typed-but-unimplemented option). Resolution runs once in `render()`, so every output format (HTML / Markdown / PDF / DOCX / email / …) gets absolute URLs. Already-absolute sources (http/https/`data:`/`blob:`/protocol-relative) pass through unchanged; the pass is immutable and a no-op (same node reference) when no relative image exists.
