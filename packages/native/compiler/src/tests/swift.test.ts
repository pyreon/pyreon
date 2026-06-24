// Pyreon → Swift snapshot tests.
//
// Each test loads a fixture from src/fixtures/, transforms it to Swift,
// and locks the output via an inline snapshot. When the IR or emitter
// changes intentionally, regenerate with `vitest -u`.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(HERE, '..', 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), 'utf8')
}

function emit(name: string): string {
  const source = loadFixture(name)
  const result = transform(source, { target: 'swift' })
  if (result.warnings.length > 0) {
    throw new Error(`Unexpected warnings: ${result.warnings.join('; ')}`)
  }
  return result.code
}

describe('Pyreon → Swift emit', () => {
  it('01 — stateless component', () => {
    expect(emit('01-stateless.tsx')).toMatchInlineSnapshot(`
      "struct Greeting: View {
        var body: some View {
          Text("Hello, world")
        }
      }"
    `)
  })

  it('02 — single signal', () => {
    expect(emit('02-signal.tsx')).toMatchInlineSnapshot(`
      "struct Counter: View {
        @State private var count: Int = 0
        var body: some View {
          Text("\\(count)")
        }
      }"
    `)
  })

  it('03 — computed value', () => {
    expect(emit('03-computed.tsx')).toMatchInlineSnapshot(`
      "struct Doubled: View {
        @State private var count: Int = 0
        private var doubled: Int { count * 2 }
        var body: some View {
          Text("\\(doubled)")
        }
      }"
    `)
  })

  it('04 — event handler', () => {
    expect(emit('04-event.tsx')).toMatchInlineSnapshot(`
      "struct Increment: View {
        @State private var count: Int = 0
        var body: some View {
          Button("Increment") { count = count + 1 }
        }
      }"
    `)
  })

  it('05 — multi-signal + dependent computed', () => {
    expect(emit('05-multi-signal.tsx')).toMatchInlineSnapshot(`
      "struct Sum: View {
        @State private var a: Int = 1
        @State private var b: Int = 2
        private var total: Int { a + b }
        var body: some View {
          Text("\\(total)")
        }
      }"
    `)
  })

  it('06 — <For> keyed list', () => {
    expect(emit('06-for.tsx')).toMatchInlineSnapshot(`
      "struct TodoListItem: Codable {
        var id: Int
        var label: String
      }

      struct TodoList: View {
        @State private var items: [TodoListItem] = []
        var body: some View {
          ForEach(items, id: \\.id) { item in
            Text("\\(item.label)")
          }
        }
      }"
    `)
  })

  it('07 — <Show> conditional', () => {
    expect(emit('07-show.tsx')).toMatchInlineSnapshot(`
      "struct Toggle: View {
        @State private var visible: Bool = true
        var body: some View {
          if visible {
            Text("Visible")
          }
        }
      }"
    `)
  })

  it('08 — string-typed computed (proves type inference)', () => {
    // Pre-PR-3 the naive emitter would have produced
    // `private var message: Int { ... }` which swiftc would reject.
    // PR 3's `inferType` walks `'Hello, ' + name()` to `string` so
    // the computed property gets the right Swift type.
    expect(emit('08-string-computed.tsx')).toMatchInlineSnapshot(`
      "struct Greeting: View {
        @State private var name: String = "world"
        private var message: String { "Hello, " + name }
        var body: some View {
          Text("\\(message)")
        }
      }"
    `)
  })

  it('09 — component with props', () => {
    // Pyreon `function Card(props: { title: string; description: string })`
    // becomes a SwiftUI struct with `let title: String` + `let description: String`.
    // Member accesses `props.title` rewrite to bare `title` in the body.
    expect(emit('09-props.tsx')).toMatchInlineSnapshot(`
      "struct Card: View {
        let title: String
        let description: String
        var body: some View {
          Text("\\(title): \\(description)")
        }
      }"
    `)
  })

  it('10 — multi-component file + cross-component call', () => {
    // Two components in one file. `App` calls `<Card title="Hello" />`,
    // which goes through the existing emit-generic path — an unknown
    // JSX tag becomes a constructor call with named-arg syntax, which
    // is exactly what SwiftUI's `Card(title: "Hello")` initializer
    // wants. No compiler changes needed for this; the fixture locks
    // the behavior as a contract so future PRs don't break it.
    expect(emit('10-multi-component.tsx')).toMatchInlineSnapshot(`
      "struct Card: View {
        let title: String
        var body: some View {
          Text("\\(title)")
        }
      }

      struct App: View {
        var body: some View {
          Card(title: "Hello")
        }
      }"
    `)
  })
})
