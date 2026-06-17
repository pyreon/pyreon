---
'@pyreon/create-zero': patch
---

fix(create-zero): interactive "Custom — pick features one by one" no longer crashes

Picking the Custom feature preset crashed with `TypeError: Cannot read
properties of undefined (reading 'label')`. The `state` and `ui` feature
categories (and the `full` preset) referenced `state-tree` / `coolgrid`, but
those keys were never defined in `FEATURES` — so the grouped-multiselect builder
dereferenced `undefined`. The `full` preset was broken the same way for any
non-interactive run too.

- Add `state-tree` (@pyreon/state-tree) and `coolgrid` (@pyreon/coolgrid) to
  `FEATURES` — they are real packages the categories intend to offer.
- Extract the picker's option builder into `buildGroupedFeatureOptions`, which
  now throws a clear, named error if any category key is missing from
  `FEATURES` (instead of a cryptic `reading 'label'`).
- Comprehensive new tests: feature-data integrity invariants (every
  category/preset/template key must exist in `FEATURES`), a scaffold matrix over
  every template × renderMode × adapter × preset (+ compat / packageStrategy /
  integrations / aiTools), and a mocked-clack interactive `runPrompts` flow that
  drives the exact Custom path — all bisect-verified to catch this bug.
