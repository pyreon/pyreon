---
'@pyreon/charts': minor
---

Add an explicit reactive option update policy to `OptionChart`. Applications can recursively merge partial updates, replace the complete option, or replace selected top-level component collections while merging the rest. Component collections match entries by stable id, then name, then position, and caller-owned objects are never mutated.
