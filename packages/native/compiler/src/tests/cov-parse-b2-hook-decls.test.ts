// Branch coverage — `src/parse.ts` hook-declaration lowering:
// `signal` / `useStorage` / `useSessionStorage` / `computed` / `useUrlState`
// / `useFetch` / `useQuery` / `useForm` / `useCounter` / `useToggle` /
// `useDebouncedValue` / `useFieldArray` / `useWebSocket`, plus the shared
// arrow-return + query-key helpers.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })

const IMPORTS = `import { signal, computed } from '@pyreon/reactivity'
import { useStorage, useSessionStorage, useMemoryStorage, useFetch, useCounter, useToggle, useDebouncedValue } from '@pyreon/hooks'
import { useWebSocket } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'
import { useForm, useFieldArray } from '@pyreon/form'
import { useUrlState } from '@pyreon/url-state'
`
const body = (b: string) =>
  `${IMPORTS}type Resp = { ok: boolean }\nexport function App(){\n  const n = signal(1)\n${b}\n  return <Text>x</Text>\n}`

describe('parse.ts — signal / session / memory storage initial-value inference', () => {
  it('defaults a zero-argument signal to the numeric zero literal', () => {
    expect(swift(body('  const q = signal()')).code).toContain('@State private var q: Int = 0')
  })

  it('honours an EXPLICIT generic over the inferred initial type', () => {
    expect(swift(body(`  const q = signal<string>('a')`)).code).toContain('@State private var q: String = "a"')
  })

  it('treats useSessionStorage / useMemoryStorage as plain state (no persistence)', () => {
    const sess = swift(body(`  const q = useSessionStorage('k', 'a')`))
    expect(sess.code).toContain('@State private var q: String = "a"')
    expect(sess.code).not.toContain('@AppStorage')
    const mem = swift(body(`  const q = useMemoryStorage('k', 5)`))
    expect(mem.code).toContain('@State private var q: Int = 5')
    // Argument-less and explicit-generic forms take the other arms.
    expect(swift(body(`  const q = useSessionStorage('k')`)).code).toContain('@State private var q: Int = 0')
    expect(swift(body(`  const q = useSessionStorage<string>('k', 'a')`)).code).toContain(
      '@State private var q: String = "a"',
    )
  })
})

describe('parse.ts — useStorage', () => {
  it('bakes a literal key into @AppStorage and infers the initial type', () => {
    expect(swift(body(`  const q = useStorage('k', 'a')`)).code).toContain('@AppStorage("k") private var q: String = "a"')
    expect(swift(body(`  const q = useStorage('k')`)).code).toContain('@AppStorage("k") private var q: Int = 0')
    expect(swift(body(`  const q = useStorage<string>('k', 'a')`)).code).toContain(
      '@AppStorage("k") private var q: String = "a"',
    )
  })

  it('warns + declines a key that is not statically known', () => {
    const r = swift(body('  declare const k: string\n  const q = useStorage(k, 1)'))
    expect(r.warnings.join('\n')).toContain('Declaration q: useStorage needs a statically-known key')
    expect(r.code).not.toContain('@AppStorage')
  })
})

describe('parse.ts — computed', () => {
  it('warns when the argument is not an arrow function, and when it is missing', () => {
    expect(swift(body('  const c = computed(function(){ return 1 })')).warnings.join('\n')).toContain(
      'Declaration c: computed expected an arrow function argument; got FunctionExpression.',
    )
    expect(swift(body('  const c = computed()')).warnings.join('\n')).toContain(
      'Declaration c: computed expected an arrow function argument; got nothing.',
    )
  })
})

describe('parse.ts — useUrlState default resolution', () => {
  const u = (b: string) => swift(body(b))
  it('defaults to an empty string when no default is given', () => {
    expect(u(`  const [q, setQ] = useUrlState('q')`).code).toContain('PyreonUrlState(router: pyreonRouter, key: "q", defaultValue: "")')
  })

  it('unwraps a leading unary sign on a numeric default', () => {
    expect(u(`  const [q, setQ] = useUrlState('off', -1)`).code).toContain('PyreonUrlStateInt(router: pyreonRouter, key: "off", defaultValue: -1)')
    // A leading `+` is dropped — it reads as an operator in both targets.
    expect(u(`  const [q, setQ] = useUrlState('off', +1)`).code).toContain('defaultValue: 1)')
  })

  it('lowers boolean and fractional defaults to their own container types', () => {
    expect(u(`  const [q, setQ] = useUrlState('on', true)`).code).toContain('PyreonUrlStateBool')
    expect(u(`  const [q, setQ] = useUrlState('r', 1.5)`).code).toContain('PyreonUrlStateDouble')
  })

  it('warns on a non-scalar default, and on a unary wrapping a non-number', () => {
    const plain = u('  declare const z: any\n  const [q, setQ] = useUrlState(\'r\', z)')
    expect(plain.warnings.join('\n')).toContain('lowers with a STRING, NUMBER or BOOLEAN default')
    const unary = u('  declare const z: any\n  const [q, setQ] = useUrlState(\'r\', -z)')
    expect(unary.warnings.join('\n')).toContain('lowers with a STRING, NUMBER or BOOLEAN default')
  })

  it('warns + declines a key that is not statically known', () => {
    const r = u('  declare const k: string\n  const [q, setQ] = useUrlState(k, 1)')
    expect(r.warnings.join('\n')).toContain('needs a statically-known key')
  })
})

