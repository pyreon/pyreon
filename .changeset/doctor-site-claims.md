---
'@pyreon/cli': patch
---

`pyreon doctor` (doc-claims) now keeps the marketing site's counts from going stale by construction: the site content carries `{{@key}}` placeholders for counts that are facts about the repository (anti-patterns, products, lint rules and categories, MCP tools, hooks, packages), resolved from their sources when the site is built, and the gate refuses a count written in digits in those sentences and a placeholder it cannot resolve. The package count stays one named constant in the content set (`_counts.json`), which holds the maintainer's decision instead of the repository's published count.
