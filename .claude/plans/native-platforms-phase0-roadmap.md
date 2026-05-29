# PMTC Phase 0 — PR-by-PR roadmap

**Status**: Companion to [`native-platforms.md`](./native-platforms.md) (PMTC strategic direction, merged in #764). Breaks Phase 0 ("counter on iOS simulator working end-to-end" — see PMTC plan's Honest Timeline) into discrete PRs with scope, dependencies, validation criteria, and effort estimates.

**Anchor**: PR #794 (compiler skeleton — `@pyreon/native-compiler` private package, Pyreon JSX → Swift + Kotlin string emit, 7 fixtures × 2 emitters with snapshot tests) is PR 0. This doc numbers PRs 1-8 starting after that.

**Phase 0 finish line** (from PMTC plan §"Honest timeline"): one Pyreon component compiling to SwiftUI + rendering on iOS simulator, proving the type-mapping and signal-mapping work. Counter app. 2-3 months focused.

**Phase 0 pass/fail criteria** (from PMTC plan §"Validation checkpoints"):

| #   | Checkpoint                     | Pass criterion                                                                          | PRs that close it |
| --- | ------------------------------ | --------------------------------------------------------------------------------------- | ----------------- |
| 1   | **Type mapper coverage**       | ≥90% of existing Pyreon source compiles to Swift without manual annotations             | PRs 5a-5e + 6     |
| 2   | **Signal → @State round-trip** | counter app on iOS simulator with button-driven `signal.set` works                      | PRs 1 + 2 + 3 + 4 |
| 3   | **Style fidelity**             | rocketstyle button rendered in iOS simulator visually identical to web (<5% pixel diff) | PRs 7a-7c + 8     |

If any of the three fail at Phase 0 end, regroup before Phase 1.

---

## TL;DR — the PR sequence

```
PR 0 (#794, MERGED) — Compiler skeleton (parse + emit, string-in/string-out)
        │
        ├──► PR 1 — Swift runtime SPM scaffold (foundational, blocks 2/3/4/7/8)
        │       │
        │       ▼
        │   PR 2 — @pyreon/native-cli scaffold (build orchestration)
        │       │
        │       ▼
        │   PR 3 — First Xcode project at examples/native-counter-ios
        │       │
        │       ▼
        │   PR 4 — Counter Pyreon source + manual integration ◄────── CRITERION 2 PASSES
        │
        ├──► PR 5a — TS→Swift primitive type mapper
        │       │
        │       ▼
        │   PR 5b — Function types + closures
        │       │
        │       ▼
        │   PR 5c — Generics (Signal<T> / Computed<T>)
        │       │
        │       ▼
        │   PR 5d — Union types + nullables
        │       │
        │       ▼
        │   PR 5e — async/Promise → async throws
        │       │
        │       ▼
        │   PR 6 — Coverage gate against ui-components ◄────────────── CRITERION 1 PASSES
        │
        └──► PR 7a — PyreonTokens Swift emit (needs PR 1)
                │
                ▼
            PR 7b — styled() → ViewModifier emit
                │
                ▼
            PR 7c — rocketstyle dimensions → ViewModifier
                │
                ▼  (needs PR 4 done)
            PR 8 — Visual fidelity test (screenshot diff) ◄─────────── CRITERION 3 PASSES
                                                                              │
                                                                              ▼
                                                                       PHASE 0 COMPLETE
```

Longest path: **PR 0 → 1 → 2 → 3 → 4 → 7a → 7b → 7c → 8** (9 PRs incl. anchor). Type-mapper chain (PRs 5a-5e + 6) runs in parallel.

**First PR to ship after #794**: **PR 1** (Swift runtime SPM scaffold). PR 5a (type mapper primitives) is a viable parallel starter if a second contributor picks it up — fully independent of PR 1's work.

---

## Effort summary

| PR  | Scope                                 | Effort    | Critical path? |
| --- | ------------------------------------- | --------- | -------------- |
| 1   | Swift runtime SPM scaffold            | 3-5 days  | yes            |
| 2   | `@pyreon/native-cli` scaffold         | 3-5 days  | yes            |
| 3   | First Xcode project                   | 3-5 days  | yes            |
| 4   | Counter Pyreon source + integration   | 5-10 days | yes            |
| 5a  | TS→Swift primitive types              | 3-5 days  | no (parallel)  |
| 5b  | Function types + closures             | 3-5 days  | no             |
| 5c  | Generics                              | 5-10 days | no             |
| 5d  | Union types + nullables               | 3-5 days  | no             |
| 5e  | async/Promise mapping                 | 5-10 days | no             |
| 6   | Type-mapper coverage gate             | 1-2 days  | no             |
| 7a  | PyreonTokens Swift emit               | 2-4 days  | yes            |
| 7b  | styled() → ViewModifier emit          | 5-10 days | yes            |
| 7c  | rocketstyle dimensions → ViewModifier | 5-10 days | yes            |
| 8   | Visual fidelity (screenshot diff)     | 3-5 days  | yes            |

**Single-contributor critical path total**: ~6-9 weeks (PRs 0→1→2→3→4→7a→7b→7c→8). The type-mapper chain adds another ~3-5 weeks if serialized after, ~zero weeks if parallelized.

**Realistic Phase 0 envelope** (PMTC plan says "2-3 months"): hits 2 months with one focused contributor running critical path. Hits 3 months if blocked on type-mapper or fidelity-test surprises. The plan's envelope is honest.

---

## Per-PR specifications

### PR 0 — Compiler skeleton ✅ MERGED (#794)

**Status**: shipped.

**Delivered**: `@pyreon/native-compiler` private package; Pyreon JSX → Swift + Kotlin string emit; 7 fixtures (stateless, signal, computed, event, multi-signal, For, Show) × 2 emitters = 14 snapshot tests; ~930 LOC.

**Validation**: snapshot tests lock the emit shape; bisect-verify with-restore captures (Iterator/Show kept honest).

**Not delivered (deliberate Phase 0 scope)**: no native runtime, no Xcode integration, no CLI orchestration, no type mapper, no styler emitter, no iOS simulator path. String-in / string-out only.

---

### PR 1 — Swift runtime SPM scaffold

**Branch**: `feat/native-runtime-swift-scaffold`

**Scope**: create `@pyreon/native-runtime-swift` private Swift Package Manager package at `packages/native/runtime-swift/`. Minimal contents:

- `Package.swift` declaring iOS 17+ target, no external deps
- `Sources/PyreonRuntime/` containing:
  - `PyreonTokens.swift` — empty stub (filled in PR 7a)
  - `PyreonReactivity.swift` — adapters that allow compiler output to construct SwiftUI `@State` from Pyreon's `signal<T>()` semantics (mostly empty — the PMTC plan says "almost no runtime code needed" because SwiftUI's `@State` directly IS the primitive — but a few helpers will be needed for `computed` chains and `effect` bridging)
  - `PyreonViewModifier.swift` — base protocol/extensions for the styler emitter to target
