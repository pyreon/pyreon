---
'@pyreon/cli': patch
---

`pyreon doctor` (doc-claims) now also checks three numbers the marketing site states: the product count against the product list, the anti-pattern total against the catalog, and the package count against one named constant in the site's content set (`_counts.json`), which holds the maintainer's decision instead of the repository's published count.
