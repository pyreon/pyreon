---
'@pyreon/loom': minor
---

`loom scan` reports a `loom.ignore` entry that matched no finding as a `stale-ignore` warning (overridable with `loom.severity`). The defect such an entry excused is gone, or its `pkg` / `dep` / `code` never matched; left in place it would suppress the next finding that happens to fit it. Under `--no-imports`, entries for the lexical codes are not judged. A repo with stale entries will see new warnings, which fail `--strict` until the entries are removed or corrected.
