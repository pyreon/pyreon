---
'@pyreon/lint': patch
'@pyreon/cli': patch
'@pyreon/loom': patch
'@pyreon/zero-content': patch
---

Accuracy fixes found by a docs audit:

- `@pyreon/zero-content`: a directive opener with bare text after the name (`:::caution Title`, `:::details Label`, `:::math inline`) now warns for ANY name, not only the five callout types — an unknown name never became a directive, so it shipped as literal `:::caution …` text with no diagnostic. `:::math`, `:::mermaid` and `:::details` no longer emit a spurious "Unknown callout directive" warning.
- `@pyreon/loom`: `loom --help` now lists `dev` (it was missing) and files `--json` under `scan`, where it applies.
- `@pyreon/cli`: `pyreon loom` help and docstring name all three loom commands (`scan`, `dev`, `build`).
- `@pyreon/lint`: `prefer-canonical-primitive` no longer cites a stale primitive count; `prefer-isserver`'s JSDoc no longer claims the rule is not auto-fixable.
