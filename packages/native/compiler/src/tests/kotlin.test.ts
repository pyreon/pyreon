// Pyreon → Kotlin snapshot tests.

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
  const result = transform(source, { target: 'kotlin' })
  if (result.warnings.length > 0) {
    throw new Error(`Unexpected warnings: ${result.warnings.join('; ')}`)
  }
  return result.code
}

describe('Pyreon → Kotlin emit', () => {
  it('01 — stateless component', () => {
    expect(emit('01-stateless.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Greeting() {
        Text(text = "Hello, world")
      }"
    `)
  })

  it('02 — single signal', () => {
    expect(emit('02-signal.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Counter() {
        var count by remember { mutableStateOf(0) }
        Text(text = "\${count}")
      }"
    `)
  })

  it('03 — computed value', () => {
    expect(emit('03-computed.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Doubled() {
        var count by remember { mutableStateOf(0) }
        val doubled by remember { derivedStateOf { count * 2 } }
        Text(text = "\${doubled}")
      }"
    `)
  })

  it('04 — event handler', () => {
    expect(emit('04-event.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Increment() {
        var count by remember { mutableStateOf(0) }
        Button(onClick = { count = count + 1 }) {
          Text("Increment")
        }
      }"
    `)
  })

  it('05 — multi-signal + dependent computed', () => {
    expect(emit('05-multi-signal.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Sum() {
        var a by remember { mutableStateOf(1) }
        var b by remember { mutableStateOf(2) }
        val total by remember { derivedStateOf { a + b } }
        Text(text = "\${total}")
      }"
    `)
  })

  it('06 — <For> keyed list', () => {
    expect(emit('06-for.tsx')).toMatchInlineSnapshot(`
      "data class TodoListItem(val id: Int, val label: String)

      @Composable
      fun TodoList() {
        var items by remember { mutableStateOf<List<TodoListItem>>(listOf()) }
        LazyColumn {
          items(items, key = { it.id }) { item ->
            Text(text = "\${item.label}")
          }
        }
      }"
    `)
  })

  it('07 — <Show> conditional', () => {
    expect(emit('07-show.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Toggle() {
        var visible by remember { mutableStateOf(true) }
        if (visible) {
          Text(text = "Visible")
        }
      }"
    `)
  })

  it('08 — string-typed computed', () => {
    // Kotlin's `by remember { derivedStateOf { ... } }` infers the
    // result type natively (the `by` delegate unwraps `State<T>` to
    // `T`), so no emitter change needed on this side. The fixture
    // still validates the cross-target story: same Pyreon source,
    // both targets produce idiomatic per-platform computed code.
    expect(emit('08-string-computed.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Greeting() {
        var name by remember { mutableStateOf("world") }
        val message by remember { derivedStateOf { "Hello, " + name } }
        Text(text = "\${message}")
      }"
    `)
  })

  it('09 — component with props', () => {
    // Pyreon `function Card(props: { title: string; description: string })`
    // becomes a Composable function with `title: String, description: String`
    // params. Member accesses `props.title` rewrite to bare `title`.
    expect(emit('09-props.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Card(title: String, description: String) {
        Text(text = "\${title}:\${description}")
      }"
    `)
  })

  it('10 — multi-component file + cross-component call', () => {
    // Two components in one file. `App` calls `Card(title = "Hello")` —
    // the existing emit-generic path turns an unknown JSX tag into a
    // function call with named-arg syntax, which is exactly what
    // Compose's `Card(title = "Hello")` invocation wants. Contract
    // lock: future PRs shouldn't accidentally break this shape.
    expect(emit('10-multi-component.tsx')).toMatchInlineSnapshot(`
      "@Composable
      fun Card(title: String) {
        Text(text = "\${title}")
      }

      @Composable
      fun App() {
        Card(title = "Hello")
      }"
    `)
  })
})
