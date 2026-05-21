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

      struct TodoApp: View {
        @AppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []
        @State private var filter: Filter = .all
        @State private var draft: String = ""
        private var visible: Any { xs }
        private var remaining: Any { todos.filter({ t in !t.done }).length }
        private var hasCompleted: Any { todos.some({ t in t.done }) }
        private func addTodo() {
          let text = draft.trim()
          if text.length == 0 {
            return
          }
          todos = todos + [(id: nextId + 1, text: text, done: false)]
          draft = ""
        }
        private func toggle(id: Int) {
          todos = todos.map({ t in t.id == id ? { var c = t; c.done = !t.done; return c }() : t })
        }
        private func remove(id: Int) {
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
              TodoRow(todo: t)
            }
            HStack {
              Text("\\(remaining) remaining")
              Button("All") { filter = .all }
              Button("Active") { filter = .active }
              Button("Completed") { filter = .completed }
              if hasCompleted {
                Button("Clear completed") { clearCompleted }
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
            Checkbox(checked: todo.done)
            Text("\\(todo.text)")
            Button("Remove") { onRemove }
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
    expect(unique).toMatchInlineSnapshot(`
      [
        "Computed visible: multi-statement body collapsed to its return expression — pre-return statements silently dropped (Phase 1 emit limitation)",
      ]
    `)
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

  it('G5 — useStorage<T>(key, default) emits @AppStorage on Swift', () => {
    // CLOSED by this PR. The parser now recognises
    // `const x = useStorage<T>('key', default)` as a persistent signal
    // (DeclIR.signal with `storageKey`). The Swift emit routes it to
    // SwiftUI's `@AppStorage("key")` property wrapper. The locked
    // Swift-emit snapshot above already proves this; the explicit
    // assertion here is the gap-closure marker.
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('@AppStorage("pyreon-todomvc:todos") private var todos: [Todo] = []')
  })

  it('G5 — useStorage<T>(key, default) emits `rememberSaveable` on Kotlin', () => {
    // CLOSED by this PR. The Kotlin emit routes storage signals to
    // Compose's `rememberSaveable` — same `by` delegate as `remember`
    // so call sites work without parens. Note: `rememberSaveable`
    // requires Parcelable/Serializable types for round-trip; complex
    // types need a custom Saver — Phase 2.
    const out = transform(source, { target: 'kotlin' })
    expect(out.code).toMatch(/var todos by rememberSaveable \{ mutableStateOf<List<Todo>>\(listOf\(\)\) \}/)
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
})
