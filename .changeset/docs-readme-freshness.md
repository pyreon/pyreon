---
'@pyreon/core': patch
'@pyreon/form': patch
'@pyreon/state-tree': patch
'@pyreon/i18n': patch
---

Docs: correct stale README examples.

- `@pyreon/form`, `@pyreon/state-tree`, `@pyreon/i18n` READMEs documented a
  `formRegistry` / `stateTreeRegistry` / `i18nRegistry` import from their
  `/devtools` subpath, but those subpaths export individual functions
  (`getActiveForms`/`getFormSnapshot`/`onFormChange`, etc.), not a registry
  object — the examples didn't compile. Rewritten against the real API.
- `@pyreon/core` README now documents `useControllableState`, which moved to
  `@pyreon/core` (it's a props primitive, re-exported from `@pyreon/hooks`).
