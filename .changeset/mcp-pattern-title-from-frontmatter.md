---
'@pyreon/mcp': patch
---

`get_pattern` takes a pattern's title from the frontmatter `title` and still serves its text starting with exactly one `# <title>` heading: the docs site renders the title itself, so pattern files no longer carry a body heading, and the loader adds one when the body has none (a body with its own heading is left as is).
