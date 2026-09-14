// Branch matrices for the Swift emit's INFERENCE SEAMS — the places a type
// question decides the emitted bytes: enum-case rewriting from a struct
// field's declared type, the float coercion, the expected-struct gate, the
// per-closure element/index bindings, and the degrade paths where a type
// cannot be resolved at all.
//
// Two of them exist only because the file-level and per-component inference
// tables are DIFFERENT objects: a member read on a declared struct types as
// `unknown` in a component-free file, and a callback param is neither a
// signal nor a const so it types `unknown` inside its own closure. Both were
// real silent mis-emits (a raw string against an enum; a lost Int→Double
// coercion), so both are asserted against the shape that must NOT rewrite.
//
// One `it.fails` lock: the `Float` alias is RECOGNIZED by the float
// machinery in five places and then emitted as code that compiles on
// neither target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'
const run = (src: string) => transform(src, { target: 'swift' })
const swift = (src: string) => run(src).code

describe('a string literal compared to a struct field rewrites to the enum case', () => {
  it('resolves the field’s enum through the FILE-level struct table, optional included', () => {
    // A file of pure top-level helpers has an EMPTY per-component struct
    // table, so this has to resolve from the file-level one or the literal
    // stays a String and swiftc rejects the comparison.
    const out = swift(`import { Stack, Text } from '${P}'
type Side = 'left' | 'right'
type Cfg = { side: Side; opt?: Side; n: number }
export function isLeft(c: Cfg): boolean { return c.side === 'left' }
export function optIsLeft(c: Cfg): boolean { return (c.opt ?? 'right') === 'left' }
export function notEnum(c: Cfg): boolean { return c.n === 1 }
export function App() { return (<Stack><Text>hi</Text></Stack>) }`)
    expect(out).toContain('func isLeft(_ c: Cfg) -> Bool { c.side == .left }')
    // an OPTIONAL field is a union with undefined — the enum is one branch in,
    // and the `??` default position must rewrite too
    expect(out).toContain('func optIsLeft(_ c: Cfg) -> Bool { ((c.opt ?? .right)) == .left }')
    // a NON-enum field of the same struct must not rewrite anything
    expect(out).toContain('func notEnum(_ c: Cfg) -> Bool { c.n == 1 }')
  })
})

