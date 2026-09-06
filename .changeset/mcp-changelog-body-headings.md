---
'@pyreon/mcp': patch
---

`get_changelog` rendered a changeset body's own markdown headings at the same level as the version heading. `## <version>` is the one structural boundary in the output — the thing consumers split on — but changesets inlines a body under its bullet, indented, and the parser strips that indent, so a body written with `## Title` resurfaced at column zero, indistinguishable from a version.

Not hypothetical: the 0.52.0 release carried five changesets whose bodies opened with `## …`, so `formatChangelog(query, { limit: 1 })` — one version — rendered six `## ` lines, and the release PR went red on a test that was right. Main was green only because its CHANGELOG had not been regenerated yet; the defect was in the formatter all along, waiting for the first body with a heading.

Body headings are now demoted by one level and never below h3, so `## ` is reserved for versions by construction. Relative structure is kept (h2→h3, h3→h4); a body h1 floors at h3 rather than becoming a colliding h2. Bodies without headings pass through byte-identical.
