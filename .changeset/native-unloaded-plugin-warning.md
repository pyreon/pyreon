---
'@pyreon/native-compiler': patch
---

Warn when a `@pyreon/*` package that lowers through its own native compiler plugin is imported but its plugin is not loaded. Since the package-owned lowering migration, such imports (for example `<PieChart>` from `@pyreon/charts`) were emitted verbatim with no warning and the native build then failed with "cannot find 'PieChart' in scope". The new warning names the package and the fix: declare it in the app's dependencies so the native CLI discovers its plugin, or pass the plugin to `createCompiler({ plugins })`.
