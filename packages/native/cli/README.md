# @pyreon/native-cli

> **EXPERIMENTAL — published, part of the fixed native release group.** The `pyreon-native` build CLI for the Pyreon Multi-Target Compiler (PMTC).

Wraps [`@pyreon/native-compiler`](../compiler/README.md) in a CLI that walks a directory of `.tsx` files and emits per-target native source (Swift/SwiftUI or Kotlin/Jetpack Compose), plus the authoring-loop, asset, web-bundle, and native-source-wiring commands a scaffolded multiplatform app's `package.json` scripts shell out to (see [`@pyreon/create-multiplatform`](../../zero/create-multiplatform/README.md)).

## Install

Published under `publishConfig.access: public`; scaffolded apps get it as a `devDependency` automatically. To use it standalone:

```bash
npm install -D @pyreon/native-cli
# or, one-off:
npx @pyreon/native-cli build --target=ios --source=./src --out=./generated
```

The package installs the `pyreon-native` binary.

## Commands

```text
pyreon-native build     --target=<ios|android|all> --source=<dir> --out=<dir>
pyreon-native check     [--target=<ios|android>] [--typecheck] [--watch] [--json] --source=<file|dir>
pyreon-native check     --lsp
pyreon-native assets    --target=<ios|android|web> --source=<dir> --out=<dir>
pyreon-native stage-web --target=<ios|android> --source=<dir> --out=<dir>
pyreon-native wire      [--app=<dir>] [--android-out=<file>] [--ios-out=<dir>] [--json]
pyreon-native --help
```

| Command | Does |
| --- | --- |
| `build` | Compiles a source tree to Swift and/or Kotlin, writing files to disk. |
| `check` | The **authoring-loop** command — runs the compiler for one or both targets **in memory**: no build, no xcodegen/gradle, no file writes. Reports transform errors + unsupported-TypeScript-subset warnings per file. |
| `assets` | Materializes a shared `assets/` directory of images into the platform's bundled format. |
| `stage-web` | Copies a flat local web bundle into the exact location a `<WebView>` host resolves `src="..."` against. |
| `wire` | Resolves the app's native source roots (base runtime/router + co-located feature `native/{swift,kotlin}/` dirs) by walking `node_modules` upward — hoisting/pnpm-symlink-safe. |

Exit codes: `0` success, `1` usage error, `2` a compiler/build error (or, for `wire`, a package that declares native sources whose directory is missing).

### `build`

```bash
pyreon-native build --target=ios --source=./src --out=./generated
pyreon-native build --target=android --source=./src --out=./generated --kotlin-package=com.pyreon.generated
pyreon-native build --target=all --source=./src --out=./generated   # ios/ + android/ in one command
```

