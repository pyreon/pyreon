// Branch matrices for the Swift emit's JS-INTRINSIC rewrites: `Object.*`,
// `Date.*`, `console.log`, `Array.from` / `Array.isArray`, the signal
// `.set` / `.update` pair, and the labelled-argument tables for the runtime
// service containers and `PyreonDatabase`.
//
// The unifying reason: each of these names resolves to NOTHING on Swift, or
// resolves to something with a DIFFERENT shape. `Object` and `Array.from` are
// "cannot find … in scope"; `Date` resolves as a TYPE, so `Date.now()` was
// "cannot call value of non-function type 'Date'" — a clean-parse silent
// mis-emit. Where no faithful mapping exists the emit must degrade LOUDLY
// (a typed empty + a named warning), never fall through silently.
//
// The service/database label tables are the same class one level up: the
// shared TS surface is POSITIONAL while the Swift runtime takes LABELLED
// arguments, so an unlabelled emit fails on iOS ONLY.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const run = (src: string) => transform(src, { target: 'swift' })
const swift = (src: string) => run(src).code

describe('Object.* — the statically-resolvable shapes vs the loud degrade', () => {
  it('keys/values on a KNOWN homogeneous shape lower to a literal / member-access array', () => {
    const r = run(`import { Stack, Text } from '${P}'
export function App(props: { obj: { a: number; b: number } }) {
  const ks = () => Object.keys(props.obj)
  const vs = () => Object.values(props.obj)
  return (<Stack><Text>{() => \`\${ks().length}\${vs().length}\`}</Text></Stack>)
}`)
    expect(r.code).toContain('["a", "b"]')
    expect(r.code).toContain('[obj.a, obj.b]')
    expect(r.warnings.filter((w) => w.includes('Object.'))).toEqual([])
  })

  it('an UNRESOLVABLE receiver degrades to a TYPED empty and warns — never a bare `[]`', () => {
    // `[String]()` / `[Any]()` rather than `[]`, because a bare empty literal
    // is untypeable in an `Any` computed context.
    const r = run(`import { Stack, Text } from '${P}'
export function App(props: { raw: unknown }) {
  const k1 = () => Object.keys(props.raw)
  const v1 = () => Object.values(props.raw)
  const e1 = () => Object.entries(props.raw)
  return (<Stack><Text>{() => \`\${k1().length}\${v1().length}\${e1().length}\`}</Text></Stack>)
}`)
    expect(r.code).toContain('private func k1() { [String]() }')
    expect(r.code).toContain('private func v1() { [Any]() }')
    // entries / assign / fromEntries have no analog at all — same degrade
    expect(r.code).toContain('private func e1() { [Any]() }')
    expect(r.warnings.filter((w) => w.includes('has no native equivalent'))).toHaveLength(3)
  })
})

