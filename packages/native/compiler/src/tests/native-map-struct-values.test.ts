// `Map` whose VALUES are structs / enums / arrays of those → a native
// dictionary on both targets (was: a named warning + a `let m = ""` sentinel).
//
// WHY the old guard existed. The `new Map<K, V>()` constructor held BOTH key
// and value to the scalar bar "for v1", with struct values written down as a
// follow-up. The key bar is real — a native dictionary key must be Hashable,
// and a struct is not. The VALUE bar never was: a dictionary value needs only a
// type swiftc/kotlinc can NAME, and a locally-declared `type X = { … }` /
// `interface X` / string-literal union is synthesized into exactly such a type
// (Swift struct/enum, Kotlin data class/enum). The method lowerings
// (`get`/`set`/`has`/`delete`/`size`) were already type-generic.
//
// What lowers now:
//   new Map<string, Todo>()            → [String: Todo]() / mutableMapOf<String, Todo>()
//   new Map<string, Todo[]>()          → the group-by idiom
//   new Map<string, Status>()          → an enum-valued map
//   new Map(todos.map(t => [t.id, t])) → Swift Dictionary(…, uniquingKeysWith:)
//                                        / Kotlin associate { … }.toMutableMap()
// Still a NAMED warning: an inline object value type (`Map<K, { x: number }>`
// has no type name to put in `[K: V]`), an imported/undeclared value type, a
// non-scalar key, and an index-by pair whose inferred value is anonymous.
//
// Sibling bug fixed on the way: the map method lowerings emitted their KEY
// argument under the SURROUNDING expectation, so `st().get('a') === 'done'`
// on an enum-valued map leaked the enum into the key and emitted `st[.a]` /
// `st[Status.a]`. Key/value args now take the map's own key/value types.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Press } from '@pyreon/primitives'
type Todo = { id: string; title: string; tag: string; n: number }
interface Note { id: string; body: string }
type Status = 'open' | 'done'
const SEED: Todo[] = [{ id: 'a', title: 'A', tag: 'x', n: 1 }]
export function App() {
  const todos = signal<Todo[]>([{ id: 'a', title: 'A', tag: 'x', n: 1 }])
  const cache = signal(new Map<string, Todo>())
  const notes = signal(new Map<number, Note>())
  const status = signal(new Map<string, Status>())
  const idx = signal(new Map(SEED.map((t) => [t.id, t])))
  const title = computed(() => {
    const byId = new Map<string, Todo>()
    for (const t of todos()) byId.set(t.id, t)
    return byId.get('a')?.title ?? ''
  })
  const groups = computed(() => {
    const g = new Map<string, Todo[]>()
    for (const t of todos()) {
      const list = g.get(t.tag) ?? []
      g.set(t.tag, [...list, t])
    }
    return g.size
  })
  const byId = computed(() => new Map(todos().map((t) => [t.id, t])))
  const totals = computed(() => new Map(todos().map((t) => [t.id, t.n * 2])))
  const typed = computed(() => new Map<string, Todo>(todos().map((t) => { return [t.id, t] })))
  return (<Stack>
    <Text>{title()}</Text>
    <Text>{String(groups())}</Text>
    <Text>{byId().get('a')?.title ?? '-'}</Text>
    <Text>{String(totals().get('a') ?? 0)}</Text>
    <Text>{String(typed().has('a'))}</Text>
    <Text>{idx().get('a')?.title ?? '-'}</Text>
    <Text>{cache().get('a')?.title ?? '-'}</Text>
    <Text>{notes().get(1)?.body ?? '-'}</Text>
    <Text>{String(status().get('a') === 'done')}</Text>
    <Press onPress={() => { cache().set('a', { id: 'a', title: 'Z', tag: 't', n: 2 }) }}><Text>set</Text></Press>
    <Press onPress={() => { status().set('a', 'done') }}><Text>done</Text></Press>
    <Press onPress={() => { cache().delete('a') }}><Text>del</Text></Press>
  </Stack>)
}`

const warningsOf = (src: string, target: 'swift' | 'kotlin') =>
  transform(src, { target }).warnings ?? []

describe('Map with struct / enum / array values → native dictionary', () => {
  it('lowers with ZERO warnings on both targets', () => {
    expect(warningsOf(APP, 'swift')).toEqual([])
    expect(warningsOf(APP, 'kotlin')).toEqual([])
  })

  it('Swift: struct-valued dictionaries, the group-by idiom and the index-by idiom', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('@State private var cache: [String: Todo] = [String: Todo]()')
    expect(out).toContain('@State private var notes: [Int: Note] = [Int: Note]()')
    expect(out).toContain('@State private var status: [String: Status] = [String: Status]()')
    expect(out).toContain('var byId = [String: Todo]()')
    expect(out).toContain('byId[t.id] = t')
    expect(out).toContain('var g = [String: [Todo]]()')
    expect(out).toContain(
      'private var byId: [String: Todo] { Dictionary(todos.map { t in (t.id, t) }, uniquingKeysWith: { _, last in last }) }',
    )
    expect(out).toContain('private var totals: [String: Int]')
    expect(out).toContain('@State private var idx: [String: Todo] = Dictionary(SEED.map')
    // The unannotated index-by SIGNAL is typed, so its reads lower too.
    expect(out).toContain('idx["a"]?.title')
    expect(out).toContain('cache["a"] = Todo(id: "a", title: "Z", tag: "t", n: 2)')
    expect(out).toContain('cache.removeValue(forKey: "a")')
    // The key stays a String inside an enum comparison (was `status[.a]`).
    expect(out).toContain('status["a"] == .done')
    expect(out).toContain('status["a"] = .done')
    expect(out).not.toContain(': Any')
    expect(out).not.toContain('let byId = ""')
  })

  it('Kotlin: the same shapes lower to MutableMap / associate', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('mutableStateOf(mutableMapOf<String, Todo>())')
    expect(out).toContain('mutableStateOf(mutableMapOf<Long, Note>())')
    expect(out).toContain('mutableStateOf(mutableMapOf<String, Status>())')
    expect(out).toContain('val g = mutableMapOf<String, List<Todo>>()')
    expect(out).toContain('todos.associate { t -> t.id to t }.toMutableMap()')
    expect(out).toContain('status["a"] == Status.done')
    expect(out).toContain('status["a"] = Status.done')
    expect(out).toContain('idx["a"]?.title')
    expect(out).toContain('cache.remove("a")')
  })

  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stubs', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('unsupported Map value shapes still warn BY NAME', () => {
  const wrap = (decl: string, read = 'String(m().size)') =>
    `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
