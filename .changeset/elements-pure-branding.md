---
'@pyreon/elements': patch
'@pyreon/coolgrid': patch
---

perf: PURE-form component branding — importing one primitive no longer pays the whole package

Bare top-level `Component.displayName/pkgName/PYREON__COMPONENT = …` assignments are
side effects a bundler must run once any binding of the module is used, so every
component pinned every other: importing just `<Portal>` retained all of
`@pyreon/elements` (7.5KB gz). Brands now ride the export expression
(`/* @__PURE__ */ Object.assign(Component, {…})` — same object identity, call sites
and stack traces unchanged), making each component droppable when unused.

Measured (minified+gzipped, `@pyreon/*` externalized): Portal 7.50 → 2.39KB (−68%),
Text → 2.41KB, Element → 4.02KB (−46%), List → 4.10KB, Overlay → 5.44KB. Locked by
new `@pyreon/elements::portal` / `::element` entries in the import-budget gate plus a
repo-wide census guard (`no-bare-component-brand.test.ts`).