describe('float coercion — the `Double` / `Float` aliases count as float', () => {
  it('a Double-annotated prop drives the Int→Double coercion (Swift has no implicit widening)', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { computed } from '@pyreon/reactivity'
export function App(props: { d: Double; rows: number[][] }) {
  const a = computed(() => props.rows.map((x) => x.map((x) => x * 1.5)))
  const b = computed(() => props.rows.map((r) => r.length * props.d))
  return (<Stack><Text>{() => \`\${a().length}\${b().length}\`}</Text></Stack>)
}`)
    // the INNER closure re-binds `x`, so the save/restore has to hand the
    // outer binding back afterwards
    expect(out).toContain('rows.map({ x in x.map({ x in Double(x) * 1.5 }) })')
    // and a `Double` TYPEREF operand is as float as a resolved float number
    expect(out).toContain('rows.map({ r in Double(r.count) * d })')
  })

  it.fails(
    'KNOWN BUG: the `Float` alias is treated as float-ish by `isFloatTypeIR` / `numericFloatness` and then emitted as `Double(...)` with a `Double` return type — swiftc: "cannot convert value of type \'Float\' to expected argument type \'Double\'". The same source ALSO fails kotlinc ("actual type is \'Float\', but \'Double\' was expected" at `pyreonNumString`), so the alias compiles on NEITHER target. Fix: either coerce to the operand\'s own float width (emit `Float(...)` / annotate `Float` when the operand is Float), or refuse `Float` at the type layer and name it — recognizing an alias and then mis-emitting it is worse than not recognizing it.',
    () => {
      const out = swift(`import { Stack, Text } from '${P}'
import { computed } from '@pyreon/reactivity'
export function App(props: { f: Float }) {
  const c = computed(() => props.f * 2)
  return (<Stack><Text>{() => String(c())}</Text></Stack>)
}`)
      expect(out).not.toContain('private var c: Double { f * Double(2) }')
    },
  )
})

describe('the ANNOTATION steers a literal only when the struct accepts it', () => {
  it('a literal MISSING a required field is refused and synthesizes its own shape instead', () => {
    const out = swift(`import { Stack, Text } from '${P}'
type C = { a: number; b: number }
export function App() {
  const partial: C = { a: 1 }
  const whole: C = { a: 1, b: 2 }
  return (<Stack><Text>{() => \`\${partial.a}\${whole.b}\`}</Text></Stack>)
}`)
    // `b` is required and unset — `C` cannot be constructed
    expect(out).toMatch(/let partial = __Obj\d+\(a: 1\)/)
    expect(out).toContain('let whole = C(a: 1, b: 2)')
  })
})

describe('indexed array callbacks bind BOTH params for the body emit', () => {
  const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const xs = signal<number[]>([1, 2])
  const mapped = () => xs().map((v, i) => v * i)
  const each = () => { xs().forEach((v, i) => { n.set(v + i) }) }
  const filt = () => xs().filter((v, i) => i > 0 && v > 1)
  const ev = () => xs().every((v, i) => v > i)
  const blk = () => xs().map((v, i) => { const q = v + i; return q * 2 })
  return (<Stack><Press onPress={each}><Text>{() => \`\${mapped().length}\${filt().length}\${ev()}\${blk().length}\`}</Text></Press></Stack>)
}`)

  it('the closure is `{ (idx, el) in … }` over `enumerated()`, for every indexed method', () => {
    expect(out).toContain('xs.enumerated().map({ (i, v) in v * i })')
    expect(out).toContain('xs.enumerated().forEach({ (i, v) in n = v + i })')
    // `.filter` has to map back off the enumerated pair
    expect(out).toContain('xs.enumerated().filter({ (i, v) in i > 0 && v > 1 }).map({ $0.element })')
    expect(out).toContain('xs.enumerated().allSatisfy({ (i, v) in v > i })')
  })

  it('a MULTI-STATEMENT block body is emitted, not silently dropped', () => {
    // Reading only `cb.body` (the empty-literal SENTINEL a block parses to)
    // dropped the whole body and compiled clean.
    expect(out).toContain('let q = v + i')
    expect(out).toContain('return q * 2')
  })
})

describe('degrade paths — a type that cannot be resolved', () => {
  it('a NON-array data/items source types the table + sortable generic `Any`', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { createTableState } from '@pyreon/table'
import { useSortable } from '@pyreon/dnd'
import { signal } from '@pyreon/reactivity'
export function App() {
  const notArr = signal<number>(1)
  const t = createTableState({ data: () => notArr(), columns: [{ id: 'id' }] })
  const s = useSortable({ items: () => notArr(), by: (r) => r, onReorder: (next) => notArr.set(1) })
  return (<Stack><Text>{() => \`\${t.page()}\${s.items().length}\`}</Text></Stack>)
}`)
    expect(out).toContain('PyreonTableState<Any>(')
    expect(out).toContain('PyreonSortableState<Any>()')
  })

  it('an ARRAY source resolves the row struct through the synth table and types each accessor', () => {
    const out = swift(`import { Stack, Text } from '${P}'
import { createTableState } from '@pyreon/table'
import { signal } from '@pyreon/reactivity'
export function App() {
  const rows = signal<{ id: number; nm: string }[]>([])
  const t = createTableState({ data: () => rows(), columns: [{ id: 'id' }, { id: 'nm' }] })
  return (<Stack><Text>{String(t.page())}</Text></Stack>)
}`)
    expect(out).toContain('PyreonTableState<AppRow>(')
    // the accessor's cell kind comes from the resolved FIELD type
    expect(out).toContain('accessor: { .number(Double($0.id)) }')
    expect(out).toContain('accessor: { .string($0.nm) }')
  })

  it('a flow node whose `data` shape is not synthesizable types the state `Any` and is NAMED', () => {
    const r = run(`import { Stack, Text } from '${P}'
import { createFlow } from '@pyreon/flow'
export function App() {
  const fl = createFlow({
    nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { bag: [] } }],
    edges: [{ id: 'e', source: 'a', target: 'a', animated: false }],
  })
  return (<Stack><Text>{String(fl.nodes().length)}</Text></Stack>)
}`)
    expect(r.code).toContain('PyreonFlowState<Any>(')
    // `animated: false` is the other half of the boolean arm
    expect(r.code).toContain('animated: false')
    expect(r.warnings.some((w) => w.includes('no struct could be synthesized'))).toBe(true)
  })
})

describe('emit-time warning de-duplication and the guards that suppress it', () => {
  it('the SAME non-boolean-logical warning from two call sites is pushed ONCE', () => {
    const r = run(`import { Stack, Text } from '${P}'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const s = signal('x')
  const a = computed(() => n() && s())
  const b = computed(() => n() && s())
  return (<Stack><Text>{() => \`\${String(a())}\${String(b())}\`}</Text></Stack>)
}`)
    expect(r.warnings.filter((w) => w.startsWith('`&&` with a non-boolean left'))).toHaveLength(1)
    expect(r.warnings.filter((w) => w.startsWith('`&&` with a non-boolean right'))).toHaveLength(1)
  })

  it('an unmapped method on an OPTIONAL array receiver still resolves through the union', () => {
    const r = run(`import { Stack, Text } from '${P}'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const nums = signal<number[] | undefined>(undefined)
  const bad = computed(() => (nums() ?? []).copyWithin(0, 1))
  return (<Stack><Text>{() => String(bad())}</Text></Stack>)
}`)
    expect(r.warnings.some((w) => w.includes('`.copyWithin()` on an array has no lowering'))).toBe(
      true,
    )
  })
})

describe('module + component setup tables', () => {
  it('only SCALAR module-const literals are inlinable; a `null` literal is not', () => {
    const out = swift(`import { Stack, Text } from '${P}'
const NAME = 'n'
const NUM = 2
const FLAG = true
const NOTHING = null
export function App() {
  return (<Stack><Text>{() => \`\${NAME}\${NUM}\${FLAG}\${String(NOTHING)}\`}</Text></Stack>)
}`)
    expect(out).toContain('"n"')
    expect(out).toContain('String(NOTHING)')
  })

  it('a `params` prop that is not a FLAT object shape is marked opaque', () => {
    // Route params are flat strings — a nested object cannot be built from
    // matchPath's [String: String] dict, so the emit falls back to the raw
    // dict and lets swiftc name the mismatch.
    const out = swift(`import { Stack, Text } from '${P}'
export function Flat(props: { params: { id: string; page: number } }) {
  return (<Stack><Text>{props.params.id}</Text></Stack>)
}
export function Nested(props: { params: { id: string; nested: { z: number } } }) {
  return (<Stack><Text>{props.params.id}</Text></Stack>)
}
export function NotAnObject(props: { params: string }) {
  return (<Stack><Text>{props.params}</Text></Stack>)
}`)
    expect(out).toContain('struct FlatParam: Codable')
    expect(out).toContain('let params: FlatParam')
    expect(out).toContain('let params: String')
  })

  it('a field name is singularized for an array-of-object struct, and left alone otherwise', () => {
    const out = swift(`import { Stack, Text } from '${P}'
export function App(props: { single: { v: number }; boxes: { w: number }[] }) {
  return (<Stack><Text>{() => \`\${props.single.v}\${props.boxes.length}\`}</Text></Stack>)
}`)
    expect(out).toContain('struct AppSingle: Codable')
    expect(out).toContain('struct AppBoxe: Codable')
  })

  it('a mutated component local becomes `var`; a member/index assignment target is not a local', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const xs = signal<number[]>([1, 2])
  const obj = signal<{ a: number }>({ a: 1 })
  const run = () => {
    obj().a = 5
    xs()[0] = 7
    let k = 1
    k++
    n.set(k)
  }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`)
    expect(out).toContain('obj.a = 5')
    expect(out).toContain('xs[0] = 7')
    expect(out).toContain('var k = 1')
  })
})

describe('useToggle / useCounter — a member OUTSIDE the known surface falls through', () => {
  it('an unrecognized member keeps the raw call so swiftc names it', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { useToggle, useCounter } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal(0)
  const t = useToggle(false)
  const c = useCounter(1)
  const run = () => { t.nope(); c.nope(); n.set(1) }
  return (<Stack><Press onPress={run}><Text>{() => String(n())}</Text></Press></Stack>)
}`)
    expect(out).toContain('t.nope()')
    expect(out).toContain('c.nope()')
  })
})

describe('useForm — schema-derived validators merge INTO an explicit list', () => {
  it('an explicitly-validated field keeps its own fn; the rest get the schema validator', () => {
    const out = swift(`import { Stack, Text, Press } from '${P}'
import { useForm } from '@pyreon/form'
import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
export const S = zodSchema(z.object({ email: z.string().email(), nick: z.string().min(2) }))
export function App() {
  const form = useForm({
    initialValues: { email: '', nick: '' },
    schema: S,
    validators: { email: (v) => (v === '' ? 'required' : undefined) },
    onSubmit: () => {},
  })
  return (<Stack><Press onPress={() => {}}><Text>{() => String(form.values().email)}</Text></Press></Stack>)
}`)
    expect(out).toContain('"email": { v in (v == "" ? "required" : nil) }')
    expect(out).toContain('"nick": { v in PyreonZodSchema_S.validateField("nick", v) }')
  })

  it('a schema NAME with no visible declaration synthesizes nothing and is NAMED', () => {
    const r = run(`import { Stack, Text, Press } from '${P}'
import { useForm } from '@pyreon/form'
export function App() {
  const form = useForm({ initialValues: { email: '' }, schema: Missing, onSubmit: () => {} })
  return (<Stack><Press onPress={() => {}}><Text>{() => String(form.values().email)}</Text></Press></Stack>)
}`)
    expect(
      r.warnings.some((w) => w.includes('no top-level zodSchema/valibotSchema/arkTypeSchema declaration')),
    ).toBe(true)
  })
})

describe('a NESTED closure re-binding the same param name restores the outer binding', () => {
  it('nested indexed callbacks and nested `Array.from` index params each shadow and restore', () => {
    // The save/restore is per-closure: without it a sibling or nested
    // closure inherits the inner binding and every type-gated lowering in
    // it resolves against the wrong element type.
    const out = swift(`import { Stack, Text } from '${P}'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1, 2])
  const ys = signal<number[]>([3, 4])
  const nested = computed(() => xs().map((v, i) => ys().map((v, i) => v + i).length))
  const nestedFrom = computed(() => Array.from({ length: 2 }, (_, i) => Array.from({ length: 2 }, (_, i) => i).length))
  return (<Stack><Text>{() => \`\${nested().length}\${nestedFrom().length}\`}</Text></Stack>)
}`)
    expect(out).toContain(
      'xs.enumerated().map({ (i, v) in ys.enumerated().map({ (i, v) in v + i }).count })',
    )
    expect(out).toContain('(0..<2).map({ i in (0..<2).map({ i in i }).count })')
  })
})
