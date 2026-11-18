---
'@pyreon/code': patch
---

Indent guides are drawn only inside a line's leading whitespace. They were a repeating background on every line, so the default `highlightIndentGuides: true` striped the full width of each line, past its indentation and its text. Guides now line up with the indentation columns (they started in the line's left padding before), and unindented lines have none.
