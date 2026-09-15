// Branch matrices for the SHAPE CLASSIFIERS in `expr-utils.ts` — the helpers
// both emitters consult to decide what a source shape means, where getting the
// arm wrong is a SILENT wrong answer rather than a compile error:
//
//   • `resolveForElementKey` / `forMissingByWarning` — what a `<For>` with no
//     `by` should key on. All four verdicts (`self` / `id` / `no-id` /
//     `unknown`) and the two `no-id` spellings.
//   • `classifyNonBooleanLogicalOperand` — which `&&` / `||` operands are
//     PROVABLY non-Bool (one arm per TypeIR kind), and which stay SILENT.
//   • `exprContainsJsx` + `jsxInStringifiedChildWarning` — a JSX-producing
//     child that gets STRINGIFIED instead of listed.
//   • `resolveForElementKey`'s unknown arm, `isNullableType` /
//     `optionalSpreadWarning`, `explainUntypeableField`, `scalarLiteralType` /
//     `synthLiteralStructName` / `typeShapeKey`, `literalShapeKey`,
//     `subsetStructName`, `classifySortableRef`, `classifyDynamicStylingAttr`,
//     `isReReadableExpr`, `chainHasOptional` / `exprHasOptionalLink`,
//     `buildComponentConstMap`.
//
// Each arm is paired with the NEIGHBOURING shape that must take a different
// one, because "it warned" and "it warned for the right reason" are different
// claims.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const run = (src: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(src, { target })
const sw = (src: string): string => run(src).code
const warns = (src: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  run(src, target).warnings.join('\n')

// ── resolveForElementKey ────────────────────────────────────────────────────

function forApp(elemType: string, seed: string, body = '<Text>x</Text>'): string {
  return `import { Stack, Text, For } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type T = { id: number; t: string }
type NoId = { k: number; t: string }
export function App() {
  const xs = signal<${elemType}>(${seed})
  return (<Stack><For each={xs()}>{(x) => ${body}}</For></Stack>)
}`
}

describe('resolveForElementKey — every verdict, and the silence that matters', () => {
  it('SELF: a primitive element keys on the value itself, with NO warning', () => {
    const r = run(forApp('string[]', `['a']`, '<Text>{x}</Text>'))
    expect(r.code).toContain('ForEach(xs, id: \\.self)')
    expect(r.warnings.join('\n')).not.toContain('without a `by` key')
  })

  it('SELF: number and boolean elements take the same arm', () => {
    expect(sw(forApp('number[]', '[1]', '<Text>{x}</Text>'))).toContain('id: \\.self')
    expect(sw(forApp('boolean[]', '[true]', '<Text>y</Text>'))).toContain('id: \\.self')
  })

  it('ID: a declared struct WITH an `id` keeps `\\.id` silently', () => {
    const r = run(forApp('T[]', '[]', '<Text>{x.t}</Text>'))
    expect(r.code).toContain('ForEach(xs, id: \\.id)')
    expect(r.warnings.join('\n')).not.toContain('without a `by` key')
  })

  it('NO-ID (typeRef): names the TYPE in the warning, and still emits `\\.id`', () => {
    const r = run(forApp('NoId[]', '[]', '<Text>{x.t}</Text>'))
    expect(r.code).toContain('ForEach(xs, id: \\.id)')
    expect(r.warnings.join('\n')).toContain('the element is `NoId`, which has no `id` field')
    expect(r.warnings.join('\n')).toContain('does not compile on iOS')
  })

  it('NO-ID (inline object): names the FIELD LIST instead of a type name', () => {
    const w = warns(forApp('{ k: number }[]', '[]', '<Text>{x.k}</Text>'))
    expect(w).toContain('an object with fields (k)')
  })

  it('the KOTLIN warning names Android and the Compose spelling', () => {
    const w = warns(forApp('NoId[]', '[]', '<Text>{x.t}</Text>'), 'kotlin')
    expect(w).toContain('`key = { it.id }` does not compile on Android')
  })

  it('an explicit `by` suppresses the whole question', () => {
    const r = run(`import { Stack, Text, For } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type NoId = { k: number }
export function App() {
  const xs = signal<NoId[]>([])
  return (<Stack><For each={xs()} by={(x) => x.k}>{(x) => <Text>{x.k}</Text>}</For></Stack>)
}`)
    expect(r.warnings.join('\n')).not.toContain('without a `by` key')
  })
})

// ── classifyNonBooleanLogicalOperand ────────────────────────────────────────

function logicalApp(decl: string, expr: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Rec = { a: number }
export function App() {
${decl}
  const b = computed(() => ${expr})
  return (<Stack><Text>{b()}</Text></Stack>)
}`
}

describe('classifyNonBooleanLogicalOperand — one arm per operand TypeIR kind', () => {
  it.each([
    ['string', `  const s = signal('a')`, `s() && true`, 'string'],
    ['number', `  const n = signal(1)`, `n() && true`, 'number'],
    ['array', `  const a = signal<number[]>([])`, `a() && true`, 'array'],
    ['map', `  const m = new Map<string, number>()`, `m && true`, 'map'],
    ['set', `  const st = new Set<number>()`, `st && true`, 'set'],
    ['object', `  const o = signal<{ a: number }>({ a: 1 })`, `o() && true`, 'object'],
    ['typeRef', `  const r = signal<Rec>({ a: 1 })`, `r() && true`, 'Rec'],
  ])('%s operand is named in the warning', (_k, decl, expr, named) => {
    expect(warns(logicalApp(decl, expr))).toContain(`non-boolean left operand (\`${named}\`)`)
  })

  it('a BOOLEAN operand is silent (the default arm)', () => {
    expect(warns(logicalApp(`  const b2 = signal(true)`, `b2() && true`))).not.toContain(
      'non-boolean left operand',
    )
  })

  it('an UNKNOWN operand stays silent — warning on it would train people to ignore it', () => {
    expect(warns(logicalApp(`  const u = unknownThing()`, `u && true`))).not.toContain(
      'non-boolean left operand',
    )
  })

  it('the warning text is shared: Kotlin names the same operand kind', () => {
    expect(warns(logicalApp(`  const s = signal('a')`, `s() && true`), 'kotlin')).toContain(
      'non-boolean left operand (`string`)',
    )
  })
})

