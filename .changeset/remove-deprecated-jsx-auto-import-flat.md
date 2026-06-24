---
"@pyreon/vite-plugin": minor
---

Remove the deprecated flat `{ source, names }` shape from `jsxAutoImport` options. Use the `mappings` array instead: `pyreon({ jsxAutoImport: { mappings: [{ source, names }] } })`. The flat form was a back-compat shim with no real consumers (only its own test exercised it); a single-source config is `mappings: [{ source, names }]`. Pre-1.0 cleanup — no behavior change for `jsxAutoImport: true` (the default) or the `mappings` form.
