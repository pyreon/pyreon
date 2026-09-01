---
title: Native Packages
description: The six published packages behind PMTC — the compiler, its CLI, and the four Swift/Kotlin runtimes that emitted code links against.
---

The multiplatform story is told from the app's side in [Multi-Platform (PMTC)](/docs/multiplatform). This page is the other side: the **six packages** that story runs on. All six are published to npm; none of them had a page until now, which made them hard to reason about when one showed up in a lockfile or an error message.

:::warning{title="Experimental"}
Every one of these ships with `PRIVATE / EXPERIMENTAL` in its npm description. They are published because the toolchain needs to resolve them — a scaffolded app installs them like any other dependency — not because their APIs are settled. Treat them as internals of the PMTC toolchain rather than libraries to build against directly.
:::

## The six

| Package | Language | What it is |
| --- | --- | --- |
| [`@pyreon/native-compiler`](/docs/multiplatform) | TypeScript | **PMTC** itself. Transforms Pyreon JSX into Swift (SwiftUI) and Kotlin (Jetpack Compose). |
| `@pyreon/native-cli` | TypeScript | The `pyreon-native` binary — walks a source directory and drives the compiler. |
| `@pyreon/native-runtime-swift` | **Swift source** | What emitted Swift links against on iOS. |
| `@pyreon/native-router-swift` | **Swift source** | `@pyreon/router`'s API surface on iOS. |
| `@pyreon/native-runtime-kotlin` | **Kotlin source** | What emitted Compose links against on Android. |
| `@pyreon/native-router-kotlin` | **Kotlin source** | `@pyreon/router`'s API surface on Android. |

## Why four of them ship source

The runtime and router packages contain **no JavaScript at all**. `native-runtime-swift` ships `Package.swift` and `Sources/`; `native-runtime-kotlin` ships `src/`. There is no `lib/`, no `main`, nothing a bundler could resolve.

That is deliberate, and it is why they are on npm rather than in SwiftPM's registry or Maven Central. A multiplatform Pyreon app is a **JavaScript project first** — its dependency graph, its lockfile and its version resolution all live in `package.json`. Publishing the Swift and Kotlin sources through the same channel means one `bun install` puts every platform's runtime at a known, version-locked path, instead of asking you to keep three package managers in agreement about which version of Pyreon you are on.

The consequence is that the platform build tools consume them **from `node_modules` by path**, not as registry dependencies.

### iOS — a local SwiftPM package

XcodeGen references the installed directory:

```yaml
packages:
  PyreonRuntime:
    path: ../../packages/native/runtime-swift
  PyreonRouter:
    path: ../../packages/native/router-swift
```

The PMTC emit header imports `PyreonRuntime` and `PyreonRouter` unconditionally, so both references are required even for an app that never mentions the router.

### Android — Gradle source directories

Kotlin aggregates any number of `srcDir`s into one compilation, so each package is simply another source root on the app module:

```kotlin
sourceSets {
    getByName("main") {
        kotlin {
            srcDir(".../packages/native/runtime-kotlin/src/main/kotlin")
            srcDir(".../packages/native/router-kotlin/src/main/kotlin")
            // …plus one per co-located feature runtime
        }
    }
}
```

Same reason: the emit header imports `com.pyreon.runtime.*` and `com.pyreon.router.*` unconditionally.

:::note{title="`pyreon-native wire` computes this list for you"}
The set of source roots grows as you use more libraries — each fundamentals package that crosses to native contributes its own `native/kotlin/` directory. `pyreon-native wire` resolves them in dependency order, deduplicated, and can write the Android list to a file for Gradle to read. Hand-maintaining that list is how a co-located runtime goes missing and the app fails to compile with an unresolved reference.
:::

## `pyreon-native` — the CLI

```text
pyreon-native build     --target=<ios|android|all> --source=<dir> --out=<dir>
pyreon-native check     [--target=<ios|android>] [--typecheck] [--watch] [--json] --source=<file|dir>
pyreon-native check     --lsp
pyreon-native assets    --target=<ios|android|web> --source=<dir> --out=<dir>
pyreon-native stage-web --target=<ios|android> --source=<dir> --out=<dir>
pyreon-native wire      [--app=<dir>] [--android-out=<file>] [--json]
```

| Command | Does |
| --- | --- |
| `build` | Compiles a source tree to Swift and/or Kotlin, writing files. |
| `check` | The **authoring-loop** command — runs the compiler for both targets **in memory**: no build, no xcodegen, no gradle, no file writes. Reports transform errors and unsupported-TypeScript-subset warnings per file. |
| `assets` | Materializes bundled images and fonts into the platform's expected layout. |
| `stage-web` | Stages a web bundle for the [WebView host](/docs/multiplatform). |
| `wire` | Resolves the native source roots an app needs (see above). |

Exit codes: `0` success, `1` usage error, `2` a compiler error on a source file.

### `check` is the one to reach for

`build` needs somewhere to write and is bound to a platform toolchain. `check` needs neither, which makes it the fast inner loop: it answers "does this file lower to both targets, and what does it warn about?" without leaving the editor.

`--typecheck` additionally runs `swiftc -typecheck` over the Swift emit, catching what the transform cannot — a lowering that is syntactically fine and does not compile. `--lsp` runs the same thing as a stdio LSP server, so the warnings arrive as editor diagnostics instead of terminal output.

## What to read next

- [Multi-Platform (PMTC)](/docs/multiplatform) — the architecture, the primitive vocabulary, the capability matrix.
- [PMTC Supported TypeScript](/docs/pmtc-supported-typescript) — the subset the compiler lowers, and what it refuses.
- [PMTC Library Status & Authoring](/docs/multiplatform-libraries) — which `@pyreon/*` packages cross to native, and how a package declares that it does.
- [PMTC Per-Target Setup](/docs/pmtc-per-target-setup) — the Xcode and Gradle side in full.
- [Create Multi-Platform](/docs/create-multiplatform) — the scaffolder that wires all of the above.