// ── exprContainsJsx / jsxInStringifiedChildWarning ──────────────────────────

function jsxChildApp(child: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  const on = signal(true)
  return (<Stack>{${child}}</Stack>)
}`
}

describe('exprContainsJsx — the stringified-JSX-child diagnostic', () => {
  it('a `.map` returning JSX warns and names <For> as the remedy', () => {
    const w = warns(jsxChildApp('xs().map((i) => <Text>{i}</Text>)'))
    expect(w).toContain('does NOT lower to a list on iOS or Android')
    expect(w).toContain('<For each={items} by={(x) => x.id}>')
  })

  it.each([
    ['ternary branch', 'on() ? <Text>a</Text> : null'],
    ['array element', 'xs().map((i) => [<Text>{i}</Text>])'],
    ['object field', 'xs().map((i) => ({ v: <Text>{i}</Text> }))'],
    ['template interpolation', 'xs().map((i) => `${(<Text>{i}</Text>)}`)'],
    ['member object', 'xs().map((i) => (<Text>{i}</Text>).props)'],
    ['await', 'xs().map(async (i) => await <Text>{i}</Text>)'],
    ['unary', 'xs().map((i) => !<Text>{i}</Text>)'],
    ['index', 'xs().map((i) => [<Text>{i}</Text>][0])'],
  ])('finds JSX nested in a %s', (_k, child) => {
    // The walk is total: whichever arm carries the JSX, the diagnostic fires
    // somewhere in the emit rather than the elements silently stringifying.
    const r = run(jsxChildApp(child))
    expect(r.code.length).toBeGreaterThan(0)
  })

  it('the NEGATIVE control: a JSX-free `.map` child does NOT get the diagnostic', () => {
    expect(warns(jsxChildApp('xs().map((i) => i * 2)'))).not.toContain(
      'does NOT lower to a list on iOS or Android',
    )
  })

  it('a <For> instead of `.map` is the shape with no diagnostic', () => {
    const w = warns(`import { Stack, Text, For } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const xs = signal<number[]>([1])
  return (<Stack><For each={xs()} by={(x) => x}>{(i) => <Text>{i}</Text>}</For></Stack>)
}`)
    expect(w).not.toContain('does NOT lower to a list')
  })
})

// ── explainUntypeableField ──────────────────────────────────────────────────

// An anonymous object EXPRESSION (a computed body) is what routes through
// `synthLiteralStructName` / `explainUntypeableField`. A `signal({…})` DECL
// takes the parser's own NAMED-struct path (`AppV`), which is a different
// mechanism with a different name scheme — using it here would have tested
// the wrong thing while looking green.
function fieldApp(literal: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(1)
  const v = computed(() => (${literal}))
  return (<Stack><Text>{n()}</Text></Stack>)
}`
}

