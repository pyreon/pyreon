# @pyreon/native-runtime-swift

> **PRIVATE / EXPERIMENTAL.** SwiftPM package that compiler-emitted Swift code links against on iOS. Phase 0 scaffold; see [`native-platforms-phase0-roadmap.md`](../../../.claude/plans/native-platforms-phase0-roadmap.md) PR 1 for scope + acceptance criteria.

## What lives here

Four Swift source files under `Sources/PyreonRuntime/`:

| File | Purpose | Status |
|---|---|---|
| `PyreonTokens.swift` | Design-system token tables (spacing, colors, typography). Compiler emits the real table in PR 7a alongside this stub. | Stub |
| `PyreonReactivity.swift` | Adapter helpers between Pyreon's `signal()`/`computed()`/`effect()` and SwiftUI's `@State`/computed properties/`.onChange(of:)`. **Intentionally near-empty** — SwiftUI's primitives ARE the reactive primitives; the compiler emits onto them directly. | Stub |
| `PyreonViewModifier.swift` | `PyreonStylable` marker protocol for the styler emitter's output (PR 7b). | Stub |
| `PyreonStorage.swift` | `@PyreonAppStorage<T: Codable>` property wrapper + `PyreonStorage.{read,write,remove,decodeOrDefault}` helpers. **Real implementation** — collapses the 14-line Codable-Data bridge the compiler currently emits inline to one line at the call site. | **Real** |

The first three carry the FUTURE API surface (namespace + placeholder symbol) so downstream PRs reference the right shape early without blocking on full implementation. `PyreonStorage.swift` is the first module with real, exercised behaviour — Codable-aware UserDefaults persistence.

## PyreonStorage — Codable @AppStorage in one line

`@PyreonAppStorage` is a property wrapper that extends SwiftUI's `@AppStorage` to any `Codable` type. SwiftUI's stock `@AppStorage` only natively persists primitives (`String`, `Int`, `Double`, `Bool`, `URL`, `Data`, `RawRepresentable`). Codable arrays + structs need a hand-written Data bridge — 14 lines per slot. `@PyreonAppStorage` collapses it to one.

```swift
import PyreonRuntime

struct Todo: Codable { var id: Int; var text: String; var done: Bool }

struct TodoApp: View {
    @PyreonAppStorage("todos") private var todos: [Todo] = []
    // Same Binding<[Todo]> projection via $todos as @AppStorage.

    var body: some View {
        List(todos, id: \.id) { todo in
            Text(todo.text)
        }
    }
}
```

Persistence: UserDefaults via `JSONEncoder`/`JSONDecoder`. Identical durability + sync semantics to stock `@AppStorage(Data)`. Failure semantics: silent fallback to default on decode failure, silent drop on encode failure — matches web `@pyreon/storage`'s localStorage behaviour for corruption + quota errors. For explicit error handling outside View contexts: `PyreonStorage.read(_:key:)` / `.write(_:key:)` throw on failure.

**Compiler interaction.** The PMTC compiler currently emits the verbose 14-line inline bridge for every `useStorage<T>('key', default)` source call (per G5 + the Phase 2 Codable-Data PR). The next compiler-emit pass simplification will detect that pattern and emit the one-liner `@PyreonAppStorage` form instead — same persistence, dramatically simpler emit. Until that emit change lands, this property wrapper is also usable by hand-written SwiftUI code; both shapes back onto the same UserDefaults key, so they're interchangeable per-callsite.

## Smoke tests

`Tests/PyreonRuntimeTests/PyreonRuntimeTests.swift` exercises every public symbol — proves the package builds, links, and tests cleanly. Real functional tests land per-feature alongside the implementations.

## Build / test locally

Requires macOS with Xcode 15+ (Swift 5.9, iOS 17 target).

```bash
cd packages/native/runtime-swift
swift build
swift test
```

The npm scripts gracefully skip when `swift` isn't on PATH (Linux dev machines, CI runners without the Swift toolchain), so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups.

## Why so empty?

Per the PMTC strategic plan ([`#764`](https://github.com/pyreon/pyreon/pull/764)) and the Phase 0 roadmap ([`#797`](https://github.com/pyreon/pyreon/pull/797)):

> SwiftUI's `@State` IS the reactive primitive — Pyreon doesn't ship its own observable wrapper layer in production. The compiler emits onto SwiftUI's primitives directly. The runtime exists only for the FEW cases where the structural mapping needs a small helper (effect-with-dep-list tracking, signal-to-Combine bridging for legacy consumers).

The Phase 0 risk register flags: if this package grows past ~500 LOC of Swift, that's a signal the compiler emit shape is wrong and we should regroup. **Current size: ~280 LOC** (~80 stubs + ~200 real PyreonStorage).

## Phase 0 dependencies

This package is the foundation for **PRs 2, 3, 4, 7a, 7b, 7c, 8** per the roadmap. Every PR that touches iOS output needs this package to exist.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