describe('parse.ts — useFetch request init', () => {
  it('warns + declines a url that is not statically known', () => {
    const r = swift(body('  declare const u: string\n  const q = useFetch<Resp>(u)'))
    expect(r.warnings.join('\n')).toContain('Declaration q: useFetch needs a statically-known url')
  })

  it('warns when the init argument is not an object literal', () => {
    const r = swift(body(`  const q = useFetch<Resp>('https://x', 'nope')`))
    expect(r.warnings.join('\n')).toContain('useFetch init must be an object literal to lower to native; got Literal')
  })

  it('warns when method / body are not string literals', () => {
    expect(swift(body(`  declare const m: string\n  const q = useFetch<Resp>('https://x', { method: m })`)).warnings.join('\n')).toContain(
      'useFetch method must be a string literal',
    )
    expect(
      swift(body(`  const q = useFetch<Resp>('https://x', { method: 'POST', body: JSON.stringify({a:1}) })`)).warnings.join('\n'),
    ).toContain('useFetch body must be a string literal')
  })

  it('warns when headers is not an object literal, and per non-literal header value', () => {
    expect(swift(body(`  declare const h: any\n  const q = useFetch<Resp>('https://x', { headers: h })`)).warnings.join('\n')).toContain(
      'useFetch headers must be an object literal of string literals',
    )
    expect(swift(body(`  declare const v: string\n  const q = useFetch<Resp>('https://x', { headers: { A: v } })`)).warnings.join('\n')).toContain(
      'useFetch header "A" must be a string literal',
    )
  })

  it('accepts a STRING-literal header key and keeps the header', () => {
    expect(swift(body(`  const q = useFetch<Resp>('https://x', { headers: { 'X-A': 'b' } })`)).code).toContain(
      'headers: ["X-A": "b"]',
    )
  })

  it('emits NO headers when every entry was skipped', () => {
    const r = swift(body(`  declare const v: string\n  const q = useFetch<Resp>('https://x', { headers: { A: v } })`))
    expect(r.code).not.toContain('headers: [')
  })

  it('names an init option with no native equivalent', () => {
    expect(swift(body(`  const q = useFetch<Resp>('https://x', { credentials: 'include' })`)).warnings.join('\n')).toContain(
      'useFetch init option "credentials" has no native equivalent',
    )
  })

  it('skips a COMPUTED init key and a non-string literal key, keeping the siblings', () => {
    const computed = swift(body(`  declare const k: string\n  const q = useFetch<Resp>('https://x', { [k]: 1, method: 'POST' })`))
    expect(computed.code).toContain('method: .post')
    expect(computed.warnings.join('\n')).not.toContain('has no native equivalent')
    const numeric = swift(body(`  const q = useFetch<Resp>('https://x', { 1: 'x', method: 'PUT' })`))
    expect(numeric.code).toContain('method: .put')
  })

  it('warns when no response generic is given (Swift cannot decode Any)', () => {
    expect(swift(body(`  const q = useFetch('https://x')`)).warnings.join('\n')).toContain(
      'useFetch without a response type lowers to decode(Any.self, ...) on Swift',
    )
  })
})

