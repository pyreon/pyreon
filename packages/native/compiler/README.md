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

## Compiler plugins (experimental API v1)

The shared frontend parses once. A compiler instance then runs every plugin's
`transformIR`, computes the module namespace, runs `prepareIR` (the built-in
chart runtime first), and dispatches the registered backend. Each phase follows
plugin registration order. Swift/Kotlin remain built in; `transform()` uses a
fixed default instance with no user plugins.

```ts
import { createCompiler, type CompilerPlugin } from '@pyreon/native-compiler'

export const releaseBadge = {
  name: 'release-badge',
  apiVersion: 1,
  transformIR(module) {
    for (const component of module.components) {
      const expr = component.returnExpr
      if (expr.kind === 'jsx-element' && expr.tag === 'ReleaseBadge') {
        component.returnExpr = {
          kind: 'jsx-element', tag: 'Text', attrs: [],
          children: [{ kind: 'text', value: 'Ready for release' }],
        }
      }
    }
  },
} satisfies CompilerPlugin<never>

const compiler = createCompiler({ plugins: [releaseBadge] })
const result = compiler.transform(
  'export function Badge() { return <ReleaseBadge /> }',
  { target: 'swift', filename: 'Badge.tsx' },
)
```

`CompilerModule` is the typed shared IR. Extensions operate within the existing
frontend subset; new TypeScript syntax still requires frontend support. Passes
may mutate their input or return
a complete replacement. `context.source` and frozen `context.options` describe
the invocation; `context.warn(message)` adds an attributed diagnostic. The
filename, target and font mapping come from one invocation snapshot, even if a
callback changes caller-owned options through a closure. Passes
and backend `emit(module, context)` are synchronous. Load asynchronous resources
before `createCompiler()`. Returning a promise is an error.

Use `transformIR` for source semantics and `prepareIR` for external/runtime
metadata. Parsed `module.imports` contains actual import declarations, including
side-effect and type imports. Runtime declarations added during preparation do
not change synthesized module names. To add a target, put
`{ target: 'your-target', emit(module, context) { return { code, warnings } } }`
in a plugin's `backends`. `swiftBackend` and `kotlinBackend` are exported for
explicit delegation. Distinct target names are required: overriding built-in
backends or registering duplicate plugin names/targets is rejected. Unknown
targets fail before parsing. `compiler.targets` lists the frozen registrations.

Registrations and callback references are snapshotted when an instance is
created. Custom callbacks receive isolated IR; later passes and emitters cannot
mutate plugin-owned cached modules or shared chart declarations. This copying
has a cost only when custom callbacks run. Prefer stateless passes; an instance
does not reset mutable state captured inside a plugin's own closure. No plugin
registry grows across calls. Existing emitter internals still contain scoped
state: callbacks run outside emission, and this API does not promise concurrent
or recursive emission through the legacy backends.

The plugin protocol and IR are experimental. Match
`NATIVE_COMPILER_PLUGIN_API_VERSION` (currently `1`); incompatible protocol/IR
changes require an API version bump. Test extensions by compiling both target
outputs with the real validators below. The CLI's `--plugin` accepts local ESM
modules with a default plugin export; CLI target selection remains iOS/Android.

## Compile-validation

Snapshot tests prove "the emit equals what it equalled last time," not "the emit is valid Swift/Kotlin." [`src/validate.ts`](src/validate.ts) closes that gap by piping emitted source through the real language toolchains, at increasing cost/fidelity:

| Function | What it checks | Requires |
|---|---|---|
| `validateSwift(source)` | `swiftc -parse` — syntax only. Accepts unresolved type references (no SwiftUI stdlib at parse time). | `swiftc` on `PATH` |
| `validateSwiftWithStubs(source)` | Real typecheck against hand-written stubs mirroring the SwiftUI/PyreonRuntime surface — the Linux-viable path, since a consumer that generates Pyreon source (the scaffolder, most of all) needs proof the output COMPILES without needing a real Apple SDK. | `swiftc` on `PATH` |
| `validateSwiftTypecheck(source)` | Full typecheck against the real Apple SDK. | macOS + Xcode |
| `validateKotlin(source)` | `kotlinc` against a small hand-written Compose/kotlinx-serialization stub set (no real Jetpack Compose, no Gradle, no Android SDK). | `kotlinc` on `PATH` |

Also exported: `isSwiftcAvailable()`, `isSwiftUIAvailable()`, `isKotlincAvailable()` — toolchain-presence checks the CLI's `check --typecheck` and the test suite use to skip gracefully rather than fail when a toolchain isn't installed.

## Project audit — `@pyreon/native-compiler/audit`

A separate, lightweight entry (it needs only `oxc-parser` and the web-only package map, not the Swift/Kotlin emitters) holding the multiplatform **project audit**: `auditNative(cwd)` scans `.tsx` files that import `@pyreon/primitives` for `web-only-package-import` and `native-unsupported-decl` hazards, and `detectNativePatterns(code, filename?)` is the per-snippet form. It backs `pyreon doctor --check-native` and the MCP `validate` tool, both of which load it lazily and skip with an install hint when this package is not installed. It reads the SAME `WEB_ONLY_PACKAGES` set as the parser's import warning (`src/web-only-packages.ts`, generated from the manifests by `scripts/check-multiplatform-tier.ts`), so the set exists exactly once. A file oxc cannot parse is skipped, as the compiler would refuse it.

## Scope

The subset of TypeScript/JSX this compiler lowers — components, `signal`/`computed`/`effect`, `<For>`/`<Show>`, hooks, `@pyreon/store`/`form`/`query`/`table`/`flow`/…, HTTP + fetch, WebView bridging, and what it explicitly refuses — is documented in full at [PMTC Supported TypeScript](https://pyreon.dev/docs/pmtc-supported-typescript), not duplicated here. [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) covers the architecture and the primitive vocabulary end to end.

`useCounter` and `useToggle` lower to component-local state. Components may
reuse the same local hook name: each keeps its own hook kind, bounds and reset
value, regardless of declaration order or earlier compiler calls. The compiler
releases this metadata after each component.

## Build / test locally

Pure TypeScript — `bun run test` runs the compiler's own suite (parse/emit fixtures, native-equivalence checks, the differential fuzzer). The `validate.ts` tests additionally spawn `swiftc`/`kotlinc` when present and skip gracefully otherwise (`PYREON_REQUIRE_NATIVE_VALIDATE=1` turns an absent toolchain into a hard failure instead, for CI environments where it's expected to exist).

## What to read next

- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the architecture, the primitive vocabulary, the capability matrix.
- [PMTC Supported TypeScript](https://pyreon.dev/docs/pmtc-supported-typescript) — the subset this package lowers, and what it refuses.
- [Native Packages](https://pyreon.dev/docs/native-packages) — this package's place among the other five.
- [`@pyreon/native-cli`](../cli/) — the CLI that walks a source tree and drives this package.
