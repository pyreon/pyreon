// `JSON.parse` lowers to a typed native decode on both targets.
//
// It used to warn ("needs a native error model") and emit nothing, because it THROWS on malformed input and PMTC had
// no `try`/`throw` lowering. With that in place the remaining question is the TYPE: the web returns `any`, but Swift's
// `JSONDecoder` and kotlinx both need the target type up front. These specs pin where that type comes from (the cast,
// the declaration's annotation, a typed helper's return), that an untyped call is NAMED rather than guessed, and that
// the decode rides the error model exactly like a call to a throwing helper.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
  validateSwiftWithStubs,
} from '../validate'

const head = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
type Todo = { id: number; title: string }
`

const typed = `${head}
function loadTodos(raw: string): Todo[] {
  return JSON.parse(raw)
}
function App() {
  const out = signal('')
  const go = () => {
    try {
      const one: Todo = JSON.parse('{"id":1,"title":"a"}')
      const ids = JSON.parse('[1,2]') as number[]
      out.set(one.title + String(loadTodos('[]').length) + String(ids.length))
    } catch (e) {
      out.set(e.message)
    }
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const uncaught = `${head}
function App() {
  const out = signal('')
  const go = () => {
    const one = JSON.parse('{"id":1,"title":"a"}') as Todo
    out.set(one.title)
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const untyped = `${head}
function App() {
  const out = signal('')
  const go = () => {
    try { out.set(String(JSON.parse('1'))) } catch (e) { out.set(e.message) }
  }
  return (<Stack><Text>{out()}</Text><Button onPress={go}>Go</Button></Stack>)
}`

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })
const code = (src: string, target: 'swift' | 'kotlin') => emit(src, target).code
const warnings = (src: string, target: 'swift' | 'kotlin') => emit(src, target).warnings.join('\n')

describe('JSON.parse — where the decode type comes from', () => {
  it('Swift: the annotation, the cast and the helper return type each name the decode', () => {
    const swift = code(typed, 'swift')
    expect(swift).toContain('(try PyreonJSON.parse(Todo.self, ')
    expect(swift).toContain('(try PyreonJSON.parse([Int].self, ')
    expect(swift).toContain('func loadTodos(_ raw: String) throws -> [Todo] { (try PyreonJSON.parse([Todo].self, raw)) }')
    // The helper became `throws` through the decode alone — the fixed point sees it as a throw.
    expect(swift).toContain('(try loadTodos("[]"))')
  })

  it('Kotlin: the same three positions, no signature change', () => {
    const kotlin = code(typed, 'kotlin')
    expect(kotlin).toContain('PyreonJson.parse<Todo>(')
    expect(kotlin).toContain('PyreonJson.parse<List<Long>>(')
    expect(kotlin).toContain('fun loadTodos(raw: String): List<Todo> = PyreonJson.parse<List<Todo>>(raw)')
  })

  it('the handled shape lowers with no JSON warning on either target', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(typed, target)).not.toMatch(/JSON\.parse|TERMINATES/)
    }
  })
})

describe('JSON.parse — the error model', () => {
  it('an uncaught decode in a handler terminates natively, and says so', () => {
    // Swift: the named handler becomes `throws` through the decode, and the button that cannot throw calls it `try!`.
    const swift = code(uncaught, 'swift')
    expect(swift).toMatch(/private func go\(\) throws \{\s*let one = \(try PyreonJSON\.parse\(Todo\.self, /)
    expect(swift).toContain('Button("Go") { try! go() }')
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(uncaught, target)).toContain('TERMINATES the app')
    }
  })
})

describe('JSON.parse — shapes that do not lower are named', () => {
  it('a call nothing named a type for is warned once, not guessed', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = emit(untyped, target).warnings.filter((x) => x.includes('no type to decode into'))
      expect(w).toHaveLength(1)
      expect(code(untyped, target)).not.toContain('PyreonJson.parse<')
      expect(code(untyped, target)).not.toContain('PyreonJSON.parse(')
    }
  })

  it('a reviver argument has no native equivalent', () => {
    const src = untyped.replace("JSON.parse('1')", "JSON.parse('1', (k, v) => v)")
    expect(warnings(src, 'swift')).toContain('a reviver function has no native equivalent')
  })
})

describe('JSON.parse survives the real toolchains', () => {
  const sources = { typed, uncaught }
  for (const [name, src] of Object.entries(sources)) {
    it.skipIf(!isSwiftcAvailable())(`Swift: ${name} type-checks against the stub`, () => {
      const r = validateSwiftWithStubs(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isSwiftUIAvailable())(`Swift: ${name} type-checks against the real SwiftUI SDK`, () => {
      const r = validateSwiftTypecheck(code(src, 'swift'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`Kotlin: ${name} compiles on kotlinc`, () => {
      const r = validateKotlin(code(src, 'kotlin'))
      expect(r.ok, r.error ?? '').toBe(true)
    })
  }
})
