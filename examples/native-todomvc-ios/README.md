# native-todomvc-ios — PMTC TodoMVC reference

> **PRIVATE / EXPERIMENTAL.** Reference compile target for the PMTC TodoMVC arc — the canonical "non-trivial but not contrived" Pyreon app. As of post-Phase-2 closure, **the emitted Swift typechecks-clean** (0 errors via `swiftc -typecheck`). 5 named gaps closed + 7 Phase-2 hardening PRs landed; G7 / G8 deferred to Phase 3.
>
> **Multiplatform note:** the canonical TodoMVC source lives here at [`src/TodoApp.tsx`](src/TodoApp.tsx). The Android sibling [`native-todomvc-android`](../native-todomvc-android/) **reads from this same file** — proving the PMTC contract that one Pyreon source compiles to both SwiftUI AND Compose. **Both emits are now typecheck-clean** against their respective compiler-stub harnesses (Swift: `swiftc -typecheck` via `validate-swift.test.ts`; Kotlin: `kotlinc + K4 stubs` via `validate-kotlin.test.ts` K-FINAL gate). Phase 2 closed on both platforms.

## Open in Xcode (one command)

```bash
./scripts/xcode-setup.sh       # compiles src/*.tsx → generated/, then runs xcodegen
open PyreonTodoMVC.xcodeproj   # ⌘+R to run on Simulator
```

Requires `xcodegen` (`brew install xcodegen`) and Xcode 15+ targeting iOS 17+.

Inside Xcode, the project's `preBuildScript` re-runs the compile loop on every build — source edits in `src/TodoApp.tsx` are picked up the next time you hit ⌘+B.

## What this exists for

TodoMVC is the canonical "non-trivial but not contrived" app — every UI framework uses it as a baseline. For PMTC it's the structural test of whether the full compiler stack handles real-app shape, surfacing every spot where the chosen mapping breaks down.

This example is the SOURCE (`src/TodoApp.tsx`) that `pyreon-native build` consumes. The emit lands in `generated/` (gitignored, produced on `./scripts/build.sh` OR automatically on every Xcode build via the `project.yml` preBuildScript).

## Current state

The compiler emits a **typecheck-clean** Swift translation. Working:

- Component structure (`struct TodoApp: View`)
- Signal declarations (`@State private var filter`, `draft`)
- Static JSX layout (VStack, HStack, TextField, ForEach, Button)
- Direct event handlers (`{ filter = "all" }`)
- The TodoRow child component + prop forwarding

Not yet working (each tracked as a gap-closure PR in [`compile-baseline test`](../../packages/native/compiler/src/tests/todomvc-baseline.test.ts)):

| Gap | Source pattern | What it needs |
|---|---|---|
| G1 | `<TextField value={draft} onInput={...}>` | Two-way binding emission: Swift `TextField("...", text: $draft)`, Kotlin direct mapping |
| G2 | `onKeyDown={(e) => e.key === 'Enter' && fn()}` | Pattern-match → `.onSubmit { ... }` on Swift, `KeyboardActions(onDone)` on Kotlin |
| G3 | `todos.set([...todos(), x])` | Immutable spread vs platform mutation choice |
| G4 | `todos.set(todos().map(t => t.id === id ? {...t, done: !t.done} : t))` | Object-in-array partial update idiom |
| G5 | `useStorage<T>(key, default)` | `@AppStorage` on Swift, `DataStore` on Kotlin |
| G6 | `type Filter = 'all' \| 'active' \| 'completed'` | Native enum emission (`enum Filter: String { case all, active, completed }`) |
| G7 | `<TodoItem state={todo.done ? 'completed' : 'active'}>` | Hoist conditional dim expression to modifier call site |
| G8 | URL-hash filter sync | `@pyreon/router-ios`/`-android` (Phase 3) |

Plus three parser-side gaps surfaced by the actual compile that the walkthrough didn't name:

- **Parser-A** — BlockStatement arrow bodies (`const addTodo = () => { ... }`) — needed for all 4 mutation functions
- **Parser-B** — UnaryExpression in arrow bodies (`!t.done` in filter callbacks)
- **Parser-C** — LogicalExpression (`a && b()` in the keyboard handler)

## Run the compile baseline now

```bash
./scripts/build.sh
cat generated/TodoApp.swift  # see the current partial emit
```

The full compile-baseline is also locked in as a snapshot test under `@pyreon/native-compiler` (`src/tests/todomvc-baseline.test.ts`). Each gap-closure PR updates the snapshot to show the improved emit + reduces the warning count by one.

## Why a separate example vs. embedding in the compiler tests

Three reasons:

1. **Real-app shape is the test.** A test that uses synthetic fixtures can't surface the integration issues that a multi-component multi-feature app does. TodoMVC is structurally larger than the 7 starter fixtures combined.
2. **The Phase 1 deliverable is a working TodoMVC running on the iOS simulator.** Per `native-platforms-phase1-roadmap.md`, that's the end-of-Phase-1 milestone. Having the source in `examples/` (not under tests/) means it can be built, opened in Xcode, run on simulator — exercising the full chain.
3. **Snapshot tests are the regression gate.** The compile-baseline test in `@pyreon/native-compiler` snapshots the current emit; gap-closure PRs update both the emit AND the warning list together so progress is visible and regressions trip immediately.

## Privacy

This example is marked `"private": true` and excluded from npm publishing. Internal-only during PMTC's experimental phase.
