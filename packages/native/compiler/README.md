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