- `Tests/PyreonRuntimeTests/` — at least one passing test per Swift file (smoke that the package builds)

**Deliverable**: a buildable Swift package that an Xcode project can consume via `.package(path: "...")`.

**Validation**:

- `swift build` from `packages/native/runtime-swift/` exits 0
- `swift test` runs the smoke tests
- Package can be consumed by a sibling Xcode project (manual test: open Xcode, add local package, build)

**Effort**: 3-5 days. Most time is Swift-package conventions and finding the right minimal API surface for downstream PRs to extend.

**Blocks**: PRs 2, 3, 4, 7a, 7b, 7c, 8 — every PR that touches iOS output needs this package to exist.

**Honest risk**: the "almost no runtime needed" claim from the PMTC plan is unvalidated. PR 1 should be allowed to surface the actual minimum runtime surface. If it exceeds ~500 LOC of Swift, regroup — that's a signal the compiler emit shape is wrong (too much work pushed into runtime).

---

### PR 2 — `@pyreon/native-cli` scaffold

**Branch**: `feat/native-cli-scaffold`

**Scope**: create `@pyreon/native-cli` private package at `packages/native/cli/`. Wraps `@pyreon/native-compiler` (PR 0) in a thin CLI:

```bash
pyreon-native build --target=ios --source=./src --out=./generated
pyreon-native build --target=android --source=./src --out=./generated
```

- Reads `.tsx` files from `--source` directory
- Calls `transform(src, { target })` per file
- Writes `.swift` (target=ios) or `.kt` (target=android) to `--out`
- Maintains source-map directives in output (`#sourceLocation(file:line:)` for Swift, `// (file:line)` for Kotlin) so downstream debug tooling can point at Pyreon source

**Not in scope**: file-watching / hot reload (Phase 3); Xcode project mutation (handled in PR 3); incremental compilation (Phase 1+).

