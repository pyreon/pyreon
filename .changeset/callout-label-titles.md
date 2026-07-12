---
"@pyreon/zero-content": minor
---

Callouts: support the `:::type[Title]` bracket form for titles, and catch the bare-text raw-leak footgun.

`:::warning[Peer dependencies]` (the natural Starlight/Docusaurus convention) now lifts the bracketed label to the callout title — previously the label rendered as leading body text and the title was silently dropped. `:::type{title="…"}` still works and wins when both are present.

`:::warning bare text` is NOT valid remark-directive syntax — the opener is rejected and the line ships to the page as literal `:::warning …` text. This shipped 73 times across the docs with zero diagnostics. The plugin now scans parsed paragraphs (skipping fenced code blocks) and warns with the exact fix. A docs-wide test gate locks it so it can't silently return.
