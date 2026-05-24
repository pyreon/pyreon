// TodoMVC compile-baseline — the structural test of whether the full
// compiler stack handles a real-app shape.
//
// Per `.claude/plans/native-platforms-todomvc-walkthrough.md` (#799),
// TodoMVC exercises 8 distinct Pyreon constructs the 7 starter
// fixtures don't combine. The walkthrough doc names 8 compositional
// gaps that need closing before TodoMVC can compile cleanly.
//
// This baseline test:
//   1. Compiles the canonical TodoMVC source
//   2. Captures the CURRENT (partial) emit as a snapshot
//   3. Tracks the warnings — each is a named gap from the walkthrough
//
// Each gap-closure PR (G1..G8) will then update this snapshot AND
// reduce the warning count by one. The test fails when emit drift
// happens — both progress (warnings decrease, emit gets richer) and
// regression (warnings increase, emit shrinks) trigger explicit
// snapshot update via `vitest -u`.
//
// What the baseline currently DOESN'T support (from the walkthrough's
// 8 named gaps):
//
//   G1 TextField two-way binding (`text: $draft` on Swift)   ✓ CLOSED
//   G2 Keyboard event handling (`onKeyDown` → `.onSubmit`)   ✓ CLOSED
//   G3 Array mutation idioms (immutable spread vs platform mutate)
//   G4 Object-in-array partial updates (`map(t => t.id === id ? ... : t)`)   ✓ CLOSED
//   G5 @pyreon/storage cross-platform abstraction (`useStorage`)   ✓ CLOSED
//   G6 String-literal union → native enum (`'all' | 'active' | 'completed'`)   ✓ CLOSED
//   G7 rocketstyle conditional dimension expressions
//   G8 @pyreon/router URL-hash filter sync (Phase 3 work)
//
// Plus the parser-side gaps surfaced by the actual compile (which
// the walkthrough didn't name but show up):
//
//   Parser-A BlockStatement arrow bodies (`addTodo = () => { ... }`)
//   Parser-B UnaryExpression in arrow bodies (`!t.done`)
//   Parser-C LogicalExpression (`a && b()`)

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const TODOMVC_SOURCE_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'examples',
  'native-todomvc-ios',
  'src',
  'TodoApp.tsx',
)

describe('TodoMVC compile baseline', () => {
  const source = readFileSync(TODOMVC_SOURCE_PATH, 'utf8')

  it('Swift emit — current partial output', () => {
    const out = transform(source, { target: 'swift' })
    expect(out.code).toMatchInlineSnapshot(`
      "enum Filter: String {
        case all, active, completed
      }

      struct Todo: Codable {
        var id: Int
        var text: String
        var done: Bool
      }

      private var nextId = 1

      struct TodoApp: View {
        @PyreonAppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []
        @State private var filter: Filter = .all
        @State private var draft: String = ""
        private var visible: [Todo] {
          let xs = todos
          if filter == .active {
            return xs.filter({ t in !t.done })
          }
          if filter == .completed {
            return xs.filter({ t in t.done })
          }
          return xs
        }
        private var remaining: Int { todos.filter({ t in !t.done }).count }
        private var hasCompleted: Bool { todos.contains(where: { t in t.done }) }
        private func addTodo() {
          let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
          if text.count == 0 {
            return
          }
          todos = todos + [Todo(id: nextId + 1, text: text, done: false)]
          draft = ""
        }
        private func toggle(_ id: Int) {
          todos = todos.map({ t in t.id == id ? { var c = t; c.done = !t.done; return c }() : t })
        }
        private func remove(_ id: Int) {
          todos = todos.filter({ t in t.id != id })
        }
        private func clearCompleted() {
          todos = todos.filter({ t in !t.done })
        }
        var body: some View {
          VStack {
            TextField("What needs to be done?", text: $draft)
              .onSubmit { addTodo() }
            ForEach(visible, id: \\.id) { t in
              TodoRow(todo: t, onToggle: { toggle(t.id) }, onRemove: { remove(t.id) })
            }
            HStack {
              Text("\\(remaining) remaining")
              Button("All") { filter = .all }
              Button("Active") { filter = .active }
              Button("Completed") { filter = .completed }
              if hasCompleted {
                Button("Clear completed") { clearCompleted() }
              }
            }
          }
        }
      }

      struct TodoRow: View {
        let todo: Todo
        let onToggle: () -> Void
        let onRemove: () -> Void
        var body: some View {
          HStack {
            Image(systemName: todo.done ? "checkmark.square.fill" : "square")
            Text("\\(todo.text)")
            Button("Remove") { onRemove() }
          }
        }
      }"
    `)
  })

  it('warnings list — each is a known compositional gap', () => {
    const out = transform(source, { target: 'swift' })
    // Sorted + deduped for stable snapshot. Each warning corresponds
    // to a parser-side gap. As gap-closure PRs land, this list shrinks.
    const unique = Array.from(new Set(out.warnings)).sort()
    expect(unique).toMatchInlineSnapshot(`[]`)
  })

  it('Kotlin emit — current partial output', () => {
    const out = transform(source, { target: 'kotlin' })
    // Kotlin emit MUST exist (the parser front-end is shared). Don't
    // snapshot the full text — too brittle pre-gap-closure. Just
    // structural anchors.
    expect(out.code).toContain('@Composable')
    expect(out.code).toContain('fun TodoApp(')
    expect(out.code).toContain('fun TodoRow(')
  })
})

