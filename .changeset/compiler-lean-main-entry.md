---
"@pyreon/compiler": minor
"@pyreon/vite-plugin": minor
"@pyreon/cli": minor
"@pyreon/mcp": minor
"@pyreon/lint": minor
"@pyreon/atlas": minor
---

`@pyreon/compiler`'s main entry is now TypeScript-free. Everything that parses with the TypeScript compiler API moved behind three new subpaths, so consumers that only need `transformJSX` (the Vite plugin's static graph, test harnesses, bundler integrations) no longer load `typescript`. **Breaking for direct importers — migrate the import path:**

- `@pyreon/compiler/analyze`: `detectReactPatterns`, `hasReactPatterns`, `migrateReactCode`, `diagnoseError`, `detectPyreonPatterns`, `hasPyreonPatterns`, `migratePyreonCode`, `AUTO_FIXABLE_PYREON_CODES`, `analyzeReactivity`, `formatReactivityLens`, `firesToCreationSiteFindings`, `mergeFireDataIntoFindings` (+ types)
- `@pyreon/compiler/audits`: `auditTestEnvironment`, `auditIslands`, `auditSsg`, `auditNative`, `detectNativePatterns`, `auditContent` and the content-audit helpers, their `format*` helpers, `generateContext` (+ types)
- `@pyreon/compiler/validate`: `analyzeValidate`, `emitSchemaSource`, `emitValidator`, `isEmittable` (+ types)

The main entry keeps `transformJSX`, `transformJSX_JS`, `rocketstyleCollapseKey`, `scanCollapsibleSites`, `TPL_HOLE_ATTR`, `transformDeferInline`, the Plain Mode functions, the fs-route convention and island naming. `@pyreon/compiler/diagnose`, `/plain` and `/fs-route-convention` are unchanged.

`transformClientDirectives` (`hydrate="…"` attribute lowering) is removed: nothing in the repo used it. `@pyreon/vite-plugin` now loads its validator rewriting, the islands doctor-lite and the `.pyreon/context.json` scanner lazily, only when those features run. `@pyreon/cli`, `@pyreon/mcp`, `@pyreon/lint` and `@pyreon/atlas` import from the new subpaths.
