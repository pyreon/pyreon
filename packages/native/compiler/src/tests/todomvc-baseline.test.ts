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
//   G1 TextField two-way binding (`text: $draft` on Swift)
//   G2 Keyboard event handling (`onKeyDown` → `.onSubmit`)
//   G3 Array mutation idioms (immutable spread vs platform mutate)
//   G4 Object-in-array partial updates (`map(t => t.id === id ? ... : t)`)
//   G5 @pyreon/storage cross-platform abstraction (`useStorage`)
//   G6 String-literal union → native enum (`'all' | 'active' | 'completed'`)
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
          todos = todos.map({ t in t.id == id ? (done: !t.done) : t })
        }
        private func remove(id: Int) {
          todos = todos.filter({ t in t.id != id })
        }
        private func clearCompleted() {
          todos = todos.filter({ t in !t.done })
        }
        var body: some View {
          VStack {
            TextField(value: draft, placeholder: "What needs to be done?")
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

  it.todo('G1 — TextField two-way binding emits `text: $draft` on Swift', () => {
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('TextField(')
    expect(out.code).toContain('text: $draft')
  })

  it.todo('G2 — onKeyDown=Enter handler emits `.onSubmit { ... }` on Swift', () => {
    const out = transform(source, { target: 'swift' })
    expect(out.code).toMatch(/\.onSubmit\s*\{/)
  })

  it.todo('G5 — useStorage<T>(key, default) emits @AppStorage on Swift', () => {
    const out = transform(source, { target: 'swift' })
    expect(out.code).toContain('@AppStorage("pyreon-todomvc:todos")')
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