describe('TodoMVC gap-tracking baseline', () => {
  // This test exists to fail when gap-closure happens. Each named gap
  // below corresponds to a follow-up PR (G1..G8). The expectations
  // describe what the EMIT SHOULD look like post-fix. Pre-fix, they're
  // pending. The closure PR updates this to `.toContain(...)` matching
  // the fixed shape.

  const source = readFileSync(TODOMVC_SOURCE_PATH, 'utf8')

  it('G1 — TextField two-way binding emits `text: $draft` on Swift', () => {
    // CLOSED by this PR. The TextField emit pattern-matches
    // value+identifier matching a known signal in scope and emits
    // SwiftUI's binding-projection (`$signal`) syntax. The locked
    // Swift-emit snapshot above already proves this; the explicit
    // assertion here is the gap-closure marker for readers scanning
    // the test file.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('TextField(')
    expect(out.code).toContain('text: $draft')
  })

  it('G1 — TextField two-way binding emits Compose `onValueChange` on Kotlin', () => {
    // CLOSED by this PR. Same pattern as Swift — when `value={x}`
    // names a known signal, the Kotlin emit becomes
    // `TextField(value = x, onValueChange = { x = it })` so a
    // Compose host with `var x by remember { mutableStateOf("") }`
    // wires up bidirectionally with no boilerplate.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('TextField(value = draft')
    expect(out.code).toContain('onValueChange = { draft = it }')
  })

  it('G2 — onKeyDown=Enter handler emits `.onSubmit { ... }` on Swift', () => {
    // CLOSED by this PR. The TextField emit pattern-matches the
    // canonical `(e) => e.key === 'Enter' && action()` shape on the
    // `onKeyDown` event and appends a SwiftUI `.onSubmit { action() }`
    // modifier. The locked Swift-emit snapshot above already proves
    // this; the explicit assertion here is the gap-closure marker.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toMatch(/\.onSubmit\s*\{\s*addTodo\(\)\s*\}/)
  })

  it('G2 — onKeyDown=Enter handler emits Compose `keyboardActions` on Kotlin', () => {
    // CLOSED by this PR. Same pattern as Swift — the Kotlin emit pairs
    // `keyboardOptions(imeAction = ImeAction.Done)` so the soft keyboard
    // shows "Done" + `keyboardActions(onDone = { action() })` so the
    // submit fires the action.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done)')
    expect(out.code).toMatch(/keyboardActions = KeyboardActions\(onDone = \{ addTodo\(\) \}\)/)
  })

  it('G4 — object partial-update {...t, k: v} emits IIFE copy on Swift', () => {
    // CLOSED by this PR. The object emit now pattern-matches a single-
    // spread + override-fields shape and emits Swift's immediately-
    // invoked closure form:
    //   `{ var c = t; c.done = !t.done; return c }()`
    // Works for both struct sources and labelled-tuple sources (what
    // Pyreon currently emits for anonymous record types). The locked
    // Swift-emit snapshot above proves this; the explicit assertion
    // here is the gap-closure marker.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toMatch(/\{ var c = t; c\.done = !t\.done; return c \}\(\)/)
  })

  it('G4 — object partial-update {...t, k: v} emits data class `.copy(...)` on Kotlin', () => {
    // CLOSED by this PR. Kotlin's data class `.copy(field = value)` is
    // the canonical copy-with-overrides idiom and maps 1:1 to the JS
    // `{...t, k: v}` source. Single-spread + identifier source only;
    // multi-spread and non-identifier sources fall through to the
    // tuple-literal emit.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toMatch(/t\.copy\(done = !t\.done\)/)
  })

  it('G5 — useStorage<T>(key, default) emits @PyreonAppStorage one-liner on Swift for non-native types (Phase 2.5)', () => {
    // CLOSED by G5 #849, simplified by Phase 2.5. When the value type
    // is NOT one of @AppStorage's native types (String / Int / Double /
    // Bool / URL / Data / RawRepresentable), the Swift emit calls
    // @PyreonAppStorage from @pyreon/native-runtime-swift (PR #885) —
    // a single line that wraps the previous 14-line Codable-Data
    // bridge into a property wrapper. Same UserDefaults backing, same
    // Binding<T> projection via `$todos`, same silent-fallback
    // failure semantics.
    //
    // Pre-2.5 (history): inline @AppStorage(Data) slot + computed
    // property doing JSON round-trip via JSONEncoder/JSONDecoder.
    // Identical runtime behavior; just dramatically simpler emit.
    //
    // Consumer apps need `import PyreonRuntime` for the wrapper to
    // resolve (compiler doesn't auto-emit imports — same convention
    // as @AppStorage which requires `import SwiftUI`).
    //
    // Native-typed storage signals (e.g. `useStorage<string>`)
    // continue to use the direct `@AppStorage` shape — see the
    // separate native-typed test below.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('@PyreonAppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []')
    // Negative: the old 14-line Data-bridge boilerplate must NOT
    // appear anywhere in the emit.
    expect(out.code).not.toContain('todosData: Data')
    expect(out.code).not.toContain('JSONDecoder')
    expect(out.code).not.toContain('JSONEncoder')
    expect(out.code).not.toContain('nonmutating set')
  })

  it('Phase 2 — useStorage<string> on Swift uses direct @AppStorage shape (no Codable bridge)', () => {
    // Confirms the type predicate works — native-typed storage signals
    // continue to emit the direct shape, no Codable-Data bridge.
    // Minimal source covering only a string-typed useStorage; we don't
    // need TodoMVC's full source for this assertion.
    const minimalSource = `
      import { useStorage } from '@pyreon/storage'
      export function Settings() {
        const username = useStorage<string>('user:name', 'guest')
        return <Text>{username()}</Text>
      }
    `
    const out = transform(minimalSource, { target: 'swift' })
    expect(out.code).toContain('@AppStorage("user:name") private var username: String = "guest"')
    expect(out.code).not.toContain('JSONDecoder')
    expect(out.code).not.toContain('JSONEncoder')
  })

  it('G5 — useStorage<T>(key, default) emits `rememberPyreonStorage` one-liner on Kotlin for non-native types (Phase 2.5)', () => {
    // CLOSED by G5 #849, simplified by Phase 2.5. When the value type
    // is NOT natively Saveable by Compose's `rememberSaveable`
    // (primitives + known enums + their Optionals), the Kotlin emit
    // calls `rememberPyreonStorage<T>` from @pyreon/native-runtime-kotlin
    // (PR #887) — a single line that wraps the previous 4-line
    // `Saver<T, String>` inline boilerplate into a Composable with
    // pluggable backend (InMemoryBackend default, DataStoreBackend
    // for real cross-launch persistence).
    //
    // Pre-2.5 (history): inline `rememberSaveable(saver = Saver<T,
    // String>(save, restore))` with `Json.encodeToString` /
    // `decodeFromString` round-trip. Identical Compose-state
    // behavior at runtime; just dramatically simpler emit AND now
    // backed by real cross-launch persistence (when DataStoreBackend
    // is wired) instead of `rememberSaveable`'s config-change-only
    // semantics.
    //
    // Consumer apps need `import com.pyreon.runtime.rememberPyreonStorage`
    // for the symbol to resolve (compiler doesn't auto-emit imports —
    // same convention as iOS).
    //
    // Native-typed storage signals continue to use the direct
    // `rememberSaveable { mutableStateOf(...) }` shape — see the
    // separate native-typed test below.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('var todos by rememberPyreonStorage<List<Todo>>("pyreon-todomvc:todos", listOf())')
    // Negative: the old Saver-inline boilerplate must NOT appear.
    expect(out.code).not.toContain('Saver<List<Todo>')
    expect(out.code).not.toContain('Json.encodeToString')
    expect(out.code).not.toContain('Json.decodeFromString')
  })

  it('Phase 2 — useStorage<string> on Kotlin uses direct rememberSaveable (no Saver)', () => {
    // Confirms the predicate works — native-typed storage signals
    // continue to emit the direct shape, no kotlinx-Json Saver overhead.
    const minimalSource = `
      import { useStorage } from '@pyreon/storage'
      export function Settings() {
        const username = useStorage<string>('user:name', 'guest')
        return <Text>{username()}</Text>
      }
    `
    const out = transform(minimalSource, { target: 'kotlin' })
    expect(out.code).toContain('var username by rememberSaveable { mutableStateOf("guest") }')
    expect(out.code).not.toContain('Json.encodeToString')
    expect(out.code).not.toContain('Json.decodeFromString')
  })

  it('Phase 2 — object-shape `type Todo = {...}` emits Swift `struct Todo: Codable` with `var` fields', () => {
    // FOUNDATIONAL Phase 2 step. Pre-PR, anonymous record types
    // referenced via typeRef (`[Todo]`) emitted as labelled tuples
    // `[(id: Int, text: String, done: Bool)]` — blocked Codable
    // conformance + @AppStorage type-safe round-trip. Now: real
    // `struct Todo: Codable { var id: Int; var text: String; var done: Bool }`.
    // `var` (not `let`) keeps the G4 IIFE-copy mutation idiom working.
    // `: Codable` added in the follow-up Codable-conformance PR —
    // unblocks JSON round-trip + the @AppStorage Codable-Data bridge.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('struct Todo: Codable {')
    expect(out.code).toContain('var id: Int')
    expect(out.code).toContain('var text: String')
    expect(out.code).toContain('var done: Bool')
  })

  it('Phase 2 — object-shape `type Todo = {...}` emits Kotlin `@Serializable data class Todo(...)`', () => {
    // Same as Swift but Kotlin idiomatic. `data class` gets `.copy()`
    // for free (already used by G4 #846's partial-update emit).
    // `@Serializable` annotation (kotlinx-serialization) is the Kotlin
    // parallel to Swift's `: Codable` — enables JSON round-trip + the
    // Compose `Saver` glue for `rememberSaveable<List<Todo>>`.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toMatch(/@Serializable\s*\ndata class Todo\(var id: Int, var text: String, var done: Boolean\)/)
  })

  it('Phase 2 — array-literal object whose fields match a known struct emits as struct initializer on Swift', () => {
    // Follow-up to Phase 2 struct emit. `{ id: ..., text: ..., done: false }`
    // inside an array assigned to `[Todo]` now emits as `Todo(id: ..., ...)`
    // instead of `(id: ..., ...)` (labelled tuple). Field-name matching:
    // exact field-set match (sorted) → struct initializer. Visible in
    // the locked Swift-emit snapshot above's `addTodo` body.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toMatch(/todos = todos \+ \[Todo\(id: .+, text: .+, done: false\)\]/)
  })

  it('Phase 2 — array-literal object whose fields match a known struct emits as data-class constructor on Kotlin', () => {
    // Kotlin parallel. Named-argument call (`Todo(id = ..., text = ..., done = false)`)
    // — Kotlin's data class constructor accepts the same source-order
    // the user wrote OR any order since args are named.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toMatch(/todos = todos \+ listOf\(Todo\(id = .+, text = .+, done = false\)\)/)
  })

  it('G6 — string-literal union Filter type emits `enum Filter: String`', () => {
    // CLOSED by #835. The locked Swift-emit snapshot above already
    // proves this; the explicit assertion here is the gap-closure
    // marker for readers scanning the test file.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('enum Filter: String')
    expect(out.code).toContain('case all, active, completed')
  })

  it(
    'Parser-A — BlockStatement arrow bodies parse + emit (addTodo / toggle / remove / clearCompleted as Swift functions)',
    () => {
      // CLOSED by Parser-A/B/C PR. All 4 mutation functions now emit
      // as real `private func` declarations.
      const out = transform(source, { target: 'swift' })
      // Each of the 4 const-arrow-function decls should land as a
      // Swift method on the struct.
      expect(out.code).toContain('private func addTodo()')
      expect(out.code).toContain('private func toggle(')
      expect(out.code).toContain('private func remove(')
      expect(out.code).toContain('private func clearCompleted()')
    },
  )

  it('Phase 2 — Swift TS-method translation (.length / .trim() / .some)', () => {
    // Phase 2 follow-up. The compiler rewrites TS methods that don't
    // exist (or have different semantics) in Swift:
    //   .length        → .count (universal on String + Array)
    //   .trim()        → .trimmingCharacters(in: .whitespacesAndNewlines)
    //   .some(p)       → .contains(where: p)
    // Closes the bulk of TodoMVC's remaining typecheck blockers
    // beyond the @AppStorage Codable-Data bridge (#859).
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('trimmingCharacters(in: .whitespacesAndNewlines)')
    expect(out.code).toContain('todos.contains(where: { t in t.done })')
    expect(out.code).toContain('text.count == 0')
    // No leftover TS-method names that would fail Swift typecheck.
    expect(out.code).not.toContain('.length')
    expect(out.code).not.toContain('.trim()')
    expect(out.code).not.toContain('.some(')
  })

  it('Phase 2 — Kotlin TS-method translation (.length extension preamble + .some → .any)', () => {
    // Kotlin parallel — different shape per language.
    //   .length        → extension property emitted at file top
    //                    (`private val <T> List<T>.length: Int get() = size`)
    //                    Restores TS surface parity for both String
    //                    (Kotlin String.length is native) AND List
    //                    (the extension forwards to .size).
    //   .some(p)       → .any(p)
    //   .filter / .map / .forEach pass through unchanged
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('private val <T> List<T>.length: Int get() = size')
    expect(out.code).toContain('todos.any({ t -> t.done })')
    // No leftover .some — would compile-error on List<Todo>.
    expect(out.code).not.toContain('.some(')
  })

  it('Phase 2 — module-level `let nextId = 1` emits as Swift `private var nextId = 1`', () => {
    // Closes the TodoMVC `nextId undefined` typecheck blocker.
    // Module-level mutable bindings (TS `let`) emit as Swift `private var`
    // at file scope, preserving the source's module-level privacy.
    // The locked Swift-emit snapshot above already proves this; the
    // explicit assertion here is the gap-closure marker.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('private var nextId = 1')
  })

  it('Phase 2 — module-level `let nextId = 1` emits as Kotlin `private var nextId = 1`', () => {
    // Kotlin parallel. TS `let` → Kotlin `var`; TS `const` → Kotlin `val`.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('private var nextId = 1')
  })

  it('Phase 2 — module-level `const` mutability is preserved (immutable emit `let`/`val`)', () => {
    // Verifies the mutability flow: TS `const` should emit immutable
    // bindings on both targets (`let` on Swift, `val` on Kotlin),
    // NOT the mutable forms.
    const constSource = `const APP_VERSION = '1.0.0'\nexport function App() { return <Text>x</Text> }`
    const swift = transform(constSource, { target: 'swift' })
    expect(swift.code).toContain('private let APP_VERSION = "1.0.0"')
    expect(swift.code).not.toContain('private var APP_VERSION')

    const kotlin = transform(constSource, { target: 'kotlin' })
    expect(kotlin.code).toContain('private val APP_VERSION = "1.0.0"')
    expect(kotlin.code).not.toContain('private var APP_VERSION')
  })

  it('Phase 2 — multi-statement computed body preserves pre-return statements', () => {
    // Closes the TodoMVC `visible: Any { xs }` typecheck blocker.
    // Pre-PR: parser collapsed multi-statement computed bodies to the
    // last return's expression — `xs` (an in-body `let` declaration)
    // ended up as an unresolved identifier in emit output.
    // Post-PR: emit produces a multi-statement Swift computed-property
    // getter with the `let` binding intact + the `if` early-returns +
    // the final return. swiftc-typecheck-clean against the inferred
    // return type ([Todo]).
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('private var visible: [Todo] {')
    expect(out.code).toContain('let xs = todos')
    expect(out.code).toMatch(/if filter == \.active \{[\s\S]+return xs\.filter/)
    expect(out.code).toContain('return xs')
  })

  it('Phase 2 — comparison against enum-typed signal rewrites string literal to .case', () => {
    // Related Phase 2 follow-up surfaced by the multi-statement work:
    // `if (filter() === 'active')` previously emitted as
    // `if filter == "active"` — Filter is an enum, swiftc rejects.
    // Now: `if filter == .active`. Mirrors the existing .set()-arg
    // enum-rewrite for assignment.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('if filter == .active {')
    expect(out.code).toContain('if filter == .completed {')
    expect(out.code).not.toContain('filter == "active"')
    expect(out.code).not.toContain('filter == "completed"')
  })

  it('K1 — Kotlin comparison against enum-typed signal rewrites string literal to qualified case', () => {
    // CLOSED by this PR. Kotlin parallel of the Swift enum-comparison
    // rewrite. Kotlin's `==` is type-checked (unlike JS's `===`), so
    // `if (filter == "active")` is rejected by kotlinc:
    //   "operator '==' cannot be applied to 'Filter' and 'String'"
    // The fix mirrors the Swift `_signalEnumTypes` plumbing — detect
    // an enum-typed signal-read LHS, set `_activeEnumType` before
    // emitting the RHS so the literal `"active"` rewrites to the
    // qualified case `Filter.active`. Kotlin requires the enum-name
    // prefix (Swift's `.active` inference doesn't apply).
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('if (filter == Filter.active)')
    expect(out.code).toContain('if (filter == Filter.completed)')
    expect(out.code).not.toContain('filter == "active"')
    expect(out.code).not.toContain('filter == "completed"')
  })

  it('K3 — Kotlin emit maps SwiftUI VStack/HStack to Compose Column/Row', () => {
    // CLOSED by this PR. The canonical TodoMVC source uses SwiftUI-
    // flavored layout names (`<VStack>`, `<HStack>`) which Swift's
    // emit accepts verbatim (SwiftUI provides those types). Compose
    // doesn't — `VStack`/`HStack` are unresolved references; the
    // Compose equivalents are `Column`/`Row` (and `Box` for ZStack).
    //
    // The fix is a small mapping table applied in `emitKotlinGeneric`
    // BEFORE `kotlinIdent`. Mapping is intentionally tactical for the
    // multiplatform demo phase; long-term PMTC will define a canonical
    // layout DSL and translate the OTHER direction for iOS too.
    //
    // The Swift snapshot above keeps emitting VStack/HStack — that's
    // correct, SwiftUI's primitive names.
    const out = transform(source, { target: 'kotlin' })
    // Column wraps the whole component body (top-level layout).
    expect(out.code).toMatch(/Column \{[\s\S]+TextField/)
    // Row wraps the filter button bar AND the TodoRow's inner layout.
    const rowMatches = out.code.match(/Row \{/g) ?? []
    expect(rowMatches.length).toBeGreaterThanOrEqual(2)
    // Negative assertions — the SwiftUI names must NOT leak through.
    expect(out.code).not.toContain('VStack {')
    expect(out.code).not.toContain('HStack {')
    expect(out.code).not.toContain('VStack(')
    expect(out.code).not.toContain('HStack(')
  })

  it('K2 — Kotlin multi-statement `derivedStateOf` body uses labeled returns', () => {
    // CLOSED by this PR. Bare `return` inside a Kotlin lambda passed
    // to a higher-order function (`derivedStateOf { … }`) tries to
    // return from the ENCLOSING function — kotlinc rejects with:
    //   error: 'return' is prohibited here
    //
    // Kotlin's labeled-return syntax `return@<label> expr` solves it.
    // The label is conventionally the receiver function's name. For
    // computed bodies the label is `derivedStateOf`.
    //
    // The fix threads a `lambdaLabel` field through `KotlinCtx` so
    // nested `if`/`else` branches inside the body also emit labeled
    // returns. Single-expression computed bodies (Kotlin's
    // expression-is-value lambda) are unchanged — they never emit a
    // `return` statement at all.
    //
    // Swift emit has no analog; Swift's closures allow bare `return`
    // to return from the closure unambiguously.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('return@derivedStateOf xs.filter({ t -> !t.done })')
    expect(out.code).toContain('return@derivedStateOf xs.filter({ t -> t.done })')
    expect(out.code).toContain('return@derivedStateOf xs')
    // Negative: bare `return` must NOT appear inside the derivedStateOf
    // body. (Function-decl bodies like `addTodo` legitimately use bare
    // `return` — those are real Kotlin functions, not lambdas.)
    expect(out.code).not.toMatch(/derivedStateOf \{[\s\S]*?\n\s*return [^@]/)
  })

  it('Phase 2 — computed return-type inference via TS method chains (.length → Int, .some → Bool)', () => {
    // Closes the "Any cannot conform to RandomAccessCollection"
    // typecheck blocker. The inferType pass now walks common TS
    // method calls on known-typed objects:
    //   array.filter(p)  → array (same element type)
    //   array.some(p)    → boolean
    //   array.length     → number  (member access on array)
    //   string.trim()    → string
    // So `computed(() => todos.filter(p).length)` infers `number`
    // and emits as `private var remaining: Int { ... }` (was: `Any`).
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('private var remaining: Int {')
    expect(out.code).toContain('private var hasCompleted: Bool {')
    // Negative — would have been `: Any { ... }` pre-PR.
    expect(out.code).not.toContain('private var remaining: Any')
    expect(out.code).not.toContain('private var hasCompleted: Any')
  })

  it('Phase 2 — user-defined component JSX forwards event handlers as constructor args (Swift)', () => {
    // Closes the TodoMVC `TodoRow(todo: t)` missing-args typecheck
    // blocker. Pre-PR, the generic JSX emit filtered out event handlers,
    // so `<TodoRow todo={t} onToggle={...} onRemove={...} />` lost the
    // event props on the way to the Swift constructor.
    //
    // Post-PR: when the tag matches a user-defined ComponentIR name,
    // event handlers are included as constructor closure args:
    //   TodoRow(todo: t, onToggle: { toggle(t.id) }, onRemove: { remove(t.id) })
    //
    // Note: SwiftUI primitives (HStack/VStack) still drop events — they
    // don't accept onClick: parameters, so including events there would
    // produce a typecheck error.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('TodoRow(todo: t, onToggle: { toggle(t.id) }, onRemove: { remove(t.id) })')
  })

  it('Phase 2 — user-defined component JSX forwards event handlers as constructor args (Kotlin)', () => {
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toContain('TodoRow(todo = t, onToggle = { toggle(t.id) }, onRemove = { remove(t.id) })')
  })

  it('Phase 2 — <Checkbox checked={x}> emits SwiftUI `Image(systemName: ...)` (last typecheck blocker)', () => {
    // Closes the LAST remaining typecheck error in the TodoMVC Swift
    // emit. Pyreon's `<Checkbox>` is a source-side convention; SwiftUI
    // doesn't ship a non-interactive Checkbox primitive. The closest
    // typecheck-clean read-only display is `Image(systemName: ...)`
    // with a conditional system symbol.
    //
    // After this PR, `swiftc -typecheck` on the actual TodoMVC emit
    // returns ZERO errors — the symbolic "TodoMVC compiles cleanly to
    // Swift" milestone for the in-compiler scope.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('Image(systemName: todo.done ? "checkmark.square.fill" : "square")')
    expect(out.code).not.toContain('Checkbox(')
  })

  it('Phase 2 — function-typed prop / decl handlers call inside trailing closures', () => {
    // Closes the "Button { onRemove } is a no-op" trap. When a
    // `Button onClick={onRemove}` handler is a bare identifier whose
    // name is a function-typed prop OR a function decl, the emit
    // produces `{ onRemove() }` instead of `{ onRemove }`.
    //
    // Without this, swiftc accepts the closure but at runtime nothing
    // happens — the trailing closure evaluates `onRemove` as a function
    // REFERENCE and discards it. TodoMVC's "Clear completed" Button
    // (using `clearCompleted` — function decl) AND TodoRow's "Remove"
    // Button (using `onRemove` — function-typed struct prop) both
    // need the call form.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('Button("Clear completed") { clearCompleted() }')
    expect(out.code).toContain('Button("Remove") { onRemove() }')
    // Negative — no leftover bare-identifier-as-closure-result shapes
    // for known function names. (Other identifiers like signal reads
    // legitimately stay bare — that path is unchanged.)
    expect(out.code).not.toContain('{ clearCompleted }')
    expect(out.code).not.toContain('{ onRemove }')
  })
})
