---
'@pyreon/document': minor
---

**The four binary-format libraries are now OPTIONAL PEER dependencies instead of `optionalDependencies`.** `optionalDependencies` reads as "optional" and is not — every package manager installs them by default (the field means "tolerate an install failure", which is why `@pyreon/compiler` uses it correctly for platform binaries). So every consumer of `@pyreon/document` was force-fed pdfmake + docx + exceljs + pptxgenjs whether or not they ever emitted a binary format, carrying both their install weight and their CVE surface — two live advisories reached consumers this way (exceljs → a vulnerable `uuid`, pptxgenjs → a vulnerable `image-size`).

The renderers were always written for peer semantics: each one `await import()`s its library and throws a named, actionable error when it is missing. This aligns the manifest with the code.

**Action required if you emit a binary format**: install its library alongside `@pyreon/document` — `bun add pdfmake` (PDF), `docx` (DOCX), `exceljs` (XLSX), `pptxgenjs` (PPTX). Every text format (HTML, Markdown, SVG, text, email, chat, JSON/JSONL, CSV) is built in and needs nothing extra. A missing library fails with the install command in the message rather than silently.