describe('parse.ts — useQuery option parsing', () => {
  const q = (opts: string) => swift(body(`  const q = useQuery<Resp>(${opts})`))
  const OK_FN = `queryFn: () => fetch('https://x')`

  it('warns + declines with NO response generic', () => {
    const r = swift(body(`  const q = useQuery(() => ({ queryKey: ['a'], ${OK_FN} }))`))
    expect(r.warnings.join('\n')).toContain('useQuery without a response type lowers to a decode of Any on Swift')
  })

  it('warns + declines when the options argument is not an arrow function, or missing', () => {
    expect(q(`function(){ return { queryKey: ['a'] } }`).warnings.join('\n')).toContain(
      'useQuery expects an options function',
    )
    expect(q('').warnings.join('\n')).toContain('got nothing')
  })

  it('warns when the options arrow does not return an object literal', () => {
    expect(q('() => 5').warnings.join('\n')).toContain('useQuery options function must return an object literal')
  })

  it('reads the object through a BLOCK return, with or without parens', () => {
    expect(q(`() => { return { queryKey: ['a'], ${OK_FN} } }`).code).toContain('queryKey: "a"')
    expect(q(`() => { return ({ queryKey: ['a'], ${OK_FN} }) }`).code).toContain('queryKey: "a"')
  })

  it('warns + declines an unusable queryKey — non-array, empty array, spread', () => {
    const msg = 'useQuery queryKey must be an ARRAY of string/number literals'
    expect(q(`() => ({ queryKey: 'a', ${OK_FN} })`).warnings.join('\n')).toContain(msg)
    expect(q(`() => ({ queryKey: [], ${OK_FN} })`).warnings.join('\n')).toContain(msg)
    expect(swift(body(`  declare const p: any[]\n  const q = useQuery<Resp>(() => ({ queryKey: [...p], ${OK_FN} }))`)).warnings.join('\n')).toContain(msg)
  })

  it('bakes a literal staleTime and warns on a non-literal one', () => {
    expect(q(`() => ({ queryKey: ['a'], ${OK_FN}, staleTime: 500 })`).code).toContain('staleSeconds: 0.5')
    expect(q(`() => ({ queryKey: ['a'], ${OK_FN}, staleTime: n() })`).warnings.join('\n')).toContain(
      'useQuery staleTime must be a number literal (ms)',
    )
  })

  it('distinguishes a MISSING queryKey from a MISSING queryFn', () => {
    expect(q(`() => ({ ${OK_FN} })`).warnings.join('\n')).toContain('useQuery needs a queryKey to lower to native.')
    expect(q(`() => ({ queryKey: ['a'] })`).warnings.join('\n')).toContain('useQuery needs a queryFn to lower to native.')
  })

  it('warns ONCE for an unlowerable queryFn (not twice with the missing-queryFn text)', () => {
    const r = swift(body(`  const cb = () => fetch('https://x')\n  const q = useQuery<Resp>(() => ({ queryKey: ['a'], queryFn: cb }))`))
    expect(r.warnings.join('\n')).toContain('useQuery queryFn must be an inline')
    expect(r.warnings.join('\n')).not.toContain('useQuery needs a queryFn')
  })

  it('lowers a DIRECT-VALUE queryFn and a TEMPLATE-url queryFn', () => {
    expect(q(`() => ({ queryKey: ['a'], queryFn: () => ({ ok: true }) })`).code).toContain('q.resolve(')
    expect(q('() => ({ queryKey: [\'a\', n()], queryFn: () => fetch(`https://x/${n()}`) })').code).toContain(
      'URL(string: "https://x/\\(n)")',
    )
  })

  it('carries a fetch init through the queryFn', () => {
    expect(q(`() => ({ queryKey: ['a'], queryFn: () => fetch('https://x', { method: 'POST' }) })`).code).toContain(
      'method: .post',
    )
  })

  it('skips a computed / non-string option key and keeps the siblings', () => {
    expect(swift(body(`  declare const kk: string\n  const q = useQuery<Resp>(() => ({ [kk]: 1, queryKey: ['a'], ${OK_FN} }))`)).code).toContain(
      'queryKey: "a"',
    )
    expect(q(`() => ({ 1: 'x', queryKey: ['a'], ${OK_FN} })`).code).toContain('queryKey: "a"')
    expect(q(`() => ({ 'queryKey': ['a'], ${OK_FN} })`).code).toContain('queryKey: "a"')
  })
})

describe('parse.ts — endpointQueryCallInArrow arrow shapes', () => {
  const HTTP = `import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = api.endpoint('GET /users/1')
`
  const app = (b: string) => `${HTTP}export function App(){\n${b}\n  return <Text>x</Text>\n}`

  it('recognises the concise, parenthesized, block and block-parenthesized returns', () => {
    for (const form of [
      '() => getUser.query()',
      '() => (getUser.query())',
      '() => { return getUser.query() }',
      '() => { return (getUser.query()) }',
    ]) {
      const r = transform(app(`  const u = useQuery<User>(${form})`), { target: 'swift' })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('PyreonQuery<User>(queryKey: "GET:/api/users/1"')
    }
  })

  it('does NOT claim a block body with no return, a computed member, a non-query method, or an unknown object', () => {
    const generic = 'useQuery options function must return an object literal'
    for (const form of [
      '() => { getUser.query() }',
      "() => getUser['query']()",
      '() => getUser.mutate()',
    ]) {
      expect(transform(app(`  const u = useQuery<User>(${form})`), { target: 'swift' }).warnings.join('\n')).toContain(generic)
    }
    const unknown = transform(app(`  declare const other: any\n  const u = useQuery<User>(() => other.query())`), {
      target: 'swift',
    })
    expect(unknown.warnings.join('\n')).toContain(generic)
  })
})

