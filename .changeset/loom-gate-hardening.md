---
"@pyreon/loom": minor
"@pyreon/charts": patch
"@pyreon/code": patch
"@pyreon/document": patch
"@pyreon/runtime-dom": patch
"@pyreon/zero-content": patch
"@pyreon/compiler": patch
"@pyreon/primitives": patch
---

`@pyreon/loom`: the phantom detector now recognizes the DefinitelyTyped
pattern (a declared `@types/x` twin satisfies a type-only import of `x`,
scoped names included), the lexical scanner requires the import KEYWORD to
sit in code (a `from '…'` inside a string — rule messages, fix catalogs,
generated examples — never scans as an import), subtrees with their own
package.json are separate units, and a root `loom.ignore` (reason
REQUIRED) downgrades findings to info with the reason attached — never a
silent drop.

The other packages: devDependency range alignment only (same-major sync
surfaced by `loom scan`); no runtime change.
