---
"@pyreon/zero": patch
"@pyreon/zero-cli": patch
"@pyreon/document-primitives": patch
"@pyreon/coolgrid": patch
"@pyreon/typescript": patch
---

chore: dependency-hygiene fixes from the workspace dependency audit

Declared-vs-actual dependency audit across all 88 workspace packages. No
runtime behavior changes — every fix removes or reclassifies a dependency the
package's shipped code never imports:

- `@pyreon/zero`: removed unused `@pyreon/meta` dependency (legacy from the
  initial monorepo migration; zero mentions in the package).
- `@pyreon/zero-cli`: removed unused `@pyreon/server` dependency (the CLI
  delegates to `@pyreon/cli` via dynamic import and to `@pyreon/create-zero`
  via template-path resolution — both kept; `server` was never referenced).
- `@pyreon/document-primitives`: removed unused `@pyreon/styler` +
  `@pyreon/ui-core` dependencies (its rocketstyle dependency declares its own).
- `@pyreon/coolgrid`: moved `@pyreon/styler` to devDependencies (only its
  browser test imports it; prod src uses core/ui-core/unistyle).
- `@pyreon/typescript`: `@pyreon/core` dependency now uses the workspace
  protocol (`workspace:^`) instead of the pinned `>=0.13.0` range — consistent
  with every other inter-package dependency; the fixed-group release keeps the
  published range aligned with the sibling core release.

(Private packages fixed in the same pass, no changeset needed: `ui-components`
dropped unused `hooks`/`styler` + moved test-only `ui-core` to devDeps;
`ui-primitives` dropped unused `elements`.)
