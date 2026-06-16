---
"@pyreon/create-zero": patch
---

fix(create-zero): two launch-blocking scaffolder bugs

Both made `npm create @pyreon/zero` fail for real users on 0.32.0.

1. **Startup crash (ENOENT).** `generators/package-json.ts` read create-zero's
   own `package.json` via `resolve(import.meta.dirname, '..', '..', ...)` —
   correct for the SOURCE location (`src/generators/`) but wrong once the build
   flattens every module into one `lib/index.js` (where `import.meta.dirname`
   is `lib/`, one level under the root). The two-level `..` overshot to a
   non-existent path; as a module-level `const` it threw at IMPORT time,
   crashing EVERY invocation before any scaffold logic ran. The tests passed
   because they run against SOURCE, not the bundle. Fixed with one top-level
   `src/own-version.ts` (correct in both source-run and bundled-run), imported
   by both `generators/package-json.ts` and `scaffold.ts`.

2. **`workspace:` deps in scaffolded projects.** The `email` integration
   hardcoded `@pyreon/document-primitives` / `document` / `connector-document`
   as `workspace:^` — the monorepo-internal protocol, which fails to resolve in
   any scaffolded (non-workspace) project. So `install` broke for every app
   that selected the email integration, incl. the **dashboard** template by
   default. Fixed to the published version range (via `own-version.ts`); added
   a regression test asserting no `@pyreon/*` dep ever uses `workspace:`.

Verified end-to-end: all 4 templates (app/blog/dashboard/monorepo) scaffold +
`install` + `build`, and the app template boots (`zero dev` serves HTTP 200).
