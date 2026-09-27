# @pyreon/native-cli

> **EXPERIMENTAL.** The `pyreon-native` binary — build orchestration for the Pyreon Multi-Target Compiler (PMTC). Wraps [`@pyreon/native-compiler`](../compiler/README.md) to walk a source directory, drive the compiler for one or both native targets, and wire the result into an Xcode/Gradle project. Published to npm — see [Native Packages](https://pyreon.dev/docs/native-packages) for where this fits among the other five packages behind PMTC.

You don't usually invoke this directly either — `@pyreon/create-multiplatform` scaffolds pre-build scripts that call it for you (`npx pyreon-native wire --ios-out=…` / `--android-out=…` on every build, `npx pyreon-native build --target=…` where the scaffold needs a one-shot emit). It's documented here, and in full on [Native Packages](https://pyreon.dev/docs/native-packages), for when you're debugging the pipeline or scripting it yourself.

## Commands

```text
pyreon-native build     --target=<ios|android|all> --source=<dir> --out=<dir>
pyreon-native check     [--target=<ios|android>] [--typecheck] [--watch] [--json] --source=<file|dir>
pyreon-native check     --lsp
pyreon-native assets    --target=<ios|android|web> --source=<dir> --out=<dir>
pyreon-native stage-web --target=<ios|android> --source=<dir> --out=<dir>
pyreon-native wire      [--app=<dir>] [--android-out=<file>] [--ios-out=<dir>] [--json]
```

| Command | Does |
|---|---|
| `build` | Compiles a source tree to Swift and/or Kotlin, writing files. `--target=all` builds both, into `ios/` + `android/` subdirectories of `--out`. Each emitted file carries a source-map directive (Swift `#sourceLocation`, Kotlin `// pyreon-source:`) so debug tooling traces back to the original Pyreon source. |
| `check` | The **authoring-loop** command — runs the compiler for both targets **in memory**: no build, no xcodegen, no gradle, no file writes. Reports transform errors and unsupported-TypeScript-subset warnings per file. `--typecheck` additionally runs `swiftc -typecheck`, catching what a syntactically-clean emit can still get wrong. `--lsp` runs the same checks as a stdio LSP server, so warnings arrive as editor diagnostics. |
| `assets` | Materializes bundled images and fonts into each platform's expected layout (`res/drawable*` on Android, an asset catalog entry on iOS). |
| `stage-web` | Stages a web bundle into the app so `<WebView src="…">` can load it from the app bundle — see [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) for the WebView host. |
| `wire` | Resolves an app's Pyreon native source roots (the base runtime/router + every co-located feature `native/swift`/`native/kotlin` directory) in a way that survives hoisting and non-flat installs, and writes the result where each platform's build reads it — see [Native Packages](https://pyreon.dev/docs/native-packages#why-four-of-them-ship-source) for the full mechanism. |

Exit codes: `0` success, `1` usage error, `2` a compiler error on a source file.

## `check` is the one to reach for while authoring

`build` needs somewhere to write and is bound to a platform toolchain; `check` needs neither. It's the fast inner loop: "does this file lower to both targets, and what does it warn about?", without leaving the editor.

```bash
pyreon-native check --source=src/Counter.tsx
pyreon-native check --source=src --json          # whole tree, machine-readable
pyreon-native check --source=src --typecheck      # + a real swiftc typecheck (macOS)
pyreon-native check --lsp                         # stdio LSP server
```

## Programmatic API

```ts
import { build } from '@pyreon/native-cli'

const result = build({ target: 'swift', source: './src', out: './generated' })
console.log(`compiled ${result.filesCompiled} files`)
// result.warnings: { file, warning }[]
// result.skippedWebEntries: string[] — web-only entries (import a web-only
// runtime) the native build correctly skipped rather than silently dropped
```

`resolveNativeSources` / `findPackageDir` / `swiftModules` (also exported) are the resolver family `wire` is built on, for consumers that want the resolved source list without going through the CLI.

## Build / test locally

Pure TypeScript. `bun run test` runs the CLI's own suite, including a real-Vite-build test asserting the shipped `bin/pyreon-native.js` runs under both Node and Bun (the CLI is invoked as `npx pyreon-native …`, i.e. under Node, from a scaffolded app's build scripts — a bin that only ran under Bun would silently do nothing there).

## What to read next

- [Native Packages](https://pyreon.dev/docs/native-packages) — the full command reference, plus how `wire`'s output actually gets consumed on each platform.
- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the architecture and primitive vocabulary this CLI compiles against.
- [`@pyreon/native-compiler`](../compiler/README.md) — the compiler this package wraps.
