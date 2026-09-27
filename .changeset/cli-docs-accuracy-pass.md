---
'@pyreon/cli': patch
'@pyreon/zero-cli': patch
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
'@pyreon/native-cli': patch
---

Documentation accuracy pass over the five CLI packages — no runtime changes. `@pyreon/cli`'s README was missing the `check`/`plain`/`add`/`new`/`mcp`/`atlas`/`loom`/`lathe` commands entirely and undercounted `doctor`'s gates (8/10 instead of 13/15); rewritten against the current source, and the docs site gained `pyreon plain`/`pyreon loom`/`pyreon lathe` sections plus the `dependency-fabric` gate that two reference tables had dropped. `@pyreon/zero-cli`'s docs described `zero create` as a broken, prompt-less "copy the default template" shortcut (its actual pre-fix behavior, per the source's own history comment) instead of the full `@pyreon/create-zero` delegate it is today, and were missing `zero doctor --full` / `zero dev --routes`. `@pyreon/create-zero`'s README was missing the `monorepo` template, the `isr` render mode, `--preset`, the `--with-<feature>`/`--no-<feature>` flags, and `--typed-routes`. `@pyreon/create-multiplatform`'s docs never mentioned `--dir`/`--help`, the kebab-case project-name validation, the non-empty-target-dir refusal, or the generated `lint`/`release:keystore`/`release:android` scripts. `@pyreon/native-cli`'s README still claimed `"private": true` and "not published to npm", which stopped being true when the package started publishing; rewritten to document its full `build`/`check`/`assets`/`stage-web`/`wire` command surface.
