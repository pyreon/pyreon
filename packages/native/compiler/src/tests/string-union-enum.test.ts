// Tests for G6 — string-literal union → native enum.
//
// Closes the named gap from `native-platforms-todomvc-walkthrough.md`:
// TodoMVC's `type Filter = 'all' | 'active' | 'completed'` should
// emit as a native Swift/Kotlin enum, not a raw String. Without this,
// `signal<Filter>('all')` emits as `let filter: Filter = "all"` →
// Swift rejects with "Cannot find type 'Filter' in scope".
//
// Three layers tested:
//   1. Parser — recognises TSTypeAliasDeclaration of all-string-literal
//      unions and lifts to EnumIR.
//   2. Swift emit — produces `enum Filter: String { case ... }` + .set
//      call sites rewrite `"all"` → `.all`.
//   3. Kotlin emit — produces `enum class Filter { ... }` + .set
//      call sites rewrite `"all"` → `Filter.all` (qualified per Kotlin
//      conventions).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { parsePyreon } from '../parse'

describe('parse-time enum lifting', () => {
  it('recognises a string-literal union type alias', () => {
    const { enums, warnings } = parsePyreon(`
      type Filter = 'all' | 'active' | 'completed'
    `)
    expect(warnings).toHaveLength(0)
    expect(enums).toEqual([{ name: 'Filter', cases: ['all', 'active', 'completed'] }])
  })

  it('recognises an exported alias', () => {
    const { enums } = parsePyreon(`
      export type Status = 'idle' | 'busy'
    `)
    expect(enums).toEqual([{ name: 'Status', cases: ['idle', 'busy'] }])
  })

  it('does NOT lift mixed-type unions', () => {
    const { enums } = parsePyreon(`
      type Mixed = 'a' | 1 | true
    `)
    expect(enums).toEqual([])
  })

  it('does NOT lift non-union aliases', () => {
    const { enums } = parsePyreon(`
      type Foo = string
      type Bar = { x: number }
    `)
    expect(enums).toEqual([])
  })

  it('does NOT lift unions with non-string-literal members', () => {
    const { enums } = parsePyreon(`
      type X = 'a' | string
      type Y = 'a' | OtherType
    `)
    expect(enums).toEqual([])
  })

  it('does NOT lift generic type-parameter aliases', () => {
    const { enums } = parsePyreon(`
      type Box<T> = T | null
    `)
    expect(enums).toEqual([])
  })

  it('lifts multiple aliases in source order', () => {
    const { enums } = parsePyreon(`
      type A = 'x' | 'y'
      type B = 'u' | 'v' | 'w'
    `)
    expect(enums.map((e) => e.name)).toEqual(['A', 'B'])
  })
})

describe('Swift emit — string-literal union enum', () => {
  it('emits enum declaration + .case-rewritten signal initial', () => {
    const out = transform(
      `
        type Filter = 'all' | 'active' | 'completed'
        export function FilterPicker() {
          const filter = signal<Filter>('all')
          return <Text>{filter}</Text>
        }
      `,
      { target: 'swift' },
    )
    expect(out.code).toContain('enum Filter: String {\n  case all, active, completed\n}')
    expect(out.code).toContain('@State private var filter: Filter = .all')
  })

  it('rewrites .set(string-literal) call sites to .case shorthand', () => {
    const out = transform(
      `
        type Filter = 'all' | 'active' | 'completed'
        export function FilterPicker() {
          const filter = signal<Filter>('all')
          return <Button onClick={() => filter.set('active')}>Active</Button>
        }
      `,
      { target: 'swift' },
    )
    expect(out.code).toContain('{ filter = .active }')
    expect(out.code).not.toContain('filter = "active"')
  })

  it('does NOT rewrite string literals outside enum-typed context', () => {
    const out = transform(
      `
        type Filter = 'all' | 'active'
        export function X() {
          const filter = signal<Filter>('all')
          return <Text>placeholder text</Text>
        }
      `,
      { target: 'swift' },
    )
    // The string text inside <Text> is unrelated to the Filter enum;
    // must stay as a raw string literal.
    expect(out.code).toContain('Text("placeholder text")')
  })
})

describe('Kotlin emit — string-literal union enum', () => {
  it('emits enum class + qualified-case-rewritten signal initial', () => {
    const out = transform(
      `
        type Filter = 'all' | 'active' | 'completed'
        export function FilterPicker() {
          const filter = signal<Filter>('all')
          return <Text>{filter}</Text>
        }
      `,
      { target: 'kotlin' },
    )
    expect(out.code).toContain('enum class Filter { all, active, completed }')
    expect(out.code).toContain('var filter by remember { mutableStateOf(Filter.all) }')
  })

  it('rewrites .set(string-literal) call sites to Filter.case', () => {
    const out = transform(
      `
        type Filter = 'all' | 'active' | 'completed'
        export function FilterPicker() {
          const filter = signal<Filter>('all')
          return <Button onClick={() => filter.set('active')}>Active</Button>
        }
      `,
      { target: 'kotlin' },
    )
    expect(out.code).toContain('filter = Filter.active')
  })
})

describe('emit ordering — enum declarations before components', () => {
  it('places enum declarations at the top so component decls can reference them', () => {
    const out = transform(
      `
        type Filter = 'all' | 'active'
        export function FilterPicker() {
          const filter = signal<Filter>('all')
          return <Text>{filter}</Text>
        }
      `,
      { target: 'swift' },
    )
    const enumIdx = out.code.indexOf('enum Filter')
    const structIdx = out.code.indexOf('struct FilterPicker')
    expect(enumIdx).toBeGreaterThanOrEqual(0)
    expect(structIdx).toBeGreaterThan(enumIdx)
  })
})