describe('parse.ts — useForm validators / onSubmit', () => {
  const f = (cfg: string) => swift(body(`  const f = useForm(${cfg})`))
  const bad = "must be a single-param expression-body arrow"

  it('lowers an expression-body single-param validator', () => {
    const r = f(`{ initialValues: { a: '' }, validators: { a: (v) => v ? '' : 'req' } }`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('validators: ["a": { v in v ? "" : "req" }]')
  })

  it('warns + skips a BLOCK-body, multi-param, or non-arrow validator', () => {
    expect(f(`{ initialValues: { a: '' }, validators: { a: (v) => { return '' } } }`).warnings.join('\n')).toContain(bad)
    expect(f(`{ initialValues: { a: '' }, validators: { a: (v, w) => '' } }`).warnings.join('\n')).toContain(bad)
    expect(f(`{ initialValues: { a: '' }, validators: { a: 5 } }`).warnings.join('\n')).toContain(bad)
  })

  it('skips a validator whose single parameter is not a plain identifier', () => {
    const r = f(`{ initialValues: { a: '' }, validators: { a: ({ x }) => '' } }`)
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('validators:')
  })

  it('lowers onSubmit and skips a SpreadElement config property', () => {
    expect(f(`{ initialValues: { a: '' }, onSubmit: (v) => { } }`).code).toContain('f.onSubmit = {')
    const spread = swift(body(`  declare const base: any\n  const f = useForm({ ...base, initialValues: { a: '' } })`))
    expect(spread.code).toContain('initialValues: ["a": ""]')
  })
})

describe('parse.ts — useCounter / useToggle / useDebouncedValue', () => {
  it('bakes literal initial + clamp bounds into native state + clamped mutators', () => {
    const r = swift(
      `${IMPORTS}export function App(){\n  const c = useCounter(3, { min: 0, max: 9 })\n  return <Button onPress={() => c.inc()}>{String(c.count())}</Button>\n}`,
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var c: Int = 3')
    // The clamp is baked at the mutator use site, not into the declaration.
    expect(r.code).toContain('c = min(max(c + 1, 0), 9)')
  })

  it('warns + declines a non-literal initial, non-object options, an unknown option, and a non-literal bound', () => {
    expect(swift(body('  const c = useCounter(n())')).warnings.join('\n')).toContain(
      'useCounter() `c`: the initial value must be a numeric literal',
    )
    expect(swift(body('  declare const o: any\n  const c = useCounter(0, o)')).warnings.join('\n')).toContain(
      'the options argument must be a literal { min, max } object',
    )
    expect(swift(body('  const c = useCounter(0, { step: 2 })')).warnings.join('\n')).toContain(
      'option `step` is not a numeric literal',
    )
    expect(swift(body('  const c = useCounter(0, { min: n() })')).warnings.join('\n')).toContain(
      'option `min` is not a numeric literal',
    )
  })

  it('warns + declines a non-boolean-literal useToggle initial', () => {
    expect(swift(body('  const t = useToggle(n())')).warnings.join('\n')).toContain(
      'useToggle() `t`: the initial value must be a boolean literal',
    )
    expect(swift(body('  const t = useToggle(true)')).warnings).toEqual([])
  })

  it('warns + declines a BLOCK-bodied source or a non-literal delay for useDebouncedValue', () => {
    expect(swift(body('  const d = useDebouncedValue(() => { return n() }, 200)')).warnings.join('\n')).toContain(
      'the source must be an expression-body getter',
    )
    expect(swift(body('  const d = useDebouncedValue(() => n(), n())')).warnings.join('\n')).toContain(
      'the delay must be a numeric literal to bake into the native schedule',
    )
  })
})

describe('parse.ts — useFieldArray / useWebSocket argument rules', () => {
  it('lowers a string-literal array and warns on anything else', () => {
    expect(swift(body(`  const fa = useFieldArray(['a'])`)).code).toContain('PyreonFieldArray(["a"])')
    expect(swift(body(`  const fa = useFieldArray('x')`)).warnings.join('\n')).toContain(
      'useFieldArray initial must be an array literal of strings (or omitted); got Literal',
    )
    expect(swift(body(`  const fa = useFieldArray([1])`)).warnings.join('\n')).toContain(
      'useFieldArray initial elements must be string literals; got Literal',
    )
  })

  it('warns when the useWebSocket url is not a string literal, or is missing', () => {
    expect(swift(body('  const w = useWebSocket(n())')).warnings.join('\n')).toContain(
      'useWebSocket url argument must be a string literal; got CallExpression',
    )
    expect(swift(body('  const w = useWebSocket()')).warnings.join('\n')).toContain(
      'useWebSocket url argument must be a string literal; got nothing',
    )
  })
})
