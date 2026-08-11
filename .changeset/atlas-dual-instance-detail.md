---
'@pyreon/atlas': patch
'@pyreon/validate': patch
'@pyreon/validation': patch
---

Diagnosability round from an upstream report. `atlas scan`'s dual-instance refusal now prints the TWO resolved framework copies (path + version, extracted from the caught sentinel error's own `A:`/`B:` lines) — the summary alone said "align the versions" while withholding where the second copy lives, sending the reader into node_modules archaeology for a fact the error already carried. A message shape with no `A:`/`B:` lines degrades to the summary standing alone. Plus: `@pyreon/validate` and `@pyreon/validation` READMEs each open with an explicit not-to-be-confused cross-reference (near-identical names, different jobs — validator-you-use vs stack-wide contract/adapters — a documented conflation trap).
