// `@pyreon/table`'s `createTableState` lowers to the @Observable
// PyreonTableState port. Swift wires the reactive data source in `.onAppear`
// (a @State initializer can't capture the source signal); Kotlin passes it in
// the constructor (sequential `remember`). Column cell accessors are codegen'd
// from the row struct's inferred field types.
//
// Verified END-TO-END beyond these string assertions: the ACTUAL emit
// type-checks against the real SwiftUI SDK + the real @Observable port on macOS,
// and both targets validate against the compiler stubs.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'
const usersTable = `
import { signal } from '@pyreon/reactivity'
import { createTableState } from '@pyreon/table'
import { Stack, Text, Button, For } from '${P}'
export function UsersTable() {
  const users = signal([{ id: 1, name: 'Ada', age: 36 }, { id: 2, name: 'Linus', age: 54 }])
  const t = createTableState({ data: () => users(), columns: [{ id: 'name' }, { id: 'age' }], pageSize: 10 })
  return (
    <Stack>
      <Button onPress={() => t.toggleSort('name')}>Sort</Button>
      <Text>{t.filteredCount()}</Text>
      <Text>{t.page()}</Text>
      <For each={t.rows()}>{(u) => <Text>{u.name}</Text>}</For>
    </Stack>
  )
}
`

describe('createTableState — Swift lowering', () => {
  const r = transform(usersTable, { target: 'swift' })

  it('emits a self-seeding @State PyreonTableState with codegen columns', () => {
    // String field → .string, number field → .number(Double(...)) (PyreonCell.number is Double).
    expect(r.code).toContain(
      'PyreonTableColumn(id: "name", accessor: { .string($0.name) })',
    )
    expect(r.code).toContain(
      'PyreonTableColumn(id: "age", accessor: { .number(Double($0.age)) })',
    )
    expect(r.code).toContain('PyreonTableState<UsersTableUser>(columns: [')
    expect(r.code).toContain('pageSize: 10)')
  })

  it('wires the reactive data source in .onAppear (not the @State init)', () => {
    expect(r.code).toContain('.onAppear { t.setData { users } }')
  })

  it('rows()/filteredCount()/toggleSort() are methods; page() drops parens (property)', () => {
    expect(r.code).toContain('t.rows()')
    expect(r.code).toContain('t.filteredCount()')
    expect(r.code).toContain('t.toggleSort("name")')
    expect(r.code).toContain('"\\(t.page)"') // page is a property, not page()
  })

  it('does NOT warn as web-only (createTableState lowers)', () => {
    expect((r.warnings ?? []).some((w) => w.includes('createTableState'))).toBe(false)
  })

  it('the emit type-checks against the Swift stubs', () => {
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('createTableState — Kotlin lowering', () => {
  const r = transform(usersTable, { target: 'kotlin' })

  it('emits a remembered PyreonTableState over the row struct with codegen columns', () => {
    expect(r.code).toContain('PyreonTableState<__Obj0>({ users }, listOf(')
    expect(r.code).toContain('PyreonTableColumn("name") { PyreonCell.Str(it.name) }')
    expect(r.code).toContain('PyreonTableColumn("age") { PyreonCell.Num((it.age).toDouble()) }')
    expect(r.code).toContain(', 10)') // pageSize
  })

  it('use-sites: rows()/toggleSort() methods; page property read', () => {
    expect(r.code).toContain('t.rows()')
    expect(r.code).toContain('t.toggleSort("name")')
    expect(r.code).toContain('${t.page}')
  })

  it('the emit type-checks against the Kotlin stubs', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('createTableState — warns (silent-drop) outside the v1 shape', () => {
  const base = (cfg: string) =>
    `import { signal } from '@pyreon/reactivity'\nimport { createTableState } from '@pyreon/table'\nimport { Stack, Text } from '${P}'\nexport function C(){ const rows = signal([{ id: 1 }]); const t = createTableState(${cfg}); return (<Stack><Text>{t.filteredCount()}</Text></Stack>) }`

  it('warns when `data` is not an expression-body getter', () => {
    const r = transform(base(`{ columns: [{ id: 'id' }] }`), { target: 'swift' })
    expect(
      (r.warnings ?? []).some((w) => w.includes('createTableState') && w.includes('data')),
    ).toBe(true)
  })

  it('warns when there are no columns', () => {
    const r = transform(base(`{ data: () => rows() }`), { target: 'swift' })
    expect(
      (r.warnings ?? []).some((w) => w.includes('createTableState') && w.includes('columns')),
    ).toBe(true)
  })
})
