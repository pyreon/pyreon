---
"@pyreon/atlas": patch
---

SSR parity no longer reports `hydrated-dom-differs` when hydrated and client-mounted DOM differ only in attribute order. The comparison now serializes both trees with attributes in a canonical order (on detached clones); node, text, attribute-value (including `class`), child-order changes and renderer-reported mismatches still fail.
