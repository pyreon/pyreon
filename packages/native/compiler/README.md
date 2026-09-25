# @pyreon/native-compiler

> **EXPERIMENTAL.** The Pyreon Multi-Target Compiler (PMTC) itself. Compiles Pyreon JSX/TSX source to native Swift (SwiftUI) and Kotlin (Jetpack Compose) source — no JS runtime, no bridge, no WebView by default. The output is idiomatic per-platform code driving each platform's own reactive primitives (`@State` / `mutableStateOf`) directly. Published to npm — see [Native Packages](https://pyreon.dev/docs/native-packages) for where this fits among the other five packages behind PMTC.

This package is TypeScript-in, TypeScript-out plumbing: given a source string, it returns a source string. It doesn't walk a directory, write files, or know about Xcode/Gradle — that's [`@pyreon/native-cli`](../cli/), which wraps this package.

## Usage

```ts
import { transform } from '@pyreon/native-compiler'

const { code: swiftSource, warnings } = transform(pyreonSource, { target: 'swift' })
const { code: kotlinSource } = transform(pyreonSource, { target: 'kotlin', filename: 'Counter.tsx' })
```

`transform(source, options)` returns `{ code: string, warnings: string[] }`. `options.target` is `'swift' | 'kotlin'`; `options.filename` (optional) improves parse-error diagnostics; `options.fonts` (optional, `Record<canonicalName, iOSPostScriptName>`) resolves `<Text font="Brand">` to `.font(.custom(…))` on iOS.

## Compile-validation

Snapshot tests prove "the emit equals what it equalled last time," not "the emit is valid Swift/Kotlin." [`src/validate.ts`](src/validate.ts) closes that gap by piping emitted source through the real language toolchains, at increasing cost/fidelity:

| Function | What it checks | Requires |
|---|---|---|
| `validateSwift(source)` | `swiftc -parse` — syntax only. Accepts unresolved type references (no SwiftUI stdlib at parse time). | `swiftc` on `PATH` |
| `validateSwiftWithStubs(source)` | Real typecheck against hand-written stubs mirroring the SwiftUI/PyreonRuntime surface — the Linux-viable path, since a consumer that generates Pyreon source (the scaffolder, most of all) needs proof the output COMPILES without needing a real Apple SDK. | `swiftc` on `PATH` |
| `validateSwiftTypecheck(source)` | Full typecheck against the real Apple SDK. | macOS + Xcode |
| `validateKotlin(source)` | `kotlinc` against a small hand-written Compose/kotlinx-serialization stub set (no real Jetpack Compose, no Gradle, no Android SDK). | `kotlinc` on `PATH` |

Also exported: `isSwiftcAvailable()`, `isSwiftUIAvailable()`, `isKotlincAvailable()` — toolchain-presence checks the CLI's `check --typecheck` and the test suite use to skip gracefully rather than fail when a toolchain isn't installed.

## Scope

The subset of TypeScript/JSX this compiler lowers — components, `signal`/`computed`/`effect`, `<For>`/`<Show>`, hooks, `@pyreon/store`/`form`/`query`/`table`/`flow`/…, HTTP + fetch, WebView bridging, and what it explicitly refuses — is documented in full at [PMTC Supported TypeScript](https://pyreon.dev/docs/pmtc-supported-typescript), not duplicated here. [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) covers the architecture and the primitive vocabulary end to end.

## Build / test locally

Pure TypeScript — `bun run test` runs the compiler's own suite (parse/emit fixtures, native-equivalence checks, the differential fuzzer). The `validate.ts` tests additionally spawn `swiftc`/`kotlinc` when present and skip gracefully otherwise (`PYREON_REQUIRE_NATIVE_VALIDATE=1` turns an absent toolchain into a hard failure instead, for CI environments where it's expected to exist).

## What to read next

- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the architecture, the primitive vocabulary, the capability matrix.
- [PMTC Supported TypeScript](https://pyreon.dev/docs/pmtc-supported-typescript) — the subset this package lowers, and what it refuses.
- [Native Packages](https://pyreon.dev/docs/native-packages) — this package's place among the other five.
- [`@pyreon/native-cli`](../cli/) — the CLI that walks a source tree and drives this package.