**Deliverable**: a CLI binary that turns a directory of Pyreon TSX files into a directory of native source files.

**Validation**:

- Unit tests against tmp directories with known inputs
- One end-to-end test: invoke CLI against the 7 fixtures from PR 0, assert output matches the snapshot baseline
- Manual: run against `examples/native-counter-ios/src/` (which doesn't exist until PR 3, so this validation is "exists and the help text is correct" at PR 2 merge)

**Effort**: 3-5 days. No novel work — file IO, arg parsing, glob walking.

**Blocks**: PR 3 (Xcode project needs a way to invoke the CLI as a build phase).

---

### PR 3 — First Xcode project at `examples/native-counter-ios/`

**Branch**: `feat/native-counter-xcode-project`

**Scope**: hand-create a minimal Xcode project structure (committed verbatim — Xcode project files in git):

```
examples/native-counter-ios/
├── README.md
├── Package.swift  # OR project.pbxproj
├── src/
│   └── Counter.tsx       # the user-authored Pyreon source (stays empty in PR 3)
├── generated/             # CLI output (gitignored)
│   └── .gitkeep
├── ios/
│   ├── App.swift         # @main entry point, currently empty body
│   ├── ContentView.swift # bootstraps the generated Counter
│   └── Info.plist
└── scripts/
    └── build.sh          # invokes pyreon-native CLI before xcodebuild
```

PR 3 establishes the **shape of an iOS app that consumes Pyreon-emitted Swift**. The `generated/` directory is empty in this PR — PR 4 adds the Counter.tsx source that fills it.

Includes a build-phase script that invokes `pyreon-native build --target=ios --source=./src --out=./generated` BEFORE `xcodebuild`. Either:

- Xcode "Run Script" build phase, OR
- A `build.sh` wrapper script that runs the CLI then xcodebuild

**Not in scope**: any actual user code, any reactivity demo, any styling. Just the pipeline: TSX in `src/` → Swift in `generated/` → linked into the Xcode app.

**Deliverable**: an Xcode project that builds (with empty generated/ and empty App.swift body) and produces an empty iOS app.

**Validation**:

- `cd examples/native-counter-ios && ./scripts/build.sh` exits 0
- `xcodebuild -scheme NativeCounter -destination 'platform=iOS Simulator,name=iPhone 15' build` exits 0
- The empty app launches in simulator (no UI, just a blank screen)
- CI: a macOS runner that runs the above commands

**Effort**: 3-5 days. Most time is Xcode project file gotchas (codesigning off, SDK version pinning, simulator target). The `project.pbxproj` is annoying to author by hand — consider generating via XcodeGen for reproducibility.

**Blocks**: PR 4 (needs an Xcode project to drop the Counter into).

**Honest risk**: Xcode project files are notoriously brittle. If `project.pbxproj` hand-authoring becomes painful, switch to XcodeGen + `project.yml` (declarative spec → generated `.pbxproj`). This is a known-good pattern in the SwiftUI community.

---

### PR 4 — Counter Pyreon source + first end-to-end render ⭐ CRITERION 2

**Branch**: `feat/native-counter-end-to-end`

**Scope**: this is the **single most important PR in Phase 0**. Drops a real Pyreon Counter into the Xcode project from PR 3, compiles it through the CLI from PR 2, and proves the entire pipeline works in iOS simulator.

Files added:

```tsx
// examples/native-counter-ios/src/Counter.tsx
import { signal } from '@pyreon/reactivity'

export function Counter() {
  const count = signal(0)
  return (
    <VStack>
      <Text>{count}</Text>
      <Button onClick={() => count.set(count() + 1)}>Increment</Button>
    </VStack>
  )
}
```

Note: PR 4 uses `<VStack>`/`<Text>`/`<Button>` (SwiftUI-shaped names) NOT `<View>`/`<Text>`/`<Button>` (Pyreon-shaped names). PR 4 hard-codes a tiny mapping table in `parse.ts` for these three primitives. The full `@pyreon/ui-components` → SwiftUI mapping is a later concern; this PR validates the structural pipeline, not the full component vocabulary.

`ios/ContentView.swift` updated to instantiate `Counter()` from the generated Swift.

**Deliverable**: build the Xcode project, run in iOS simulator, tap the Increment button, observe the count update on screen.

**Validation** (criterion 2 from PMTC plan):

- ✅ `./scripts/build.sh && xcodebuild ... build` exits 0
- ✅ App launches in iOS simulator
- ✅ Initial render shows "0"
- ✅ Tapping Increment updates the displayed count to "1", then "2", etc.
- ✅ CI: macOS runner with `xcrun simctl` + `instruments -t Automation` (or modern equivalent) screenshots the simulator after taps, verifies count text

**Effort**: 5-10 days. **This is the integration-debug PR** — most time will go to: getting Xcode build phase to invoke the CLI correctly, getting Swift's compilation of generated output to succeed (likely several compiler-emit fixes), getting SwiftUI's `@State` re-render to actually fire (validating the PR 1 reactivity adapter), getting the screenshot CI to work.

If this PR ships green, **half of Phase 0 is done** (criterion 2 met). Criteria 1 + 3 still pending.

**Blocks**: PR 8 (style fidelity test runs against the same Counter app, just with rocketstyle styling added).

---

### PR 5a — TS→Swift primitive type mapper

**Branch**: `feat/native-type-mapper-primitives`

**Scope**: a new module `@pyreon/native-compiler/src/type-mapper.ts` that translates TypeScript types to Swift types for the primitive cases:

| TS type                                    | Swift type                                               |
| ------------------------------------------ | -------------------------------------------------------- |
| `number`                                   | `Double` (or `Int` if context proves integral — Phase 1) |
| `string`                                   | `String`                                                 |
| `boolean`                                  | `Bool`                                                   |
| `void`                                     | `Void`                                                   |
| `null` / `undefined`                       | `nil` / `Optional` (PR 5d handles this fully)            |
| `Array<T>`                                 | `[T]`                                                    |
| `Record<string, T>` / `{ [k: string]: T }` | `[String: T]`                                            |

API:

```ts
export function mapType(tsTypeNode: TSTypeNode): string
```

Returns the Swift type as a string for embedding in emit output.

**Not in scope**: function types (PR 5b), generics (PR 5c), unions/nullables (PR 5d), async (PR 5e).

**Deliverable**: a pure-function type mapper that the existing emitters in PR 0 can call.

**Validation**:

- Unit tests against each TS type variant
- Round-trip integration test: take a TS source with the primitive types, run it through the existing compiler + new type mapper, assert Swift output uses correct types

**Effort**: 3-5 days. Mostly TS-compiler-API ergonomics; the mapping itself is shallow.

**Parallel**: can ship in parallel with PR 1 — no shared files.

---

### PR 5b — Function types + closures

**Branch**: `feat/native-type-mapper-functions`

**Scope**: extend type-mapper for function-type translation:

| TS shape                                   | Swift shape                                                |
| ------------------------------------------ | ---------------------------------------------------------- |
| `() => void`                               | `() -> Void`                                               |
| `(x: number) => string`                    | `(Double) -> String`                                       |
| `(x: T) => U` (with `T`/`U` known)         | `(T) -> U`                                                 |
| `(...args: T[]) => U`                      | `(T...) -> U` (Swift variadic)                             |
| event handlers (`(e: MouseEvent) => void`) | requires platform-event mapping → defer to PR 5d / Phase 1 |

Handles closure capture semantics — Swift closures need `@escaping` if stored beyond call scope; mapper should emit `@escaping` for any function type appearing as a stored property or non-immediately-invoked argument.

**Deliverable**: function-type mapping integrated with PR 5a's primitive mapper. The signal `set` callback (`(next: T) => void`) and effect callback (`() => CleanupFn | void`) both map correctly.

**Validation**:

- Unit tests for closure shapes
- Round-trip: an effect with a cleanup return type maps correctly

**Effort**: 3-5 days.

**Depends on**: PR 5a.

---

### PR 5c — Generics (`Signal<T>` / `Computed<T>` / `Ref<T>`)

**Branch**: `feat/native-type-mapper-generics`

**Scope**: extend type-mapper for the generic types Pyreon ships:

| TS shape                         | Swift shape                                                             |
| -------------------------------- | ----------------------------------------------------------------------- |
| `Signal<T>`                      | (special — see below)                                                   |
| `Computed<T>`                    | (special)                                                               |
| `Ref<T>`                         | `@State private var x: T?` for state refs, `@Binding` for parent-passed |
| `Promise<T>`                     | (PR 5e)                                                                 |
| `Array<T>` / `T[]`               | `[T]` (already in PR 5a but generic-aware)                              |
| `Map<K, V>`                      | `[K: V]` (when K is `Hashable`)                                         |
| `Set<T>`                         | `Set<T>` (when T is `Hashable`)                                         |
| user-defined generics (`Box<T>`) | Swift generic struct/class                                              |

**Special handling for `Signal<T>` / `Computed<T>`**: these are NOT mapped to a Pyreon runtime type. Instead, the compiler detects `signal<T>(initial)` and `computed(() => …)` call expressions and emits `@State private var x: T = initial` / a `computed property` directly. The type-mapper documents this contract so other emit passes know not to treat `Signal<T>` / `Computed<T>` as opaque types.

**Deliverable**: generics-aware type mapper that handles the Pyreon reactive types specially.

**Validation**:

- Unit tests for each generic shape
- Round-trip: a `computed(() => a() + b())` returning `Computed<number>` is emitted as a Swift computed property of type `Double`, NOT as `Computed<Double>`

**Effort**: 5-10 days. Generic substitution is non-trivial — Swift's generic constraints (`where T: Hashable`) need to be inferred from TS context.

**Depends on**: PRs 5a + 5b.

**Honest risk**: TS's structural generics may not always translate to Swift's nominal generics cleanly. Document edge cases that require manual annotation (`// pyreon-native-skip` or explicit Swift type assertion). The PMTC plan's 90% coverage criterion implicitly accepts that some manual annotation will be needed.

---

### PR 5d — Union types + nullables

**Branch**: `feat/native-type-mapper-unions`

**Scope**: extend type-mapper for union and nullable handling:

| TS shape                                                                     | Swift shape                                                                        |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- | ----------------------------------------- |
| `T                                                                           | null`/`T                                                                           | undefined` | `T?` (Swift Optional)                     |
| `T                                                                           | null                                                                               | undefined` | `T?` (collapses both nullish to Optional) |
| `'a' \| 'b' \| 'c'` (string literal union)                                   | `enum SwiftEnum: String { case a, b, c }`                                          |
| `number \| string` (heterogeneous union)                                     | `enum SwiftEnum { case number(Double), string(String) }` (Swift associated values) |
| discriminated union (`{ type: 'a', a: number } \| { type: 'b', b: string }`) | full Swift enum with associated values per case                                    |

The discriminated-union → Swift-enum mapping is the highest-leverage piece here — Pyreon component props often use discriminated unions for variant shape (e.g. `{ kind: 'click', onClick } | { kind: 'hover', onHover }`), and Swift enums are the idiomatic native equivalent.

**Deliverable**: full union/nullable mapping integrated with previous PRs.

**Validation**:

- Unit tests per union shape
- Round-trip: a Pyreon component with a discriminated-union prop emits a Swift component that accepts a Swift enum

**Effort**: 3-5 days.

**Depends on**: PRs 5a + 5b + 5c.

---

### PR 5e — async/Promise → async throws

**Branch**: `feat/native-type-mapper-async`

**Scope**: extend type-mapper for async handling:

| TS shape                     | Swift shape                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `Promise<T>`                 | `async throws -> T` (Swift async/await with throws for error handling) |
| `Promise<void>`              | `async throws -> Void`                                                 |
| `async function` declaration | `func name() async throws -> T`                                        |
| `await expr`                 | `try await expr`                                                       |
| `.then()` / `.catch()` chain | NOT supported — emit compile error with hint to use async/await syntax |

Swift's structured concurrency (`async`/`await`/`Task`) is the closest match to JS Promises. Promise-rejection maps to Swift's `throws`. The mapper warns if TS code uses `.then()`/`.catch()` chains (rare in modern code but legal); recommends rewriting to async/await before native compile.

**Deliverable**: async mapping integrated with previous PRs.

**Validation**:

- Unit tests for async patterns
- Round-trip: an async loader function in Pyreon maps to a Swift `func loader() async throws -> Data`

**Effort**: 5-10 days. Structured concurrency is conceptually similar to JS promises but the `throws` integration is novel — error types need mapping too.

**Depends on**: PRs 5a + 5b + 5c.

---

### PR 6 — Type-mapper coverage gate ⭐ CRITERION 1

**Branch**: `feat/native-type-mapper-coverage-gate`

**Scope**: a script `scripts/native/type-mapper-coverage.ts` that:

1. Walks `packages/ui-system/ui-components/src/**/*.tsx` and `.ts` files
2. Runs each through the compiler with the type mapper enabled
3. Counts `// pyreon-native-skip` annotations the mapper emitted (or that user code carried) — these signal "type couldn't be mapped, manual override needed"
4. Computes coverage = `(total_typed_constructs - skipped) / total_typed_constructs`
5. Asserts `coverage >= 0.90`

If coverage <90%, prints per-file breakdown of what couldn't be mapped (e.g. "Box.tsx: 3 generic constraints not mappable; Modal.tsx: 1 discriminated union with non-literal discriminator").

**Deliverable**: a CI gate that fails the build if type-mapper coverage drops below 90% on `ui-components`.

**Validation** (criterion 1 from PMTC plan):

- Script runs successfully against `ui-components`
- Reports coverage ≥90%
- If it doesn't, the breakdown clearly identifies remaining gaps for PR 5a-5e follow-ups

**Effort**: 1-2 days. Most time is choosing the metric (lines vs constructs vs files) and getting consistent counting.

**Depends on**: PRs 5a + 5b + 5c + 5d + 5e (the full type-mapper chain).

**Honest risk**: if coverage comes back at e.g. 60%, that's a Phase 0 fail signal — the PMTC plan explicitly says "if type mapping doesn't reach 90%, reconsider scope." Be prepared for that outcome. The honest framing is: this PR DISCOVERS whether the plan's coverage assumption holds. If it doesn't, Phase 0 has surfaced a real risk and the project pauses to address it, not papers over it.

---

### PR 7a — PyreonTokens Swift emit

**Branch**: `feat/native-unistyle-tokens-emit`

**Scope**: extend the compiler with a unistyle-token emitter. Reads the existing `@pyreon/ui-theme` package's theme exports (spacing, breakpoints, typography, colors) at compile time and emits a `PyreonTokens.swift` file:

```swift
// generated by pyreon-native CLI, do not edit
public enum PyreonTokens {
  public enum Spacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 24
  }
  public enum Font {
    public static let xl: Font = .system(size: 20, weight: .semibold)
  }
  public enum Color {
    public static let primary: SwiftUI.Color = Color(red: 0.3, green: 0.5, blue: 1.0)
    // ... light/dark variants resolved via @Environment(\.colorScheme)
  }
}
```

CLI gains a `--emit-tokens` flag that writes the tokens file alongside generated component files.

**Deliverable**: `PyreonTokens.swift` that downstream PRs (7b, 7c) can reference.

**Validation**:

- Snapshot test: feed a known theme, assert exact Swift output
- Round-trip: a component referencing `t.spacing.md` in the source emits Swift that references `PyreonTokens.Spacing.md`

**Effort**: 2-4 days. The hardest part is color handling — TS color values are often `'rgba(0,0,0,.5)'` strings; need to parse and emit Swift's `Color(red: g: b: opacity:)` form.

**Depends on**: PR 1 (Swift runtime package needs the `PyreonTokens` namespace declared).

---

### PR 7b — `styled()` → ViewModifier emit

**Branch**: `feat/native-styler-emit-swift`

**Scope**: extend the compiler to detect `styled('div')` and similar `styled()` calls in source, parse the CSS template literal, and emit a SwiftUI `ViewModifier` struct:

User source:

```tsx
const StyledButton = styled('button')`
  background: ${(t) => t.color.primary};
  padding: ${(t) => t.spacing.md};
  border-radius: 8px;
`
```

Emitted Swift:

```swift
struct StyledButtonModifier: ViewModifier {
  func body(content: Content) -> some View {
    content
      .background(PyreonTokens.Color.primary)
      .padding(PyreonTokens.Spacing.md)
      .cornerRadius(8)
  }
}

// usage at the use site:
Button("...") { ... }.modifier(StyledButtonModifier())
```

CSS-property → SwiftUI-modifier mapping table (start with the ~20 most-common properties: background, padding, margin, border, shadow, color, font, opacity, transform). Anything not in the table emits a compile warning + `// TODO: unsupported CSS property` comment.

**Deliverable**: `styled()` calls produce idiomatic SwiftUI `ViewModifier` chains.

**Validation**:

- Unit tests per CSS-property mapping
- Round-trip: a styled component compiles + builds in the Xcode project from PR 3

**Effort**: 5-10 days. The mapping table is the bulk of the work; getting the emit shape right (struct vs extension vs inline) requires SwiftUI idiom understanding.

**Depends on**: PRs 1 + 7a.

---

### PR 7c — rocketstyle dimensions → ViewModifier

**Branch**: `feat/native-rocketstyle-emit-swift`

**Scope**: extend the compiler to detect `rocketstyle(component).config({ dimensions: { state, size, variant } }).theme(...)` chains. Emit a Swift `ViewModifier` that takes the dimension props as enum cases and applies the corresponding theme:

User source:

```tsx
const Button = rocketstyle('button')
  .config({ dimensions: { state: 'state', size: 'size' } })
  .theme((t, p) => ({
    background: p.state === 'primary' ? t.color.primary : t.color.gray,
    padding: p.size === 'medium' ? t.spacing.md : t.spacing.sm,
  }))
```

Emitted Swift:

```swift
enum ButtonState: String { case primary, secondary }
enum ButtonSize: String { case medium, small }

struct ButtonModifier: ViewModifier {
  let state: ButtonState
  let size: ButtonSize
  func body(content: Content) -> some View {
    let bg = state == .primary ? PyreonTokens.Color.primary : PyreonTokens.Color.gray
    let pad = size == .medium ? PyreonTokens.Spacing.md : PyreonTokens.Spacing.sm
    return content.background(bg).padding(pad)
  }
}

// Usage at call site (compiler-translated from `<Button state="primary" size="medium">`):
Button("...") { ... }.modifier(ButtonModifier(state: .primary, size: .medium))
```

Handles pseudo-state dimensions (`hover`, `active`, `focus`, `pressed`, `disabled`, `readOnly`) by emitting `@FocusState` / `@State<Bool>` declarations and SwiftUI gesture modifiers (`.onHover`, `.onTapGesture` with state tracking).

**Deliverable**: rocketstyle components compile to Swift `ViewModifier` + enum-typed dimension props.

**Validation**:

- Unit tests for dimension permutations
- Round-trip: a `<Button state="primary" size="medium">` use site emits the correct `.modifier(ButtonModifier(state: .primary, size: .medium))` call

**Effort**: 5-10 days. rocketstyle's chained-builder syntax is non-trivial to parse; the dimension theming logic needs careful translation.

**Depends on**: PRs 1 + 7a + 7b.

---

### PR 8 — Visual fidelity test ⭐ CRITERION 3

**Branch**: `feat/native-style-fidelity-test`

**Scope**: extends the Counter app from PR 4 to use a rocketstyle button, then implements screenshot-comparison tooling:

1. Web rendering: `vite preview` of the Pyreon web build, Playwright takes a screenshot of the rendered Counter
2. iOS rendering: `xcrun simctl io <udid> screenshot` of the same Counter running in iOS simulator
3. Comparison: pixel-diff via `pixelmatch` (or equivalent), threshold <5% per the PMTC plan's criterion 3
4. Both screenshots committed to the repo as baselines; PR diff regenerates and compares
5. CI: macOS runner runs both renderings, asserts diff <5%

Excludes platform-native conventions from the comparison: cursor (iOS has none), text selection handles (different per platform), system-level overlays. The comparison region is a tight bounding box around the styled button.

**Deliverable**: screenshot-diff CI gate that proves rocketstyle output renders visually identical to web (within tolerance).

**Validation** (criterion 3 from PMTC plan):

- Web screenshot generated successfully
- iOS screenshot generated successfully
- Pixel diff <5% on the button region
- If the gate fails, the diff visualization is uploaded as a CI artifact for inspection

**Effort**: 3-5 days. Most time is cross-platform screenshot tooling and getting the bounding-box comparison to be stable across simulator runs.

**Depends on**: PRs 4 + 7c.

**Honest risk**: 5% pixel diff is tight for cross-renderer comparison (web's Chromium vs iOS's CoreGraphics will produce subtly different antialiasing, hinting, gamma). If the diff is unavoidably >5% on the same intended styling, the criterion needs adjustment (likely 10-15% or a non-pixel metric like structural similarity / SSIM). Be prepared to defend the threshold in the PR review.

---

## Phase 0 completion checklist

| #   | Checkpoint                                                     | Closed by     | Status |
| --- | -------------------------------------------------------------- | ------------- | ------ |
| 1   | Type mapper coverage ≥90% on `ui-components`                   | PRs 5a-5e + 6 | open   |
| 2   | Counter app on iOS simulator: button-driven `signal.set` works | PRs 1-4       | open   |
| 3   | rocketstyle button visually identical web vs iOS (<5% diff)    | PRs 7a-7c + 8 | open   |

When all three checkpoints close, Phase 0 is **complete and validated**. The next decision: does Phase 1 (iOS MVP — 10 widget bindings, full styler emitter, basic Pyreon framework component compilation) get staffed?

That decision is **NOT made by the engineering team**. The PMTC plan says: _"Past Phase 0, additional checkpoints per phase. These three are the minimum bar for 'PMTC is real.'"_ — i.e. Phase 1 staffing is a separate strategic decision after Phase 0 evidence.

---

## What's NOT in this roadmap (deliberate)

- **Android Phase 0**. PMTC plan's Phase 0 deliverable is iOS-only ("counter on iOS simulator"). Compiler already emits Kotlin (PR 0), but Kotlin → Compose → Android Studio integration is Phase 2 work. PRs 1-8 are all iOS-focused.
- **Routing / navigation**. `@pyreon/router-ios` is Phase 3. Counter app uses no routing.
- **Forms / inputs**. `TextInput`/`Switch` widgets are Phase 1. Counter uses only `Text`/`Button`/`VStack`.
- **Lists**. `<For>` SwiftUI emit exists in PR 0 fixture 6, but no Counter app uses lists. Real list testing is Phase 1.
- **Hot reload / dev mode**. Phase 3 concern. PR 9 (optional polish) sketches a spike if a contributor has slack time.
- **Source maps in the debugger**. Compiler emits `#sourceLocation(file:line:)` directives starting in PR 2, but proving Xcode breakpoints work end-to-end is Phase 1.
- **CocoaPods / Swift Package Manager publication**. The runtime SPM (PR 1) stays local-path during Phase 0. Publication is post-Phase-0.

---

## Sequencing for a 1-contributor team

If only one contributor is staffed on Phase 0, the optimal serialized order is:

```
PR 1 → 2 → 3 → 4    (criterion 2 met — week 4-6)
       ↓
PR 5a → 5b → 5c → 5d → 5e → 6   (criterion 1 met — week 9-11)
       ↓
PR 7a → 7b → 7c → 8   (criterion 3 met — week 12-14)
```

Total: ~12-14 weeks. Within the PMTC plan's "2-3 months focused" envelope (8-13 weeks).

## Sequencing for a 2-contributor team

If two contributors are staffed, the parallelization is:

```
Contributor A:  PR 1 → 2 → 3 → 4 → 7a → 7b → 7c → 8     (critical path)
Contributor B:  PR 5a → 5b → 5c → 5d → 5e → 6           (type-mapper chain, fully parallel)
```

Total: ~8-9 weeks (limited by critical path A). Hits the 2-month optimistic end of the PMTC plan envelope.

---

## Risk-adjusted timeline

The above estimates assume **no unknown unknowns**. Real Phase 0 spikes usually surface:

1. **Xcode integration gotchas** (PR 3 / PR 4). +1-2 weeks if `project.pbxproj` hand-authoring fails and the team has to migrate to XcodeGen.
2. **Type mapper edge cases** (PR 5c). Generic substitution in real `ui-components` source might hit cases the unit tests didn't cover. +1-2 weeks.
3. **rocketstyle parsing complexity** (PR 7c). The chained-builder API + computed-property reads is intricate; expect +1 week vs naive estimate.
4. **Screenshot stability** (PR 8). Cross-renderer pixel diff is finicky; the 5% threshold may need tuning. +0.5-1 week.

**Risk-adjusted Phase 0 envelope**: 12-18 weeks for 1 contributor; 9-12 weeks for 2 contributors. The PMTC plan's "2-3 months" is the optimistic end of this range; "2-3 months" assumes nothing surprises.

---

## What this doc commits to

- **A concrete PR sequence** for Phase 0 with scope, dependencies, validation, and effort per PR.
- **Honest effort estimates** — based on the type of work, not aspiration. Risk-adjusted ranges given alongside optimistic ones.
- **Explicit pass/fail criteria** mapped to PRs. When PR 4 ships green, criterion 2 is met. When PR 6 ships green AND coverage ≥90%, criterion 1 is met. When PR 8 ships green, criterion 3 is met.
- **First-PR identification**: PR 1 (Swift runtime SPM scaffold) is the next PR after #794. PR 5a (type mapper primitives) is the optimal parallel starter if a second contributor is available.
- **What's NOT in Phase 0** is named explicitly — Android, routing, forms, lists, hot reload, source-map polish, package publication. Those are Phase 1+ concerns.
- **No commitment to staffing or timeline kickoff**. This doc says HOW to execute Phase 0, not WHEN. The PMTC plan reserves that decision separately.
