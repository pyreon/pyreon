---
'@pyreon/cli': minor
---

`pyreon upgrade` gains two codemods for the 0.55 API freeze: `form-use-form-fields` rewrites the removed `useForm({ fields: [field(…)] })` shape to `useForm({ initialValues, validators })`, and `internal-exports-subpath` moves imports of every export that left a public entry to its new `./internal`, `./internal-server` or `@pyreon/core/compat` subpath. A codemod can now name more than one package it migrates (`alsoMigrates`).