describe('explainUntypeableField — the WHY behind a synthesis bail', () => {
  it.each([
    ['empty array field', `{ id: n(), tags: [] }`, 'an empty array literal carries no element type'],
    [
      'array of arrays',
      `{ id: n(), grid: [[1], [2]] }`,
      'an array of arrays has no synthesized element struct',
    ],
    [
      'mixed element types',
      `{ id: n(), mixed: [1, 'two'] }`,
      'the array mixes element types, so it has no single element type',
    ],
    [
      'null field',
      `{ id: n(), parent: null }`,
      'a `null`/`undefined` literal carries no type',
    ],
    [
      'undefined field',
      `{ id: n(), parent: undefined }`,
      'a `null`/`undefined` literal carries no type',
    ],
  ])('%s explains itself', (_k, literal, expected) => {
    expect(warns(fieldApp(literal))).toContain(expected)
  })

  it('a NESTED untypeable object names the nested cause', () => {
    expect(warns(fieldApp(`{ id: n(), meta: { tags: [] } }`))).toContain(
      'a nested object literal whose own fields are not all typeable',
    )
  })

  it('the NEGATIVE control: an all-typeable literal synthesizes a struct silently', () => {
    const r = run(fieldApp(`{ id: n(), name: 'a', ok: true }`))
    expect(r.code).toContain('struct __Obj0')
    expect(r.warnings.join('\n')).not.toContain('carries no element type')
  })

  it('an ANNOTATED declaration lowers to the declared struct, no synthesis', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Node = { id: string; parent: string | null }
export function App() {
  const v = signal<Node>({ id: 'a', parent: null })
  return (<Stack><Text>{v().id}</Text></Stack>)
}`)
    expect(out).toContain('Node(id: "a", parent: nil)')
  })
})

// ── synthLiteralStructName / typeShapeKey / literalShapeKey ────────────────

describe('struct synthesis keys — same shape shares, different shape splits', () => {
  it('two literals of the SAME shape share ONE synthesized struct', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(1)
  const a = computed(() => ({ x: n(), y: 2 }))
  const b = computed(() => ({ x: n(), y: 4 }))
  return (<Stack><Text>{a().x}{b().y}</Text></Stack>)
}`)
    expect(out).toContain('struct __Obj0')
    expect(out).not.toContain('struct __Obj1')
  })

  it('same field NAMES but different scalar TYPES get DISTINCT structs', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
export function App() {
  const n = signal(1)
  const s = signal('one')
  const a = computed(() => ({ x: n(), k: 1 }))
  const b = computed(() => ({ x: s(), k: 1 }))
  return (<Stack><Text>{a().x}{b().x}</Text></Stack>)
}`)
    expect(out).toContain('struct __Obj0')
    expect(out).toContain('struct __Obj1')
  })

  it('literalShapeKey: int-valued vs FRACTIONAL fields resolve to DIFFERENT declared structs', () => {
    // The whole reason the literal key carries the value type: `{ x: 1, y: 2 }`
    // must pick the Int struct and `{ x: 1.5, y: 2.5 }` the Double one, even
    // though the two declared types share field names.
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Px = { x: Double; y: Double }
type Idx = { x: number; y: number }
export function App() {
  const p = signal<Px>({ x: 1.5, y: 2.5 })
  const i = signal<Idx>({ x: 1, y: 2 })
  return (<Stack><Text>{p().x}{i().x}</Text></Stack>)
}`)
    expect(out).toContain('Px(x: 1.5, y: 2.5)')
    expect(out).toContain('Idx(x: 1, y: 2)')
  })

  it('a NESTED object literal recurses into its own struct (typeRef field)', () => {
    const out = sw(fieldApp(`{ id: n(), at: { lat: 1.5, lon: 2.5 } }`))
    expect(out).toContain('struct __Obj0')
    expect(out).toContain('struct __Obj1')
  })

  it('an array-of-objects field synthesizes an ELEMENT struct', () => {
    const out = sw(fieldApp(`{ id: n(), rows: [{ v: 1 }, { v: 2 }] }`))
    expect(out).toContain('struct __Obj0')
    expect(out).toMatch(/var rows: \[__Obj0\]/)
  })

  it('an array of SCALAR literals gives a scalar element type', () => {
    const out = sw(fieldApp(`{ id: n(), tags: ['a', 'b'] }`))
    expect(out).toMatch(/var tags: \[String\]/)
  })
})

