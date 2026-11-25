---
'@pyreon/lint': patch
'@pyreon/mcp': patch
'@pyreon/loom': patch
'@pyreon/code': patch
'@pyreon/document-primitives': patch
'@pyreon/connector-document': patch
---

Docs drift fixes. lint: the VS Code `pyreonLint.preset` setting now lists every preset (`best-practices`, `readable` and `readable-strict` were missing) and actually reaches the language server, which uses it for files with no `.pyreonlintrc.json` (a project's own config still wins); before, the setting was never sent. mcp: the missing-catalog message says `bunx @pyreon/atlas scan` (an unscoped `bunx atlas` runs an unrelated npm package). loom: the cycles view says what the detector checks (declared `dependencies` + `peerDependencies`), not "runtime imports". code: the size note matches the measured figure (about 131 KB gz, at parity with `@uiw/react-codemirror`). document-primitives / connector-document: `DocHeading` takes `level="h1"`…`"h6"`.
