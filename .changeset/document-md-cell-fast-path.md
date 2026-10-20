---
'@pyreon/document': patch
---

Faster `md` rendering of tables. A table cell with nothing to escape (no Markdown inline markup characters and no line breaks) is now returned as-is, instead of always going through two `replace` passes. A 500-row report renders about 1.85× faster (131–139 µs → 71–72 µs), with byte-identical output.
