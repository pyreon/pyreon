---
'@pyreon/loom': minor
---

`loom scan` reports a `loom.ignore` entry that does nothing as a `stale-ignore` warning (overridable with `loom.severity`): one that matches no finding at any severity (the defect it excused is gone, or its `pkg` / `dep` / `code` never matched), or one that every match of is already taken by an earlier entry (shadowed). An entry for a live `info` finding is not stale. The finding points at the file the entry is declared in. Under `--no-imports`, entries for the lexical codes are not judged. A repo with stale entries will see new warnings, which fail `--strict` until the entries are removed or corrected.
