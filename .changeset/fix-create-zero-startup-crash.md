---
"@pyreon/create-zero": patch
---

fix(create-zero): scaffolder crashed on startup — self-package.json path overshoot

`generators/package-json.ts` read create-zero's own `package.json` via
`resolve(import.meta.dirname, '..', '..', 'package.json')`. That path is
correct for the SOURCE location (`src/generators/`) but the build flattens
every module into one `lib/index.js`, where `import.meta.dirname` is `lib/`
(one level under the package root). The two-level `..` overshot to a
non-existent path; because the read is a module-level `const`, it threw
`ENOENT` at import time and crashed EVERY invocation (`npm create
@pyreon/zero`, `--help`, all flags) before any scaffold logic ran. Shipped
broken since 0.32.0 (regression from #931, 2026-05-25).

Root-cause fix: the self-version read now lives in a single top-level
`src/own-version.ts` (a `src/` file and the flattened `lib/` bundle are BOTH
one level under the root, so a single `..` is correct in source-run AND
bundled-run); `generators/package-json.ts` and `scaffold.ts` both import it.
A subdirectory file structurally cannot satisfy both contexts — which is why
the test suite (source-run) passed while production (bundle-run) crashed.