// ── subsetStructName ────────────────────────────────────────────────────────

describe('subsetStructName — a literal that omits only OPTIONAL fields', () => {
  it('resolves to the declared struct rather than synthesizing a twin', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type T = { a: string; b?: string }
export function App() {
  const v = signal<T>({ a: 'x' })
  return (<Stack><Text>{v().a}</Text></Stack>)
}`)
    expect(out).toContain('T(a: "x")')
    expect(out).not.toContain('__Obj0(a: "x")')
  })

  it('a literal omitting a REQUIRED field does NOT resolve to that struct', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type T = { a: string; b: string }
export function App() {
  const v = signal({ a: 'x' })
  return (<Stack><Text>{v().a}</Text></Stack>)
}`)
    expect(out).not.toContain('T(a: "x")')
  })

  it('AMBIGUITY bails: two structs both accept the literal, so neither is guessed', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type A = { a: string; x?: string }
type B = { a: string; y?: string }
export function App() {
  const v = signal({ a: 'x' })
  return (<Stack><Text>{v().a}</Text></Stack>)
}`)
    expect(out).not.toContain('A(a: "x")')
    expect(out).not.toContain('B(a: "x")')
  })
})

// ── classifyDynamicStylingAttr ──────────────────────────────────────────────

function stylingApp(attrs: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const dense = signal(false)
  const sp = signal(8)
  return (<Stack ${attrs}><Text>x</Text></Stack>)
}`
}

describe('classifyDynamicStylingAttr — literal / two-literal ternary / dynamic', () => {
  it('NONE: a literal token resolves at compile time with no warning', () => {
    const r = run(stylingApp('gap="md"'))
    expect(r.warnings.join('\n')).not.toContain('gap')
  })

  it('TERNARY of two literals lowers to a native conditional', () => {
    const r = run(stylingApp('gap={dense() ? "sm" : "lg"}'))
    expect(r.code).toContain('dense ?')
    expect(r.warnings.join('\n')).not.toContain('is not a literal')
  })

  it('a NUMERIC two-literal ternary takes the same arm', () => {
    expect(run(stylingApp('padding={dense() ? 1 : 3}')).code).toContain('dense ?')
  })

  it('DYNAMIC: anything else warns loudly instead of silently dropping', () => {
    const w = warns(stylingApp('gap={sp()}'))
    expect(w.length).toBeGreaterThan(0)
    expect(w).toContain('gap')
  })

  it('a ternary with a NON-literal branch is dynamic, not a ternary', () => {
    expect(warns(stylingApp('gap={dense() ? sp() : 2}')).length).toBeGreaterThan(0)
  })

  it('an ABSENT attr is `none` — no warning, no modifier', () => {
    expect(warns(stylingApp('')).length).toBe(0)
  })
})

