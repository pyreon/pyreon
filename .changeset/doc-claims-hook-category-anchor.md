---
'@pyreon/cli': patch
---

doc-claims gate: the hook-count CLAUDE.md anchor no longer hardcodes the category count (`across 6 categories` → `across \d+ categories`). The category number is anchor text, not the asserted value — bumping hook categories (6 → 7) broke the COUNT gate with a confusing `pattern-not-found` instead of a count mismatch.
