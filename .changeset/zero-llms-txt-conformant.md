---
'@pyreon/zero': patch
'@pyreon/zero-content': patch
---

The `llms.txt` files Zero writes now always pass Lighthouse's Agentic Browsing `llms-txt` audit, which wants an H1 and at least one Markdown link. `aiPlugin` puts a blank line between the `# name` title and the `> description` summary (the llmstxt.org shape) and ends the file with an `## Optional` link to the `llms-full.txt` it also writes, so an app with no static page (only dynamic or API routes) no longer gets a file without links. Zero Content's `seo.llms` no longer writes a bare `# Title` file when no collection has a published entry; it writes nothing and warns, since a missing `llms.txt` is "not applicable" to the audit while one without links fails it.