describe('Date.* and console.log', () => {
  it('`Date.now()` becomes the epoch-ms Double; any other `Date.*` static is NAMED', () => {
    const r = run(`import { Stack, Text } from '${P}'
export function App() {
  const now = () => Date.now()
  const parsed = () => Date.parse('x')
  return (<Stack><Text>{() => \`\${now()}\${String(parsed())}\`}</Text></Stack>)
}`)
    expect(r.code).toContain('private func now() -> Double { (Date().timeIntervalSince1970 * 1000) }')
    // the verbatim emit stays so swiftc names the site
    expect(r.code).toContain('Date.parse("x")')
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('`console.log` maps to `print` with every argument forwarded', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
export function App() {
  const log = () => { console.log('hi', 1) }
  return (<Stack><Press onPress={log}><Text>hi</Text></Press></Stack>)
}`)
    expect(out).toContain('print("hi", 1)')
  })
})

describe('Array.from / Array.isArray', () => {
  const r = run(`import { Stack, Text } from '${P}'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1, 2])
  const a = computed(() => Array.from({ length: 3 }, (_, i) => i * 2))
  const b = computed(() => Array.from({ length: 3 }, (_, i) => ({ id: i, label: 'x' })))
  const c = computed(() => Array.from(xs()))
  const d = computed(() => Array.from(xs(), (v) => v + 1))
  const e = computed(() => Array.from({ length: 3 }))
  const f = computed(() => Array.isArray(xs()))
  return (<Stack><Text>{() => \`\${a().length}\${b().length}\${c().length}\${d().length}\${e().length}\${f()}\`}</Text></Stack>)
}`)

  it('the `{ length: n }` + index-callback form becomes a range map', () => {
    expect(r.code).toContain('(0..<3).map({ i in i * 2 })')
  })

  it('the INDEX param is seeded Int, so an object literal in the body still synthesizes a struct', () => {
    // Without the seed the param infers unknown and the literal bails to a
    // labelled TUPLE, whose key paths break `ForEach(id: \\.id)`.
    expect(r.code).toMatch(/\(0\.\.<3\)\.map\(\{ i in \(__Obj\d+\(id: i, label: "x"\)\) \}\)/)
  })

  it('the plain and mapped ARRAY forms, and `isArray`, each take their own arm', () => {
    expect(r.code).toContain('Array(xs)')
    expect(r.code).toContain('xs.map({ v in v + 1 })')
    // a typed source IS statically an array
    expect(r.code).toContain('private var f: Bool { true }')
  })

  it('`{ length: n }` with NO callback keeps the raw emit AND is named', () => {
    expect(r.code).toContain('Array.from(')
    expect(
      r.warnings.some((w) => w.includes('without an `(_, index) => expr` map callback')),
    ).toBe(true)
  })
})

describe('signal `.set` / `.update` — local and store-backed', () => {
  const SRC = `import { Stack, Text, Press } from '${P}'
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
type Side = 'left' | 'right'
const useApp = defineStore('app', () => {
  const tasks = signal<number[]>([])
  const n = signal(0)
  return { tasks, n }
})
export function App() {
  const xs = signal<number[]>([1])
  const side = signal<Side>('left')
  const run = () => {
    xs.update((l) => l.concat([2]))
    xs.set([3])
    xs.update(() => [4])
    xs.update((l, extra) => l)
    useApp().store.tasks.update((l) => l.concat([5]))
    useApp().store.n.set(9)
    side.set('right')
  }
  return (<Stack><Press onPress={run}><Text>{() => String(xs().length)}</Text></Press></Stack>)
}`

  it('a one-param arrow substitutes the READ in and becomes a plain assignment', () => {
    const out = swift(SRC)
    expect(out).toContain('xs = (xs + [2])')
    expect(out).toContain('xs = [3]')
  })

  it('a STORE field routes both forms through the singleton', () => {
    const out = swift(SRC)
    expect(out).toContain('PyreonStore_app.shared.tasks = (PyreonStore_app.shared.tasks + [5])')
    expect(out).toContain('PyreonStore_app.shared.n = 9')
  })

  it('a PARAMETERLESS or multi-param callback bails, keeping the raw `.update(` so swiftc names it', () => {
    const out = swift(SRC)
    expect(out).toContain('xs.update({ [4] })')
    expect(out).toContain('xs.update({ l, extra in l })')
  })

  it('an ENUM-typed signal rewrites its `.set` argument to a case', () => {
    const out = swift(SRC)
    expect(out).toContain('side = .right')
    expect(out).not.toContain('side = "right"')
  })
})

describe('PyreonDatabase argument labels — positional TS, labelled Swift', () => {
  const out = swift(`import { Stack, Text, Press } from '${P}'
import { useDatabase } from '@pyreon/storage'
export function App() {
  const db = useDatabase()
  const held = { a: 1 }
  const run = () => {
    db.insert('tx', { id: '1', fields: { a: 1, b: 'x' } })
    db.insert('tx', { id: '2', fields: held })
    db.insert('tx', { id: '3', fields: {} })
    db.insert('tx', { id: '4' })
    db.get('tx', '1')
    db.delete('tx', '1')
  }
  return (<Stack><Press onPress={run}><Text>hi</Text></Press></Stack>)
}`)

  it('an `{ id, fields }` literal rebuilds as a PyreonRecord; an EMPTY fields map emits `[:]`', () => {
    expect(out).toContain('db.insert("tx", PyreonRecord(id: "1", fields: ["a": 1, "b": "x"]))')
    // a variable holding the dictionary passes straight through
    expect(out).toContain('db.insert("tx", PyreonRecord(id: "2", fields: (__Obj0(a: 1))))')
    // `[]` would parse as an empty ARRAY, not a Dictionary
    expect(out).toContain('db.insert("tx", PyreonRecord(id: "3", fields: [:]))')
    // no `fields` at all → the arm adds nothing
    expect(out).toContain('db.insert("tx", PyreonRecord(id: "4"))')
  })

  it('`get` / `delete` label their SECOND argument', () => {
    expect(out).toContain('db.get("tx", id: "1")')
    expect(out).toContain('db.delete("tx", id: "1")')
  })

  it('a record literal carrying an UNKNOWN field is refused and NAMED — it cannot compile', () => {
    const r = run(`import { Stack, Text, Press } from '${P}'
import { useDatabase } from '@pyreon/storage'
export function App() {
  const db = useDatabase()
  const run = () => { db.insert('tx', { id: '5', extra: 1 }) }
  return (<Stack><Press onPress={run}><Text>hi</Text></Press></Stack>)
}`)
    expect(
      r.warnings.some((w) => w.includes("is not the { id, fields } shape 'PyreonRecord' requires")),
    ).toBe(true)
    expect(r.code).not.toContain('PyreonRecord(id: "5"')
  })
})
