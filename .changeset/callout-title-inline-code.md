---
'@pyreon/zero-content': patch
---

A callout title renders its inline code. `:::tip{title="`by`, not `key`"}` used to print the backticks; the spans now render as `<code>`, and the callout's accessible name is the title without them. An unmatched backtick stays literal.
