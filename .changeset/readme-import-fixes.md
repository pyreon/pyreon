---
'@pyreon/native-router-swift': patch
'@pyreon/native-router-kotlin': patch
'@pyreon/server': patch
'@pyreon/zero-content': patch
---

Fixed three README examples that imported symbols which do not exist.

- **`@pyreon/native-router-swift` / `-kotlin`** taught `import { RouterProvider, RouterView, Link, useNavigate } from '@pyreon/router'`. `Link` has never existed — the export is `RouterLink`. Both blocks also used `createRouter` without importing it.
- **`@pyreon/server`** taught `import { pyreon } from '@pyreon/vite-plugin'`, which is a **default** export. Every other README in the repo had it right.
- **`@pyreon/zero-content`** taught `import { registerExamples } from '@pyreon/zero/client'` — it lives in `@pyreon/zero-content`, and the block imported it from both, aliasing the real one to dodge a clash with the import that does not exist.

None was reachable by an existing gate (native packages are manifest-exempt; none of the blocks was opted into `check-doc-examples`). A new `check-readme-imports` gate now compiles every `@pyreon/*` symbol a package README tells you to import — 603 symbols across 119 packages — and fails on `TS2305`/`TS2724`/`TS2614`.
