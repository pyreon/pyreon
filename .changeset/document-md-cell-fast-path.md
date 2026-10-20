---
'@pyreon/document': patch
---

Faster `md`, `slack` and `teams` rendering. Text with nothing to escape is now returned as-is from the Markdown table-cell, Slack mrkdwn, Teams and Discord escapers, instead of always going through two or three `replace` passes. A 500-row report renders about 1.85× faster in `md` (131–139 µs → 71–72 µs) and in `slack` (177–184 µs → 94–100 µs), and about 15% faster in `teams`. Output is byte-identical.
