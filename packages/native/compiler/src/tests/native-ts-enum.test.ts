// TypeScript `enum` declarations lower on both targets.
//
// A TS enum used to emit NOTHING (with a warning), so every `Filter.Done` that read it failed the native build. They
// now reduce to the shapes PMTC already lowers (`ts-enum-desugar.ts`): a string enum is its string-literal union
// (a native `enum Filter: String` / `enum class Filter`), a numeric enum is `number` with each member its value.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, isSwiftUIAvailable, validateSwiftTypecheck } from '../validate'

const emit = (src: string, target: 'swift' | 'kotlin') => transform(src, { target })

const app = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export enum Filter { All = 'all', Active = 'active', InProgress = 'in-progress', Done = 'done' }
enum Dir { Up, Down = 5, Left, Back = -1 }
type Item = { id: string; filter: Filter }
function describe(d: Dir): string { return d === Dir.Left ? 'left' : 'other' }
export function App() {
  const f = signal<Filter>(Filter.All)
  const d = signal<Dir>(Dir.Left)
  const items = signal<Item[]>([{ id: 'a', filter: Filter.Done }])
  const shown = computed(() => items().filter((i) => f() === Filter.All || i.filter === f()).length)
  const label = computed(() => (f() === Filter['Done'] ? 'done' : 'open'))
  return (<Stack><Text>{shown()}</Text><Text>{label()}</Text><Text>{describe(d())}</Text>
    <Button onPress={() => { f.set(Filter.InProgress); d.set(Dir.Back) }}>x</Button></Stack>)
}`

describe('TS enum', () => {
  it('Swift: a string enum is a native String enum; a numeric enum is Int with each member its value', () => {
    const { code, warnings } = emit(app, 'swift')
    expect(code).toMatch(/enum Filter: String, Codable \{\n\s+case all, active, inProgress = "in-progress", done\n\}/)
    expect(code).toContain('@State private var f: Filter = .all')
    expect(code).toContain('@State private var d: Int = 6')
    expect(code).toContain('Item(id: "a", filter: .done)')
    expect(code).toContain('f == .all || i.filter == f')
    expect(code).toContain('f == .done ?')
    expect(code).toContain('f = .inProgress')
    expect(code).toContain('d = -1')
    expect(code).toContain('func describe(_ d: Int) -> String')
    expect(warnings).toEqual([])
  })

  it('Kotlin: the same, as an enum class and Long', () => {
    const { code, warnings } = emit(app, 'kotlin')
    expect(code).toContain('enum class Filter')
    expect(code).toContain('var f by remember { mutableStateOf(Filter.all) }')
    expect(code).toContain('var d by remember { mutableStateOf(6L) }')
    expect(code).toContain('fun describe(d: Long): String')
    expect(warnings).toEqual([])
  })

  it('a mixed enum still warns by name and is not lowered', () => {
    const src = app.replace("enum Dir { Up, Down = 5, Left, Back = -1 }", "enum Dir { Up, Down = 'down', Left = 6, Back = -1 }")
    expect(emit(src, 'swift').warnings.join('\n')).toContain('Top-level TS `enum Dir` is NOT compiled to native')
  })

  it('a reverse lookup is named', () => {
    const src = app.replace('describe(d())', 'String(Dir[d()])')
    expect(emit(src, 'swift').warnings.join('\n')).toContain('a reverse or computed lookup on a TS enum has no native lowering')
  })

  it.runIf(isSwiftcAvailable())('swiftc type-checks it (stubs)', () => {
    const r = validateSwiftWithStubs(emit(app, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isSwiftUIAvailable())('swiftc type-checks it (real SDK)', () => {
    const r = validateSwiftTypecheck(emit(app, 'swift').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)

  it.runIf(isKotlincAvailable())('kotlinc compiles it', () => {
    const r = validateKotlin(emit(app, 'kotlin').code)
    expect(r.ok, r.ok ? '' : r.error).toBe(true)
  }, 180_000)
})
