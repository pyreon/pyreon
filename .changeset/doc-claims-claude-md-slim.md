---
'@pyreon/cli': patch
---

`pyreon doctor`'s doc-claims gate no longer checks CLAUDE.md for the hook count or the document output-format count. Both claims lived in the package table, which was slimmed away, so the gate reported "pattern not found" for text that had been deleted on purpose — a finding nobody could act on, failing for every contributor. Both numbers are still guarded at the sites that carry them (the package READMEs, the hooks manifest, the docs index, the root README), and those still fail on drift; 23 claim sites remain checked.
