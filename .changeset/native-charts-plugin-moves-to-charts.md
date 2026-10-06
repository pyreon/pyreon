---
'@pyreon/native-compiler': minor
'@pyreon/charts': minor
'@pyreon/native-cli': patch
'@pyreon/native-runtime-swift': patch
'@pyreon/native-runtime-kotlin': patch
---

The `@pyreon/charts` native plugin moves out of `@pyreon/native-compiler` into `@pyreon/charts` itself (`@pyreon/charts/native-plugin`), and the compiler no longer depends on `@pyreon/charts`. Emitted Swift and Kotlin are byte-identical for every golden entry (394, none updated).

`@pyreon/native-compiler` gains what a package-owned plugin of that size needs: a published plugin-author entry `@pyreon/native-compiler/plugin-api` (the IR types, the `EmitContext` / `ParseContext` facades, `forEachExpr`, `substituteIdentifier` and the pure spelling helpers — a plugin imports nothing else from the compiler); `CompilerPlugin.scopes` (compile-time colour-scope providers: the core keeps the `<PyreonUI mode>` / `<ColorModeProvider mode>` plumbing, the plugin supplies the scope value and may declare a scope-only element such as `<ChartThemeProvider>`); and `CompilerPlugin.stubs` + `ValidateOptions.augment` on `validateSwiftWithStubs` / `validateSwiftFilesWithStubs` / `validateKotlin` / `validateKotlinFiles` (the chart engine's type-gate stubs now come from the plugin). `pyreon-native plugins` lists the colour-scope providers.

`@pyreon/charts` ships the plugin (manifest `pyreon.native.plugin`, optional peer on `@pyreon/native-compiler`), so `pyreon-native build|check` loads it when a source file imports the package. Behaviour change: a bare `transform()` / `createCompiler()` call with no discovery no longer lowers `@pyreon/charts` hosts, and `--no-plugins` turns them off — load `@pyreon/charts/native-plugin` yourself in that case. The engine generator moved with the registry it writes (`bun packages/fundamentals/charts/scripts/gen-native-engine.ts`); the generated runtime engine files only change their header comment.

`@pyreon/native-cli`: plugin discovery now defaults the app to the package containing `--source` (not the working directory), so a monorepo example built from the repo root finds the libraries ITS package declares; and the source entry (`bun …/cli.ts build`, what the repo's example build scripts run) now goes through `mainWithPlugins` like the shipped bin, instead of the plugin-less `main` — which would have compiled every plugin-owned library as if it had no native lowering.
