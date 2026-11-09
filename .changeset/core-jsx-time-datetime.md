---
'@pyreon/core': patch
---

JSX types: `<time datetime>`, `<blockquote cite>`, `<q cite>`, `<del>` and `<ins>` (`cite`, `datetime`), and `<data value>` now type-check. Before, these standard attributes were type errors.
