# PMTC Phase 1 — iOS MVP roadmap

**Status**: Companion to [`native-platforms.md`](./native-platforms.md) (PMTC strategic direction, #764), [`native-platforms-phase0-roadmap.md`](./native-platforms-phase0-roadmap.md) (#797 merged), [`native-platforms-todomvc-walkthrough.md`](./native-platforms-todomvc-walkthrough.md) (#799 open), and [`native-platforms-platform-abstractions.md`](./native-platforms-platform-abstractions.md) (#802 open). Breaks Phase 1 (per PMTC plan's Honest Timeline: "+4-6 months, Counter / list / form. 10 native widget bindings, basic styler emitter. iOS only.") into discrete PRs.

**Prerequisite**: Phase 0 complete — all three criteria met (type mapper coverage ≥90%, counter on iOS simulator works, rocketstyle style fidelity <5% pixel diff). This roadmap is **not actionable until Phase 0 ships**; it exists now so Phase 1 scope is visible and informs Phase 0 decisions.

**Phase 1 deliverable** (from PMTC plan): TodoMVC-class app shipping on iOS simulator. 10 native widget bindings. Basic styler emitter complete. Android NOT yet (Phase 2). Real apps NOT yet (Phase 3).

---

## TL;DR

Phase 1 has **three workstream chains**, runnable in parallel:

| Chain                         | Scope                                                                                                                                  | Effort     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **A — Compositional gaps**    | 4 PRs closing the TodoMVC walkthrough's in-Phase-1 gaps (two-way binding, keyboard handlers, array mutation, object-in-array updates)  | 4-6 weeks  |
| **B — Widget bindings**       | 10 PRs each adding one iOS widget binding (TextField / Toggle / Checkbox / Slider / Picker / etc.)                                     | 6-10 weeks |
| **C — Platform abstractions** | 3 PRs implementing the first cross-platform abstraction (`@pyreon/storage` shape per #802 spec) + a follow-on for `@pyreon/deep-links` | 4-8 weeks  |

**Phase 1 finish line**: TodoMVC compiles + runs on iOS simulator end-to-end. All 10 widget bindings ship. `@pyreon/storage` works as the reference cross-platform abstraction. Real-Chromium-style fidelity test passes for 3+ rocketstyle components (not just the counter button from Phase 0 PR 8).

**Realistic envelope**: 4-6 months for 1 contributor (matches PMTC plan); 2.5-4 months for 2 contributors running chains in parallel.

**Critical-path PR after Phase 0 finish**: **Chain A PR 1** (two-way binding emission) — closes the structural gap that blocks TodoMVC compilation entirely. Once it lands, Chains B and C can ship widgets / abstractions independently.

---

## How this roadmap relates to the others

- [Phase 0 roadmap (#797)](./native-platforms-phase0-roadmap.md) closes PMTC's 3 pass/fail criteria with 8 PRs. **Must finish before Phase 1 starts.**
- [TodoMVC walkthrough (#799)](./native-platforms-todomvc-walkthrough.md) named 8 compositional gaps. **4 of them are this roadmap's Chain A.** (2 are in Phase 0's roadmap — string-literal unions PR 5d, rocketstyle conditional hoisting PR 7c; 2 are Phase 3 — `@pyreon/router-ios` URL hash, `@pyreon/deep-links` polish.)
- [Platform abstractions spec (#802)](./native-platforms-platform-abstractions.md) defines the cross-platform package shape. **Chain C ships the first reference implementation (`@pyreon/storage`).**

This roadmap stops at Phase 1 — Phase 2 (Android parity) and Phase 3 (real-app polish) get their own roadmap docs when those phases approach.

---

## Chain A — Compositional gaps (4 PRs, 4-6 weeks)

These PRs close the structural compiler gaps the TodoMVC walkthrough identified. Without them, TodoMVC literally won't compile; with them, Phase 1's "ship TodoMVC on iOS" deliverable becomes possible.

### A1 — Two-way binding emission for form inputs

**Branch**: `feat/native-twoway-binding-swift`

**Scope**: extend the compiler to detect the `<TextField value={X} onInput={(e) => X.set(e.target.value)}>` pattern (and its `onChange` / `currentTarget` / `value` variants) and emit Swift's `TextField("…", text: $X)` compact Binding form. Kotlin already matches Pyreon's source (`TextField(value=..., onValueChange=...)`); no Kotlin compiler change needed.

**Pattern recognition**: AST-walk the JSX attribute pair. The `value` attribute must be a bare-identifier matching a `signal()` declaration in scope. The `onInput`/`onChange` body must be exactly `<sameSignal>.set(<event>.target.value)` or `<sameSignal>.set(<event>.currentTarget.value)`.

Falls back to the verbose `Binding(get:set:)` shape when the pattern doesn't match — e.g. user wrote `onInput={(e) => x.set(e.target.value.toUpperCase())}` (transformation in the setter).

**Same handling applies to**: `<Slider>`, `<Toggle>` (`Switch`), `<Picker>`, `<DatePicker>`, `<TextEditor>` (multi-line). The pattern detector is one function; each widget binding uses it.

**Deliverable**: every form-input widget binding emits idiomatic SwiftUI Binding shape.

**Validation**:

- Unit tests for each binding pattern + each fallback case
- Round-trip: TodoMVC's `<TextField value={draft} onInput={...}>` emits `TextField("…", text: $draft)` exactly

**Effort**: 1-2 weeks. The pattern detector is small; the per-widget emit shapes need per-widget review for Swift Binding nuances (e.g. `Slider(value: $x, in: 0...100)` has additional required props).

### A2 — Keyboard event handler patterns

**Branch**: `feat/native-keyboard-handlers`

**Scope**: extend the compiler to detect `onKeyDown={(e) => e.key === '<key>' && <body>}` (and `&&`/ternary variants) and emit platform-idiomatic submit/IME handlers.

**Per-key emission table**:

| Pyreon pattern              | Swift emit                                                                                                       | Kotlin emit                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `e.key === 'Enter' && X()`  | `.onSubmit { X() }`                                                                                              | `keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { X() })` |
| `e.key === 'Escape' && X()` | `.onExitCommand { X() }` (macOS) / iOS no clean equivalent — fall back to `// pyreon-native-skip` warn           | platform-specific dismiss handler                                                                                    |
| `e.key === 'Tab' && X()`    | Tab handling is automatic in SwiftUI; emit `// PMTC: Tab handling is automatic on iOS — handler dropped` comment | `Modifier.focusable() + focusOrder` (defer to Phase 2)                                                               |

For Phase 1, **only Enter is fully supported**. Other keys emit a warning + skip the handler. Real apps rarely need Escape/Tab handling on mobile; this is acceptable for TodoMVC.

**Deliverable**: TodoMVC's `onKeyDown={(e) => e.key === 'Enter' && addTodo()}` emits `.onSubmit { addTodo() }` on Swift + `keyboardActions = ...` on Kotlin.

**Validation**:

- Unit tests per key + per platform
- Round-trip: TodoMVC submit-on-enter works in iOS simulator

**Effort**: 1-2 weeks. The pattern detector is straightforward; per-platform emit shapes for non-Enter keys is the time sink.

**Depends on**: A1 (TextField binding must work first for the keyboard handler to attach to it).

### A3 — Array mutation idiom emission

**Branch**: `feat/native-array-mutation-idiom`

**Scope**: this PR closes BOTH gaps #3 and #4 from the TodoMVC walkthrough together — they share the same pattern recognition.

The TodoMVC walkthrough surfaced the design decision: **faithful spread emission vs idiomatic mutation emission**. The decision per the walkthrough's recommendation: **idiomatic emit by default, faithful fallback when source is too complex.**

**Patterns to recognize + emit**:

| Pyreon pattern                                        | Swift emit                                                           | Kotlin emit                                                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `X.set([...X(), value])`                              | `X.append(value)`                                                    | `X.add(value)` (requires `mutableStateListOf`)                                        |
| `X.set([value, ...X()])`                              | `X.insert(value, at: 0)`                                             | `X.add(0, value)`                                                                     |
| `X.set(X().filter(<predicate>))`                      | `X.removeAll(where: <predicate>)`                                    | `X.removeAll(<predicate>)`                                                            |
| `X.set(X().map(t => t.id === id ? {...t, F: V} : t))` | `if let idx = X.firstIndex(where: { $0.id == id }) { X[idx].F = V }` | `val idx = X.indexOfFirst { it.id == id }; if (idx >= 0) X[idx] = X[idx].copy(F = V)` |
| Any other shape                                       | Faithful spread fallback (current behavior)                          | Faithful spread fallback                                                              |

**Companion compiler change**: when the compiler detects a `signal<T[]>(...)` declaration whose array is mutated in-place (via the patterns above), the Kotlin emit switches from `mutableStateOf(listOf())` to `mutableStateListOf<T>()` for per-element observability. Same source compiles to either depending on whether mutation patterns are detected. **Swift behavior is unchanged** (Swift's `@State var X: [T]` already supports in-place mutation with proper re-render).

**Deliverable**: TodoMVC's `addTodo`/`remove`/`clearCompleted`/`toggle` emit idiomatic Swift/Kotlin mutations.

**Validation**:

- Unit tests per pattern
- Round-trip: TodoMVC array mutations work correctly in iOS simulator
- Perf comparison: Kotlin `mutableStateListOf` path vs faithful-spread path on a 1k-row list — assert per-row recompose count drops from O(N) to O(1) on single-row mutations

**Effort**: 2-3 weeks. The mutation patterns are conceptually simple; per-pattern AST detection + emit are tedious. The perf-comparison test setup adds a few days.

**Depends on**: none structurally, but should land after A1 + A2 so the test fixtures use realistic full-app shapes.

### A4 — TodoMVC reference example app

**Branch**: `feat/native-todomvc-reference`

**Scope**: drop a working TodoMVC into `examples/native-todomvc-ios/` using the same Xcode-project shape as Phase 0's counter example. Pyreon source per the walkthrough's full sample. Validates that A1+A2+A3 actually let TodoMVC compile + render.

**Deliverable**: TodoMVC compiles, builds, runs in iOS simulator. Add todo, toggle done, filter, delete, clear completed — all work.

**Validation** — extends Phase 0 PR 4's validation pattern:

- ✅ `./scripts/build.sh && xcodebuild ... build` exits 0
- ✅ App launches in iOS simulator
- ✅ Type a todo, submit on Enter, see it appear
- ✅ Tap toggle, see strikethrough render
- ✅ Tap "Completed" filter, see only completed todos
- ✅ Tap "Clear completed", completed todos disappear
- ✅ CI: macOS runner runs simulator + screenshot-asserts each step

**Effort**: 1-2 weeks. Most time is debugging integration issues that surface only at TodoMVC scale (vs Counter's single-signal scale).

**Depends on**: A1 + A2 + A3.

---

## Chain B — 10 widget bindings (10 PRs, 6-10 weeks)

The PMTC plan names "10 native widget bindings" as Phase 1's widget surface. Each binding is one PR — small, focused, individually reviewable. The compiler's widget-name → SwiftUI primitive mapping is extended one entry at a time.

### The 10 widgets

| #   | Widget                | SwiftUI primitive            | Phase 0 status                                              |
| --- | --------------------- | ---------------------------- | ----------------------------------------------------------- |
| 1   | `<VStack>` / `<View>` | `VStack`                     | covered (Phase 0 fixture pipeline)                          |
| 2   | `<HStack>`            | `HStack`                     | NOT covered — Phase 1                                       |
| 3   | `<Text>`              | `Text`                       | covered                                                     |
| 4   | `<Button>`            | `Button`                     | covered                                                     |
| 5   | `<TextField>`         | `TextField`                  | Phase 1 (needs A1)                                          |
| 6   | `<Image>`             | `Image`                      | Phase 1                                                     |
| 7   | `<ScrollView>`        | `ScrollView`                 | Phase 1                                                     |
| 8   | `<List>` (sectioned)  | `List`                       | Phase 1 (distinct from `<For>` — uses platform list chrome) |
| 9   | `<Toggle>` (Switch)   | `Toggle`                     | Phase 1 (needs A1)                                          |
| 10  | `<StatusBar>`         | `.statusBarHidden(...)` etc. | Phase 1                                                     |

**Not in Phase 1** (deferred to Phase 2+): `<Touchable>` (gesture handling), `<DatePicker>`, `<Picker>`, `<Slider>`, `<TabView>`, `<NavigationStack>` (Phase 3 router work), `<TabBar>`, `<Drawer>`, `<Sheet>` (modal presentation).

### Per-widget PR shape

Each B chain PR is ~1 week:

1. **Compiler mapping**: add the widget to the parser's recognized list + emitter's per-widget shape table
2. **`@pyreon/native-runtime-swift` binding**: add a Swift type alias or wrapper view if needed for prop translation
3. **Snapshot tests**: add a fixture under `packages/native/compiler/src/fixtures/` + snapshot tests in `tests/swift.test.ts` mirroring the existing 7-fixture pattern
4. **Documentation**: add the widget to a Phase 1 widget-coverage doc

### Order recommendation

Ship in dependency order — widgets that don't depend on Chain A first:

1. `<HStack>` — simplest, mirrors `<VStack>`
2. `<Image>` — no signal binding, just prop pass-through
3. `<ScrollView>` — wrapper for existing content
4. `<List>` — sectioned/grouped list with platform chrome
5. `<StatusBar>` — non-visual, just a modifier
6. `<TextField>` — needs A1
7. `<Toggle>` — needs A1
8. `<Button>` (extended — destructive role, leading icon, etc.) — already exists, extend
9. Variants and refinements of above

### Effort

Each widget: ~1 week (compiler mapping + binding + tests + docs). 10 widgets serialized = 10 weeks. Most can run in parallel with Chain A + Chain C work.

---

## Chain C — Platform abstractions (3 PRs, 4-8 weeks)

The platform abstractions spec (#802) defines the package shape. Chain C ships the first two reference implementations + the compiler manifest-reader work that consumes them.

### C1 — Compiler manifest-reader + binding resolver

**Branch**: `feat/native-compiler-manifest-reader`

**Scope**: extend the compiler to:

1. Read `PYREON_NATIVE_BINDINGS` from imported packages' `package.json` files (per the spec in #802)
2. Resolve per-platform bindings using the algorithm in the spec
3. Emit native imports + call shapes for resolved bindings
4. Add the corresponding SPM / Maven dependency to the generated Xcode / Android Studio project
5. Fail loudly with actionable errors when target implementations are missing

**Not in scope**: any concrete abstraction package (those land in C2 + C3). This PR ships the GENERIC mechanism — once it lands, abstractions can be added without compiler changes.

**Deliverable**: the compiler's manifest-resolver is generic. The first abstraction (C2) doesn't require compiler changes — it just adds a manifest entry.

**Validation**:

- Unit tests with a synthetic test-only manifest
- The compiler emits the right shape for a synthetic `useTestThing()` call
- The missing-implementation error message matches the spec
- The generated Xcode project includes the right SPM dependency

**Effort**: 2-3 weeks. The hard part is the package-resolution logic (finding the abstract package on disk, parsing its manifest, walking to its native siblings, validating their `pyreon.json`).

**Depends on**: Phase 0 PR 5e (async type mapper) complete — the manifest-reader leans on the type-mapper's pattern.

### C2 — `@pyreon/storage` reference implementation

**Branch**: `feat/native-storage-ios-android`

**Scope**: ship the first concrete cross-platform abstraction per the #802 spec:

1. **`@pyreon/storage/package.json`**: add the `PYREON_NATIVE_BINDINGS` manifest entry for `useStorage` / `useSessionStorage`. (`useCookie` / `useIndexedDB` / `useMemoryStorage` get manifest entries that point at web-only — native targets that try to use them get a clear "not supported on native, use useStorage" error.)
2. **`packages/native/abstractions/storage-ios/`**: new Swift Package
   - `Package.swift` declaring iOS 17+ target
   - `Sources/PyreonStorage/useStorage.swift` implementing `useStorage<T: Codable>(key:defaultValue:)` via `@AppStorage` for primitives + `UserDefaults` + JSONEncoder for arbitrary Codable types
   - `Sources/PyreonStorage/useSessionStorage.swift` implementing via in-memory `Dictionary` keyed by app process (no actual session-per-tab concept on iOS — explicit limitation documented)
   - Tests
   - `pyreon.json` declaring exports per the spec
3. **`packages/native/abstractions/storage-android/`**: new Kotlin module
   - `build.gradle.kts`
   - `src/main/kotlin/io/pyreon/storage/useStorage.kt` implementing via `DataStore` + `kotlinx-serialization`
   - `src/main/kotlin/io/pyreon/storage/useSessionStorage.kt` (in-memory, same limitation)
   - JUnit specs
   - `pyreon.json`

**Deliverable**: TodoMVC's `useStorage<Todo[]>('pyreon-todomvc:todos', [])` works end-to-end on iOS simulator. Todos persist across app restarts.

**Validation**:

- C1's compiler resolver correctly substitutes the iOS binding
- TodoMVC iOS app reads/writes UserDefaults via the binding
- Manifest schema gate (per #802) passes for the new manifest
- Cross-package consistency gate passes for storage-ios + storage-android
- App restart preserves todos in iOS simulator

**Effort**: 2-3 weeks. The Swift + Kotlin implementations are small (each ~200 lines including tests); most time is per-platform packaging setup (SPM `Package.swift`, Gradle `build.gradle.kts`).

**Depends on**: C1.

### C3 — `@pyreon/deep-links` (optional, Phase 1 stretch goal)

**Branch**: `feat/native-deep-links-ios-android`

**Scope**: second reference implementation following the C2 pattern. Validates that the manifest mechanism scales beyond one consumer.

**Per-platform shapes**:

- iOS: `.onOpenURL` SwiftUI modifier + Universal Links entitlement
- Android: `Intent.ACTION_VIEW` + intent-filter in AndroidManifest
- Web: pairs with existing `@pyreon/router`

**Deliverable**: tapping a Universal Link on iOS opens the Pyreon app and routes to the right component via `@pyreon/deep-links`.

**Effort**: 1-2 weeks (smaller than storage; Universal Links + intent filters are well-trodden patterns).

**Depends on**: C2 (validates the mechanism on a simpler abstraction first).

**Status**: stretch goal. If Phase 1 runs long, defer to Phase 2. The minimum Phase 1 deliverable for Chain C is C1 + C2.

---

## Dependency graph

```
                ┌─────────────────────────────────────┐
                │   PHASE 0 COMPLETE (PMTC criteria   │
                │    1, 2, 3 all met — see #797)      │
                └──────────────────┬──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
          ┌───────┐            ┌───────┐           ┌──────┐
          │  A1   │            │  B1   │           │  C1  │
          │ two-  │            │HStack │           │ mfst │
          │ way   │            └───┬───┘           │reader│
          │binding│                │               └───┬──┘
          └───┬───┘                ▼                   │
              │                ┌───────┐               ▼
              ▼                │  B2   │           ┌──────┐
          ┌───────┐            │ Image │           │  C2  │
          │  A2   │            └───┬───┘           │ stor-│
          │ keybd │                │               │ age  │
          │       │                ▼                imp │
          └───┬───┘            ┌───────┐           └───┬──┘
              │                │  B3   │               │
              ▼                │Scroll │               ▼
          ┌───────┐            └───┬───┘           ┌──────┐
          │  A3   │                ⋮                │  C3  │
          │ array │             (B4..B10)          │ deep │
          │ mut.  │                                │ links│
          └───┬───┘                                │ (opt)│
              │                                   └──────┘
              ▼
          ┌───────┐
          │  A4   │
          │TodoMVC│
          │ ref.  │
          │  app  │ ◄────────── PHASE 1 DELIVERABLE
          └───────┘
```

**Critical path**: A1 → A2 → A3 → A4 (4-6 weeks). Chain B widgets and Chain C abstractions can ship in parallel with Chain A.

---

## Phase 1 completion checklist

| Checkpoint                                                                | Closed by                  | Status |
| ------------------------------------------------------------------------- | -------------------------- | ------ |
| TodoMVC compiles + runs on iOS simulator (add/toggle/filter/delete/clear) | A1+A2+A3+A4                | open   |
| 10 widget bindings ship                                                   | B1-B10                     | open   |
| First cross-platform abstraction works end-to-end (storage)               | C1+C2                      | open   |
| Real-Chromium-style fidelity test passes for ≥3 rocketstyle components    | extends Phase 0 PR 8       | open   |
| At least 50 cumulative compiler tests pass (currently 14 from PR #794)    | implicit across all chains | open   |
| No regressions: every Phase 0 spec / fixture / criterion still green      | CI                         | open   |

When all six close, Phase 1 is **complete**. Next decision: Phase 2 (Android parity) staffing.

---

## Effort summary

| Sequencing                                               | Optimistic  | Risk-adjusted |
| -------------------------------------------------------- | ----------- | ------------- |
| 1 contributor (serialized through chain A then B then C) | 16-24 weeks | 20-30 weeks   |
| 2 contributors (A on critical path, B + C in parallel)   | 10-16 weeks | 14-20 weeks   |
| 3 contributors (A / B / C all in parallel)               | 8-12 weeks  | 12-16 weeks   |

PMTC plan's "+4-6 months" envelope = 16-24 weeks. **1-contributor serialized hits the upper end optimistically; 2-contributor parallel hits the middle.** Risk-adjusted ranges cover: A2's per-key emit table needing per-key fixes, A3's pattern detection edge cases, B chain widgets exposing per-widget SwiftUI nuances, C2's Codable conformance edge cases.

---

## Honest dependencies on Phase 0 outcomes

Phase 1 staffing should NOT happen until Phase 0's three criteria report results. The Phase 1 design assumes:

| Phase 0 outcome                               | Phase 1 impact                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Criterion 1 (type mapper ≥90%) PASSES         | Chain A1+A3 can rely on the type mapper for prop type translation. **Assumption holds.**                                  |
| Criterion 1 FAILS (coverage ~60%)             | Chain A is much harder — manual annotation needed at many call sites. Phase 1 needs +4-8 weeks to harden the type mapper. |
| Criterion 2 (counter on iOS simulator) PASSES | Pipeline shape is proven. Chain B can extend without re-deriving.                                                         |
| Criterion 2 FAILS                             | Phase 1 cannot start. Phase 0 must be debugged and re-spiked.                                                             |
| Criterion 3 (style fidelity <5%) PASSES       | Chain B can ship widgets with confidence that rocketstyle composition works.                                              |
| Criterion 3 FAILS at 10-15% pixel diff        | Acceptable — re-tune the threshold per the Phase 0 roadmap's note. Chain B proceeds.                                      |
| Criterion 3 FAILS at >20% pixel diff          | Style emitter has structural problems; Phase 1 needs to extend Phase 0 PRs 7a-7c.                                         |

**Don't staff Phase 1 until Phase 0 reports.** If Phase 0 fails any criterion, the answer is "fix Phase 0," not "press on into Phase 1 anyway."

---

## What's NOT in Phase 1 (deliberate)

- **Android** (Phase 2). All work is iOS-only. Compiler already emits Kotlin (PR #794), but Android Studio integration + Compose runtime work is Phase 2.
- **Routing / navigation** (Phase 3). `@pyreon/router-ios` + `@pyreon/router-android` are Phase 3. TodoMVC in Phase 1 has no URL hash filter sync (just signal-based filter state).
- **Animations** (Phase 3). The PMTC plan's `@pyreon/kinetic` is web-only; Phase 1 TodoMVC has no animations (the rocketstyle `state="completed"` dimension change happens instantly, not animated).
- **Hot reload / dev mode** (Phase 3). The compiler runs as a build step; saving a TSX file requires manual rebuild + simulator relaunch.
- **Debugger / source-map polish** (Phase 1+ partially). The compiler emits `#sourceLocation(file:line:)` directives; whether Xcode breakpoints work cleanly is unmeasured.
- **App Store submission** (Phase 3). Phase 1 ships to simulator only. Real device deployment + provisioning + App Store packaging is Phase 3.
- **Real-app benchmarks** (Phase 3+). Phase 1 has structural correctness; perf benchmarks against hand-written SwiftUI are a Phase 3 concern.

---

## Recommendations

1. **Don't start Phase 1 until Phase 0 reports criteria results.** All three should pass; if any fail, fix Phase 0 first.
2. **Chain A is the critical path.** It blocks Phase 1's deliverable (TodoMVC on iOS). Other chains can run in parallel but don't unblock A.
3. **C1 (compiler manifest-reader) is foundational** and should be the FIRST C-chain PR — without it, no concrete abstraction can ship via the spec'd mechanism. Could potentially shift earlier (Phase 0 stretch goal after PR 5e) — see #802's sequencing recommendation.
4. **Chain B widget PRs are independent**; assign in any order based on contributor familiarity. Don't try to ship all 10 by one person serially — they're parallelizable.
5. **C3 (deep-links) is a stretch goal.** If Phase 1 runs long, push to Phase 2. Minimum Phase 1 C-chain is C1 + C2.
6. **Lock in user-survey results** (per #795 + the forthcoming user-survey design doc) before Phase 1 staffing. The Phase 0 technical spike validates "PMTC is buildable"; the survey validates "users actually want it." Both should green-light before committing 4-6 months of focused work.

---

## What this doc commits to

- **A concrete PR sequence** for Phase 1 with scope, dependencies, validation, and effort per PR.
- **Three parallel chains** (compositional gaps / widgets / abstractions) with clear coordination points.
- **Explicit Phase 0 prerequisites** — Phase 1 cannot start until all three criteria report results.
- **Honest staffing math** — 4-6 months matches PMTC plan for 1 contributor; 2.5-4 months for 2 contributors.
- **Explicit non-scope** — Android, routing, animations, hot reload, App Store all deferred.

## What this doc does NOT commit to

- **Concrete timeline kickoff.** Like Phase 0, this is HOW to execute Phase 1, not WHEN.
- **Per-widget SwiftUI API stability.** SwiftUI ships breaking-ish changes yearly at WWDC; Phase 1 might need to track new iOS releases.
- **`@pyreon/storage` API surface lock.** The reference implementation (C2) may surface API friction that requires the abstract package's interface to change — acceptable, but a separate revision PR.
- **Acceptance of Phase 0 criteria failures.** This doc assumes Phase 0 passes. If it doesn't, Phase 1 is paused until Phase 0 is fixed, not pressed forward.
