---
'@pyreon/lint': patch
---

`pyreon/no-error-without-prefix` now supports the standard `exemptPaths` rule option (like `no-window-in-ssr` etc.). Lets a project scope the rule off packages whose throws are NOT framework runtime errors — e.g. CLI scaffolders (`create-zero` / `create-multiplatform`), whose `Error`s are user-facing CLI usage/argument messages shown to someone running `npm create`, not runtime errors a Pyreon app developer debugs (and which have their own CLI-tool error voice).
