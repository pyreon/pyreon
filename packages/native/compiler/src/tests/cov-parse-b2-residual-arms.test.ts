// Branch coverage — the residual `src/parse.ts` arms in the recognizer band:
// modifier-chain fall-throughs, unary/array/collection type inference,
// `useUrlState` scalar rules, the "no argument at all" diagnostics, and the
// non-Identifier object-key paths through every options walker.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })

const Z = `import { zodSchema } from '@pyreon/validation'
import { z } from 'zod'
`
const IMPORTS = `import { signal } from '@pyreon/reactivity'
import { useStorage, useFetch, useCounter, useToggle, useDebouncedValue, useThrottledCallback } from '@pyreon/hooks'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
import { useQuery } from '@pyreon/query'
`
const body = (b: string) =>
  `${IMPORTS}type Resp = { ok: boolean }\nexport function App(){\n  const n = signal(1)\n${b}\n  return <Text>x</Text>\n}`
const APP = `\nexport function App(){ return <Text>x</Text> }\n`

describe('parse.ts — modifier chains fall through on an unrecognised modifier', () => {
  it('ignores an unknown FIELD modifier while keeping the base type', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ n: z.string().trim().min(2) }))`)
    expect(r.code).toContain('var n: String = ""')
    expect(r.code).toContain('rule: "min length 2"')
  })

  it('ignores an unknown ELEMENT modifier while keeping the element type', () => {
    const r = swift(Z + `const a = zodSchema(z.object({ t: z.array(z.string().trim().url()) }))`)
    expect(r.code).toContain('var t: [String] = []')
    expect(r.code).toContain('rule: "url (element)"')
  })

  it('skips a discriminator-variant key that is neither Identifier nor string literal', () => {
    const r = swift(
      Z +
        'declare const k: string\n' +
        'const a = zodSchema(z.discriminatedUnion(\'kind\', [z.object({ [`x${k}`]: z.string(), kind: z.literal(\'a\') })]))',
    )
    expect(r.code).toContain('case a(PyreonZodSchema_a_A)')
  })
})

describe('parse.ts — inferTypeFromInitial residual arms', () => {
  it('keeps a unary `+` numeric literal typed', () => {
    expect(swift(body('  const p = signal(+3)')).code).toContain('@State private var p: Int = +3')
  })

  it('types a unary `!` initial as boolean', () => {
    expect(swift(body('  const p = signal(!true)')).code).toContain('@State private var p: Bool = !true')
  })

  it('does NOT claim a numeric type when the unary operand is not a number', () => {
    const r = swift(body(`  const p = signal(-'a')`))
    expect(r.code).not.toContain('@State private var p: Bool')
  })

  it('refuses an unsupported unary operator entirely', () => {
    const r = swift(body('  const p = signal(~3)'))
    expect(r.warnings.join('\n')).toContain('Unary operator `~` is not supported in native')
  })

  it('types an array-of-arrays whose leaf resolves, and degrades one that does not', () => {
    expect(swift(body('  const g = signal([[1,2],[3,4]])')).code).toContain('@State private var g: [[Int]] = [[1, 2], [3, 4]]')
    const unknown = swift(body('  declare const q2: any\n  const g = signal([[q2],[q2]])'))
    expect(unknown.code).toContain('@State private var g: Any = [[q2], [q2]]')
  })

  it('recovers a Set element type from its seed array', () => {
    expect(swift(body('  const g = signal(new Set([1,2,3]))')).code).toContain('@State private var g: Set<Int> = Set([1, 2, 3])')
  })
})

describe('parse.ts — resolveUrlStateDefault residual arms', () => {
  it('declines a `null` default (a Literal that is no scalar)', () => {
    const r = swift(body(`  const [q, setQ] = useUrlState('k', null)`))
    expect(r.warnings.join('\n')).toContain('lowers with a STRING, NUMBER or BOOLEAN default')
  })
})

describe('parse.ts — "no argument at all" diagnostics', () => {
  it('names `nothing` for a bare useStorage() and useFetch()', () => {
    expect(swift(body('  const q = useStorage()')).warnings.join('\n')).toContain(
      'useStorage needs a statically-known key',
    )
    expect(swift(body('  const q = useStorage()')).warnings.join('\n')).toContain('Got nothing.')
    expect(swift(body('  const q = useFetch<Resp>()')).warnings.join('\n')).toContain('Got nothing.')
  })

  it('names `nothing` for a hole in the useFieldArray literal', () => {
    expect(swift(body(`  const fa = useFieldArray([,'a'])`)).warnings.join('\n')).toContain(
      'useFieldArray initial elements must be string literals; got nothing',
    )
  })

  it('defaults a bare useCounter() / useToggle() to 0 / false', () => {
    expect(swift(body('  const c = useCounter()')).code).toContain('@State private var c: Int = 0')
    expect(swift(body('  const t = useToggle()')).code).toContain('@State private var t: Bool = false')
  })
})

describe('parse.ts — non-Identifier object keys through every options walker', () => {
  it('reads a STRING-literal `method` key in the useFetch init', () => {
    expect(swift(body(`  const q = useFetch<Resp>('https://x', { 'method': 'POST' })`)).code).toContain('method: .post')
  })

  it('skips a COMPUTED, NUMERIC-key, and non-literal-valued header entry, keeping the rest', () => {
    const computed = swift(body(`  declare const k: string\n  const q = useFetch<Resp>('https://x', { headers: { [k]: 'v', A: 'b' } })`))
    expect(computed.code).toContain('headers: ["A": "b"]')
    const numeric = swift(body(`  const q = useFetch<Resp>('https://x', { headers: { 1: 'v', A: 'b' } })`))
    expect(numeric.code).toContain('headers: ["A": "b"]')
    // A non-literal value under an unusable key warns about NEITHER — the
    // key never resolves, so there is nothing to name.
    const both = swift(body(`  declare const v: string\n  const q = useFetch<Resp>('https://x', { headers: { 1: v, A: 'b' } })`))
    expect(both.code).toContain('headers: ["A": "b"]')
    expect(both.warnings.join('\n')).not.toContain('must be a string literal to lower to native; it will be OMITTED')
  })

  it('ignores an unknown useQuery option key', () => {
    const r = swift(body(`  const q = useQuery<Resp>(() => ({ queryKey: ['a'], queryFn: () => fetch('https://x'), enabled: true }))`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('queryKey: "a"')
  })

  it('reads a STRING-literal useForm config key and validator key', () => {
    // The config walker accepts `'validators'` as a string-literal key…
    expect(swift(body(`  const f = useForm({ initialValues: { a: '' }, 'validators': { a: (v) => '' } })`)).code).toContain(
      'validators: ["a": { v in "" }]',
    )
    // …and so does the per-field validator map.
    expect(swift(body(`  const f = useForm({ initialValues: { a: '' }, validators: { 'a': (v) => '' } })`)).code).toContain(
      'validators: ["a": { v in "" }]',
    )
  })

  it('skips a SPREAD inside useForm validators and inside useCounter options', () => {
    const v = swift(body(`  declare const base: any\n  const f = useForm({ initialValues: { a: '' }, validators: { ...base, a: (v) => '' } })`))
    expect(v.code).toContain('validators: ["a": { v in "" }]')
    const c = swift(body('  declare const o: any\n  const c = useCounter(0, { ...o })'))
    expect(c.warnings).toEqual([])
    expect(c.code).toContain('@State private var c: Int = 0')
  })

  it('names `?` when a validator key cannot be resolved statically', () => {
    const r = swift(body('  declare const k: string\n  const f = useForm({ initialValues: { a: \'\' }, validators: { [`x${k}`]: (v) => \'\' } })'))
    expect(r.warnings.join('\n')).toContain('validator `?` must be a single-param expression-body arrow')
  })

  it('names `?` when a useCounter option key is a string literal (not an Identifier)', () => {
    const r = swift(body(`  const c = useCounter(0, { 'min': 0 })`))
    expect(r.warnings.join('\n')).toContain('option `?` is not a numeric literal')
  })
})

describe('parse.ts — useDebouncedValue / useThrottledCallback callback shapes', () => {
  it('declines a FunctionExpression source (it can only have a block body)', () => {
    expect(swift(body('  const d = useDebouncedValue(function(){ return n() }, 200)')).warnings.join('\n')).toContain(
      'the source must be an expression-body getter',
    )
  })

  it('declines a throttled callback that takes more than one argument', () => {
    expect(swift(body('  const t = useThrottledCallback((a: number, b: number) => { }, 100)')).warnings.join('\n')).toContain(
      'the native runtime carries ONE argument and this callback takes 2',
    )
  })
})

describe('parse.ts — statement / return classification residuals', () => {
  it('names a dropped ClassDeclaration by its raw node type', () => {
    expect(
      swift(`export function App(){\n  class Foo { }\n  return <Text>x</Text>\n}`).warnings.join('\n'),
    ).toContain('a top-level `ClassDeclaration` statement has no native lowering')
  })

  it('sees JSX through a PARENTHESIZED ternary return', () => {
    const r = swift(
      `export function row(x: number) { return (x > 1 ? <Text>a</Text> : <Text>b</Text>) }` + APP,
    )
    expect(r.code).toContain('struct row: View {')
    expect(r.code).not.toContain('func row(')
  })
})

describe('parse.ts — type-alias residuals', () => {
  it('declines a union branch whose literal is not a plain Literal node', () => {
    expect(swift(`export type S = 'a' | -1` + APP).code).not.toContain('enum S')
    expect(swift('export type S = \'a\' | `p${string}`' + APP).code).not.toContain('enum S')
  })

  it('keeps a MULTI-branch core union type as-is when merging object branches', () => {
    const r = swift(`export type S = { a: string | number } | { a: string | number }` + APP)
    expect(r.code).toContain('struct S: Codable {')
    expect(r.code).toContain('var a: Any')
  })
})

describe('parse.ts — props-parameter residuals', () => {
  it('produces NO props when a destructured parameter annotation does not resolve to an object', () => {
    const r = swift(`export function Row({ a }: Foo) { return <Text>x</Text> }`)
    expect(r.warnings.join('\n')).toContain('Component props type `Foo` can’t be resolved'.replace('’', "'"))
    expect(r.code).not.toContain('let a:')
  })

  it('walks a body containing an ARRAY HOLE without claiming a props reference', () => {
    const r = swift(`export function Row(props) { const [, b] = [1,2]; return <Text>{String(b)}</Text> }`)
    expect(r.warnings.join('\n')).not.toContain('untyped `props` parameter')
  })

  it('walks past a member expression rooted at something OTHER than the props param', () => {
    const r = swift(`export function Row(props) { return <Text>{String(Math.PI)}</Text> }`)
    expect(r.warnings.join('\n')).not.toContain('untyped `props` parameter')
  })
})

describe('parse.ts — destructuring whose synthesized container declines', () => {
  const H = `import { useFetch, useStorage, useCounter } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
