---
"@pyreon/vite-plugin": patch
---

test(vite-plugin): add 48 real tests for helper functions

48 new tests in `branch-coverage-real.test.ts` covering the exported
helper API: `_isTruthyEnv` truth table, `_getCompatTarget` redirect
matrix for all 5 frameworks (react/preact/vue/solid/svelte) + jsx-runtime
+ jsx-dev-runtime variants, `_isPyreonWorkspaceFile` path filters (empty,
query-strip, null-byte, non-packages, examples-exclusion, walk-to-root,
cache hit), `_skipStringLiteral` end-position semantics (escaped quotes,
single-quote, unterminated), `_extractBalancedArgs` (nested parens,
string-with-parens, unbalanced), `_maskStringsAndComments` /
`_maskCommentsAndStrings` length-preservation, `_computeLineStarts` /
`_offsetToLineCol` mapping, `_collectImportedNames` named/namespace/type
imports, `buildLpihClientScript` / `resolveLpihCachePath` smoke.

Branches lifted 88.35% → 88.52%. Modest gain since most remaining uncov
is in the plugin runtime hooks (config/resolveId/transform/watchChange)
which require integration tests with a real Vite instance.