import type { Remote } from './remote'
type Todo = { id: string; n: number }
export function App() {
  const todos = signal<Todo[]>([])
  ${decl}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

  it('an INLINE object value type has no type name — warns naming it', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = warningsOf(wrap('const m = signal(new Map<string, { x: number }>())'), target)
      expect(
        w.some((x) => x.includes('new Map<K, { … }>()')),
        `${target}: ${w.join('\n')}`,
      ).toBe(true)
    }
  })

  it('an imported (undeclared) value type warns naming it', () => {
    const w = warningsOf(wrap('const m = signal(new Map<string, Remote>())'), 'swift')
    expect(w.some((x) => x.includes('new Map<K, Remote>()'))).toBe(true)
  })

  it('a non-scalar KEY still warns (not Hashable)', () => {
    const w = warningsOf(wrap('const m = signal(new Map<Todo, number>())'), 'swift')
    expect(w.some((x) => x.includes('non-scalar key type'))).toBe(true)
  })

  it('an index-by pair with an ANONYMOUS object value warns by name on both targets', () => {
    const src = wrap('const m = computed(() => new Map(todos().map((t) => [t.id, { x: t.n }])))')
    for (const target of ['swift', 'kotlin'] as const) {
      const w = warningsOf(src, target)
      expect(
        w.some(
          (x) =>
            x.includes('cannot lower to a native dictionary') && x.includes('the value is not'),
        ),
        `${target}: ${w.join('\n')}`,
      ).toBe(true)
    }
  })

  it('an index-by pair with a struct KEY warns by name', () => {
    const src = wrap('const m = computed(() => new Map(todos().map((t) => [t, t.n])))')
    const w = warningsOf(src, 'kotlin')
    expect(w.some((x) => x.includes('the key is not a scalar'))).toBe(true)
  })
})