| Flag | Description |
| --- | --- |
| `--target=ios\|android\|all` | Required. `all` builds BOTH targets in one invocation, into `<out>/ios` and `<out>/android` — and keeps building the second target even if the first fails, returning the worst exit code, so one run surfaces every error across both platforms. |
| `--source=<dir>` | Required. Directory of `.tsx` files (walked recursively; `.test.tsx` skipped). |
| `--out=<dir>` | Required. Output directory for emitted `.swift`/`.kt` files (mirrors the source tree). With `--target=all`, the `ios/`/`android/` subdirs. |
| `--kotlin-package=<fqn>` | Prepended to every emitted `.kt` file (e.g. `com.pyreon.generated`). Required when the Android host imports the generated code by fully-qualified name (the common case — `kotlinc` validation works without it, but a real Compose app's module loader needs FQNs). Ignored for `swift`. |
| `--fonts=<dir>` | A shared assets directory to scan for bundled fonts — builds the canonical→PostScript-name map the Swift emit needs for `Font.custom`. Android resolves `res/font` at runtime and doesn't use this. |

A `.tsx` file that imports a **web-only** runtime (`@pyreon/runtime-dom` or `@pyreon/runtime-server` — e.g. the scaffold's `entry-web.tsx`) is a web entry point, not shared component source, and is **skipped** (not compiled, not an error) — reported as `skipped N web-only entry file(s)`. Detection is by import, not filename, so it also catches a mis-named web entry and never false-skips a genuinely shared file.

Each emitted file carries a source-map directive (Swift `#sourceLocation`, Kotlin `// pyreon-source:` comment) so downstream debug tooling can trace back to the original `.tsx` source line.

### `check` — the fast authoring-loop command

`build` needs somewhere to write and is bound to a platform toolchain. `check` needs neither — it answers "does this file lower to both targets, and what does it warn about?" without leaving the editor.

```bash
pyreon-native check --source=./src/Counter.tsx           # one file — the edit-loop shape
pyreon-native check --source=./src                        # walk a directory
pyreon-native check --source=./src --target=ios            # narrow to one target (default: both)
pyreon-native check --source=./src --typecheck              # also run `swiftc -typecheck` (macOS only; skips elsewhere)
pyreon-native check --source=./src --watch                  # re-check on every source change (mtime poll)
pyreon-native check --source=./src --json                   # machine-readable findings
pyreon-native check --lsp                                   # stdio LSP server — editor diagnostics, no --source
```

`--typecheck` runs `swiftc -typecheck` over the real Swift emit against the actual SwiftUI SDK, catching type-corruption a syntax-only transform can't (skipped, not failed, on non-macOS). `--lsp` runs the same checks as a stdio LSP server that publishes findings as live editor diagnostics on document open/change — documents arrive over JSON-RPC, so no `--source` is needed. Exit `0` on clean-or-warnings-only, `2` on any error finding.

### `assets`

```bash
pyreon-native assets --target=ios --source=./assets --out=./ios
pyreon-native assets --target=android --source=./assets --out=./android/app/src/main
pyreon-native assets --target=web --source=./assets --out=./public
```

Materializes a shared `assets/` directory of images (`name.png`, `name@2x.png`, `name@3x.png`) into the platform's bundled format: `Assets.xcassets` (`ios`), `res/drawable-*` density buckets (`android`), or a plain copy (`web`).

### `stage-web`

```bash
pyreon-native stage-web --target=ios --source=./web --out=./ios
pyreon-native stage-web --target=android --source=./web --out=./android/app/src/main
```

Copies a flat local web bundle (an `index.html` + sibling `.js`/`.css`) into the exact location the `PyreonWebView` runtime resolves `<WebView src="...">` against — `ios/WebContent` (bundle resources) or `android/.../assets/` (`file:///android_asset/`). Flat-only in this version — nested subdirectories are skipped with a warning.

### `wire`

```bash
pyreon-native wire                                          # print the resolved wiring for cwd
pyreon-native wire --android-out=android/app/pyreon-native.srcdirs
pyreon-native wire --ios-out=ios
pyreon-native wire --json
```

| Flag | Description |
| --- | --- |
| `--app=<dir>` | App directory to resolve from (default cwd; must contain a `package.json`). |
| `--android-out=<file>` | Write the resolved Gradle `srcDirs` list to this file, for `build.gradle.kts` to read. |
| `--ios-out=<dir>` | The Xcode project dir — stages co-located Swift into `<dir>/PyreonNative` and links the SwiftPM runtimes into `<dir>/PyreonPackages`. |
| `--json` | Print the full wiring (srcDirs + iOS SwiftPM packages + co-located sources) as JSON. |

Replaces a scaffold's hand-written, fixed `../node_modules/@pyreon/native-runtime-*` paths — which dangle in a monorepo with hoisting or pnpm symlinks — with paths resolved at build time by walking `node_modules` upward. As more `@pyreon/*` packages cross to native, each contributes its own `native/{swift,kotlin}/` directory; `wire` is what finds and dedupes the growing set instead of it being hand-maintained (and silently going stale) per app. A package that DECLARES native sources whose directory is missing is a real misconfiguration and exits `2`.

## Programmatic API

```ts
import { build, findTsxFiles } from '@pyreon/native-cli'

const result = build({
  target: 'swift',
  source: './src',
  out: './generated',
  kotlinPackage: 'com.pyreon.generated', // ignored for swift
})
console.log(`compiled ${result.filesCompiled} files`)
console.log(result.warnings)            // { file, warning }[]
console.log(result.skippedWebEntries)   // web-only entry files that were skipped
```

```ts
import { resolveNativeSources, findPackageDir } from '@pyreon/native-cli'
// The pure resolution `wire` is built on — for tooling that wants the
// resolved native-source graph without going through the CLI/file writes.
```

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success (or, for `check`, clean-or-warnings-only) |
| `1` | Argv / usage error |
| `2` | Compiler/build error, or (for `check`) at least one error finding, or (for `wire`) a broken native-source declaration |

## Status

Internal-experimental — the CLI, its flag surface, and its output shapes can still change between minor versions. It publishes because a scaffolded `@pyreon/create-multiplatform` app depends on it directly (`build:ios`/`build:android` shell out to it), not because it has committed to API stability yet.

## Documentation

Full multiplatform docs: [pyreon.dev/docs/multiplatform](https://pyreon.dev/docs/multiplatform), [pyreon.dev/docs/native-packages](https://pyreon.dev/docs/native-packages) (the `pyreon-native` CLI section — or `docs/src/content/docs/native-packages.md` in this repo).

## License

MIT
