# @pyreon/native-compiler

> **PRIVATE / EXPERIMENTAL.** This package is not published. It is part of the **Pyreon Multi-Target Compiler (PMTC)** exploration — see [`.claude/plans/native-platforms.md`](../../../.claude/plans/native-platforms.md) for the strategic direction.

Compiles Pyreon JSX source to native Swift (SwiftUI) and Kotlin (Jetpack Compose) source. The output is idiomatic per-platform code that uses platform-native reactive primitives (`@State` / `MutableState`) — no JS runtime, no bridge.

## Status

- **Phase 0 (foundation)**: This PR — Pyreon JSX → string-in, string-out compilation with snapshot tests for 7 fixtures.
- **Not yet**: iOS simulator / Android emulator integration, full Pyreon framework component compilation, styler/rocketstyle emitters, type mapper for generics/async/error types.

## Usage (internal)

```ts
import { transform } from '@pyreon/native-compiler'

const swiftSource = transform(pyreonJsxSource, { target: 'swift' })
const kotlinSource = transform(pyreonJsxSource, { target: 'kotlin' })
```

## Compile-validation harness

Snapshot tests prove "the emit equals what it equalled last time." They do NOT prove "the emit is valid Swift / Kotlin." A compile-validation harness in [`src/validate.ts`](src/validate.ts) closes that gap by piping emitted source through the actual language compilers.

| Target | Tool | Mode |
|---|---|---|
| Swift | `swiftc -parse` | Parse-only, no semantic analysis. Catches syntax errors. Accepts unresolved type references (the SwiftUI stdlib isn't available at parse time — semantic analysis is the *compile* step's job). |
| Kotlin | `kotlinc` + Compose stubs | `kotlinc` has no parse-only flag, so this path uses a tiny Compose stubs file ([`src/kotlin-stubs.ts`](src/kotlin-stubs.ts)) to satisfy semantic analysis without depending on real Jetpack Compose (which would require Gradle + Android SDK). Stubs cover only the API surface our emitter touches (`@Composable`, `mutableStateOf`, `derivedStateOf`, `remember`, `Text`, `Button`, `LazyColumn`, `Column`, `items`). Real apps compile against actual Compose, not stubs. |

**Auto-enabled** when the tool is on PATH. Tests skip with an informative message when the tool is absent — typical local dev on macOS has `swiftc`; Linux dev machines and CI runners typically don't.

Env vars:
- `PYREON_SKIP_NATIVE_VALIDATE=1` — force-skip even when tools are available (e.g., to bypass during a quick test run).
- `PYREON_REQUIRE_NATIVE_VALIDATE=1` — fail (instead of skip) when tools are absent. Set in CI environments where the toolchain SHOULD be installed.

## Coverage (this PR)

7 fixtures, each compiling to both Swift + Kotlin:

1. Stateless component
2. Single signal (`signal<T>(initial)`)
3. Computed value (`computed(() => …)`)
4. Event handler (`onClick`)
5. Two signals + dependent computed
6. `<For>` keyed list
7. `<Show>` conditional render

Snapshot-tested via vitest. The fixtures live in [`src/fixtures/`](src/fixtures/); expected outputs are inline snapshots in [`src/tests/`](src/tests/).

## Why these 7

Each fixture exercises one structural mapping from the chosen-direction plan's mapping table:

| Fixture | Pyreon construct | SwiftUI / Compose primitive |
|---|---|---|
| 1 | static component body | `View` / `@Composable fun` |
| 2 | `signal<T>(initial)` | `@State` / `mutableStateOf` |
| 3 | `computed(() => …)` | computed property / `derivedStateOf` |
| 4 | `onClick` event handler | `Button(action:)` / `Button(onClick:)` |
| 5 | multi-signal dependency | shows the dep graph translates |
| 6 | `<For each={…} by={…}>` | `ForEach` / `LazyColumn { items() }` |
| 7 | `<Show when={…}>` | `if …` view builder / composable |

Together they cover the **minimum sufficient surface** to claim "the structural mapping works." Subsequent PRs grow the surface (props, styling, more widgets).

## Privacy

This package is marked `"private": true` in `package.json` and is excluded from npm publishing, the `llms.txt` / `llms-full.txt` AI-facing surfaces, the `docs/` site, and MCP `get_api`. Internal-only until the PMTC direction reaches a state worth publishing.