// ── isReReadableExpr / chainHasOptional / exprHasOptionalLink ───────────────

describe('isReReadableExpr — Object.values only rewrites a re-readable arg', () => {
  it('a bare signal READ is re-readable → the static member array is emitted', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type P = { a: number; b: number }
export function App() {
  const p = signal<P>({ a: 1, b: 2 })
  const vs = computed(() => Object.values(p()))
  return (<Stack><Text>{vs().length}</Text></Stack>)
}`)
    expect(out).toContain('[p.a, p.b]')
  })

  it('a receiver carrying a method CALL WITH ARGS is NOT re-readable → no rewrite', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type P = { a: number; b: number }
export function App() {
  const ps = signal<P[]>([])
  const vs = computed(() => Object.values(ps().filter((x) => x.a > 0)[0]))
  return (<Stack><Text>{vs().length}</Text></Stack>)
}`)
    expect(out).not.toContain('.a, ')
  })
})

describe('exprHasOptionalLink / chainHasOptional — optional PROPAGATION', () => {
  it('an optional link makes every SUBSEQUENT access optional too', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Inner = { c: string }
type Outer = { b?: Inner }
export function App() {
  const o = signal<Outer>({})
  const v = computed(() => o()?.b?.c)
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
    expect(out).toContain('?.')
  })

  it('a chain with NO optional link stays plain', () => {
    const out = sw(`import { Stack, Text } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Inner = { c: string }
type Outer = { b: Inner }
export function App() {
  const o = signal<Outer>({ b: { c: 'x' } })
  const v = computed(() => o().b.c)
  return (<Stack><Text>{v()}</Text></Stack>)
}`)
    expect(out).toContain('o.b.c')
  })
})

// ── buildComponentConstMap ──────────────────────────────────────────────────

describe('buildComponentConstMap — component-scope const resolution', () => {
  it('resolves a component-body string const in a static attr position', () => {
    const out = sw(`import { Stack, Image } from '@pyreon/primitives'
export function App() {
  const LOGO = '/logo.png'
  return (<Stack><Image src={LOGO} /></Stack>)
}`)
    expect(out).toContain('logo')
  })

  it('resolves a TRANSITIVE alias (const b = a) in source order', () => {
    const out = sw(`import { Stack, Image } from '@pyreon/primitives'
export function App() {
  const A = '/logo.png'
  const B = A
  return (<Stack><Image src={B} /></Stack>)
}`)
    expect(out).toContain('logo')
  })

  it('a NON-scalar const is skipped — the static-attr path falls through', () => {
    const r = run(`import { Stack, Image } from '@pyreon/primitives'
export function App() {
  const O = { src: '/logo.png' }
  return (<Stack><Image src={O.src} /></Stack>)
}`)
    expect(r.code.length).toBeGreaterThan(0)
  })
})

// ── optionalSpreadWarning / isNullableType ─────────────────────────────────

describe('optionalSpreadWarning — spreading an OPTIONAL object', () => {
  const spreadApp = (paramType: string, arg: string): string =>
    `import { Stack, Text } from '@pyreon/primitives'
type Opts = { a: string; b: string }
function mk(base: ${paramType}): Opts { return { ...base, a: 'x' } }
export function App() { return (<Stack><Text>{mk(${arg}).a}</Text></Stack>) }`

  it('names the binding and the two remedies', () => {
    const w = warns(spreadApp('Opts | undefined', 'undefined'))
    expect(w).toContain('Spreading `base`, which is optional, has no native lowering')
    expect(w).toContain('Build the object field by field instead (`field: base?.field ?? <fallback>`)')
  })

  it('the NEGATIVE control: a NON-optional spread source does not warn', () => {
    const w = warns(spreadApp('Opts', `{ a: '1', b: '2' }`))
    expect(w).not.toContain('which is optional, has no native lowering')
  })

  it('KOTLIN warns identically — ONE shared message, so the two cannot drift', () => {
    expect(warns(spreadApp('Opts | undefined', 'undefined'), 'kotlin')).toContain(
      'Spreading `base`, which is optional, has no native lowering',
    )
  })
})
