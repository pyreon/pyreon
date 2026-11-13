// `@pyreon/elements` `<List>` lowers natively (deferred item O52).
//
// Before: List had no lowering — it was reproduced verbatim as `List(data: …)`,
// which exists on neither target, so a native build of anything List-based
// (much of @pyreon/ui-components) failed.
//
// Now `<List data component itemKey>` becomes a Stack (List's own layout props)
// holding a keyed loop that renders `component` per item. On Android that loop is
// EAGER — rows lay out in the Stack's Row/Column — because a List is a plain flex
// container: the default `<For>` LazyColumn would stack a horizontal List's rows
// vertically, and measure with infinite height inside a scrolling parent.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const app = (list: string, extra = '') => `
import { signal } from '@pyreon/reactivity'
import { List } from '@pyreon/elements'
import { Text } from '@pyreon/primitives'
type Row = { id: number; name: string }
function RowView(props: { id: number; name: string }) { return <Text>{props.name}</Text> }
function Tag(props: { label: string }) { return <Text>{props.label}</Text> }
${extra}
export function App() {
  const rows = signal<Row[]>([{ id: 1, name: 'a' }, { id: 2, name: 'b' }])
  const tags = signal<string[]>(['x', 'y'])
  return ${list}
}
`

const KEYED = app('<List data={rows()} component={RowView} itemKey="id" direction="inline" gap="sm" />')
const VALUES = app('<List data={tags()} component={Tag} valueName="label" itemKey={(t) => t} />')

const warningsOf = (r: { warnings: unknown[] }): string =>
  r.warnings.map((w) => String((w as { message?: string }).message ?? w)).join('\n')

describe('elements <List> on native', () => {
  it('a keyed object List lowers to a Stack of its rows on both targets', () => {
    const swift = transform(KEYED, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('HStack(alignment: .top, spacing: 8) {')
    expect(swift.code).toContain('ForEach(rows, id: \\.id) { pyreonItem in')
    expect(swift.code).toContain('RowView(id: pyreonItem.id, name: pyreonItem.name)')
    const kotlin = transform(KEYED, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {')
    expect(kotlin.code).toContain('for (pyreonItem in rows) {')
    expect(kotlin.code).toContain('key(pyreonItem.id) {')
    expect(kotlin.code).toContain('RowView(id = pyreonItem.id, name = pyreonItem.name)')
    // Eager: the rows lay out in the Row itself, never in a LazyColumn.
    expect(kotlin.code).not.toContain('LazyColumn')
  })

  it('valueName passes a primitive item as that one prop; an itemKey function keys it', () => {
    const swift = transform(VALUES, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('Tag(label: pyreonItem)')
    const kotlin = transform(VALUES, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('key(pyreonItem) {')
    expect(kotlin.code).toContain('Tag(label = pyreonItem)')
  })

  it('a plain <For> elsewhere keeps its LazyColumn (the eager form is opt-in)', () => {
    const src = `
import { For } from '@pyreon/core'
import { Text } from '@pyreon/primitives'
export function App() { const rows = [{ id: 1, name: 'a' }]; return <For each={rows} by={(r) => r.id}>{(r) => <Text>{r.name}</Text>}</For> }`
    expect(transform(src, { target: 'kotlin' }).code).toContain('LazyColumn {')
  })

  it('every shape that cannot lower is warned by name', () => {
    const cases: Array<[string, string]> = [
      ['<List component={RowView} />', 'needs `data`'],
      ['<List data={rows()} component={(p) => <Text>x</Text>} />', 'must name a component'],
      ['<List data={rows()} component="li" />', 'must name a component'],
      ['<List data={rows()} component={RowView} itemKey="id" itemProps={{ a: 1 }} />', '<List itemProps> has no native lowering'],
      ['<List data={rows()} component={RowView} itemKey="id" wrapComponent={RowView} />', '<List wrapComponent> has no native lowering'],
    ]
    for (const [list, needle] of cases) {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(warningsOf(transform(app(list), { target })), `${target}: ${list}`).toContain(needle)
      }
    }
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    for (const src of [KEYED, VALUES]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    for (const src of [KEYED, VALUES]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})
