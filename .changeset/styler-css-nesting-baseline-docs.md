---
"@pyreon/styler": patch
---

docs: cite concrete browser baseline for native CSS Nesting

The styler emits `&:hover{}` native CSS nesting and requires Chrome/Edge
112+ (Apr 2023), Safari 16.5+ (May 2023), Firefox 117+ (Aug 2023). The
README previously said "modern browsers" without concrete versions.
Docs-only — no code change.
