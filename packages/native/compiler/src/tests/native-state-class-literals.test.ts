// Object literals in a component signal's initial value must resolve to the
// data class the signal's inferred type synthesises (`AppPt`). On Kotlin they
// never did: the class was registered in neither literal-resolution index and
// the value was emitted before the type, so each literal synthesised its own
// `__ObjN`. Harmless while every row had identical value types; a column mixing
// `1.5` and `3` gave the rows DIFFERENT classes, the list became `List<Any>`,
// and the first field read was "unresolved reference" on Kotlin while Swift
// compiled.
import { describe, expect, it } from 'vitest'
import { validateKotlin, validateSwiftWithStubs } from '../validate'
import { transform } from './first-party-plugins'

const app = (init: string, read: string, extra = '') =>
  `import { signal } from '@pyreon/reactivity'\nimport { Text } from '@pyreon/primitives'\nexport function App() {\n  const pts = signal(${init})\n${extra}  return <Text>{String(${read})}</Text>\n}`

const FLAT = app(`[{ label: 'a', x: 1.5 }, { label: 'b', x: 3 }]`, 'pts()[0].x')
const NESTED = app(`[{ label: 'a', pos: { x: 1.5, y: 2 } }, { label: 'b', pos: { x: 3, y: 4 } }]`, 'pts()[0].pos.x')

describe('component-state object literals resolve to their data class', () => {
  for (const [label, src] of [
    ['a column mixing a fraction and a whole number', FLAT],
    ['the same column inside a nested object', NESTED],
  ] as const) {
    it(`${label}: every row is the same class and both targets compile`, () => {
      const kotlin = transform(src, { target: 'kotlin' })
      expect(kotlin.code).not.toMatch(/__Obj\d/)
      expect(kotlin.code).toContain('(3L).toDouble()')
      const k = validateKotlin(kotlin.code)
      expect(k.ok, k.error).toBe(true)
      const swift = transform(src, { target: 'swift' })
      const s = validateSwiftWithStubs(swift.code)
      expect(s.ok, s.error).toBe(true)
    })
  }

  it('a literal whose values do not FIT the class keeps its own class (a names match alone is not enough)', () => {
    // `{ id: 'id' }` has the same field NAME as the state row `{ id: 1 }`, but a
    // String does not fit a Long field, so it must not become `AppPt`.
    const src = app(`[{ id: 1 }]`, 'pts()[0].id', `  const cols = [{ id: 'id' }]\n`)
    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).not.toContain('AppPt(id = "id")')
    const k = validateKotlin(kotlin.code)
    expect(k.ok, k.error).toBe(true)
  })

  it('a sortable over state rows names the row class, not Any', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/dnd'
import { Text } from '@pyreon/primitives'
export function App() {
  const items = signal([{ id: 'a' }])
  const s = useSortable({ items: () => items(), by: (it) => it.id, onReorder: (next) => items.set(next) })
  return <Text>{String(items().length)}</Text>
}`
    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('PyreonSortableState<AppItem>')
  })
})
