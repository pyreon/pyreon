---
'@pyreon/cli': patch
---

`pyreon doctor`'s doc-claims gate now checks every count of the canonical primitives in the files that carry it, however the count is phrased. It used to check only exact phrases such as "the N canonical primitives", so "21 primitives plus Transition…" on the primitives page and "all N canonical primitives" in the multiplatform guide went unchecked, and both were stale.
