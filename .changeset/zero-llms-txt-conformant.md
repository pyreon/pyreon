---
'@pyreon/zero': patch
'@pyreon/zero-content': patch
---

The `llms.txt` files Zero writes now follow the llmstxt.org shape for every app and pass Lighthouse's Agentic Browsing `llms-txt` audit (an H1 and at least one Markdown link). `aiPlugin` puts a blank line between the `# name` title and the `> description` summary; lists dynamic routes and API endpoints as prose before the first `##` section (they are not fetchable URLs, and `##` sections are link lists) instead of `## Dynamic Pages` / `## API Endpoints` sections of bare bullets; and ends the file with an `## Optional` link to the `llms-full.txt` it also writes, so an app with no static page still has a link. `llmsExtra` is appended as written. Zero Content's `seo.llms` no longer writes a bare `# Title` file when no collection has a published entry; it writes nothing and warns, since a missing `llms.txt` is "not applicable" to the audit while one without links fails it.