`
  const b = (stmt: string) =>
    `${H}type Resp = { ok: boolean }\nexport function App(){\n  const n = signal(1)\n${stmt}\n  return <Text>x</Text>\n}`

  it('falls through to the hook warning when the CONTAINER hook itself declines', () => {
    const r = swift(b('  declare const u: string\n  const { data, isPending } = useFetch<Resp>(u)'))
    // Both diagnostics fire: the hook says WHY, the destructure says WHAT.
    expect(r.warnings.join('\n')).toContain('useFetch needs a statically-known url')
    expect(r.warnings.join('\n')).toContain('useFetch() destructure form')
    expect(r.code).not.toContain('__pyHook0')
  })

  it('falls through to the LOUD residual warning when a GENERAL object container declines', () => {
    const r = swift(b('  const { count, inc } = useCounter(n())'))
    expect(r.warnings.join('\n')).toContain('useCounter() `__pyDestr0`: the initial value must be a numeric literal')
    expect(r.warnings.join('\n')).toContain('Component-body destructuring in this shape is not lowered to native')
    expect(r.code).not.toContain('__pyDestr0')
  })

  it('does the same for an ARRAY container that declines', () => {
    const r = swift(b('  declare const k: string\n  const [a, bb] = useStorage(k)'))
    expect(r.warnings.join('\n')).toContain('useStorage needs a statically-known key')
    expect(r.warnings.join('\n')).toContain('Component-body destructuring in this shape is not lowered to native')
  })
})
