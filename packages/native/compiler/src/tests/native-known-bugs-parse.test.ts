// Regression specs for a batch of parse.ts known bugs (2026-09).
//
//   1. COMPUTED-KEY class. Literal-config readers tested
//      `key.type === 'Identifier'` without `prop.computed`, so `{ [kind]: … }`
//      was read as the literal key "kind" (a silent RENAME), and readers that
//      did check `computed` skipped the entry silently. Every reader now goes
//      through `staticPropKey` / `hasDynamicKey`: a computed NON-literal key is
//      named (or bails the construct the same way a non-literal value does),
//      a computed LITERAL key (`['a']`) is read as the static key it is.
//   2. `tryFunctionDecl` never returns null; its return type now says so and
//      the dead `fn?.kind !== 'function'` guards (with their unreachable
//      warnings) are gone. Type-level only — covered by `tsc`.
//   3. A lowercase HELPER `function f(err: Error)` warned "Component props
//      type `Error` can't be resolved" — its params are not props. The props
//      warnings of a lowercase param-taking function are now deferred to the
//      component confirmation; a confirmed helper re-names an unresolvable
//      PARAMETER type in helper terms (it still reaches the native signature
//      verbatim, so dropping it would hide a real build failure).
//   4. `toast.bogus("q")` passed through verbatim with no warning.
//   5. A SizedMap with a non-literal `maxEntries` warned twice.
//   6. `useUrlState('k', 1e999)` blamed "an array or object default".
//   7. createFlow node `data` rows unified by field NAMES only (it.fails specs
//      converted in cov-swift-c-2026-09.test.ts); the compile checks live here.
//
// Bisect results (each fix reverted ALONE, specs re-run, fix restored, green):
//   1. `staticPropKey` reading a computed Identifier as its name → 15 specs
//      here + the converted cov-parse-c connectionRules spec fail (e.g.
//      `connectionRules` lowers under "kind"; machine emits event "EV").
//      `literalObjectKeys` sentinel removed → the defaultEdgeOptions spec and
//      cov-parse-c's node-literal spec fail. Type-literal filter removed →
//      "a computed TYPE-literal member" fails (`var K` emitted).
//   3. deferral removed → "`function describe(err: Error)`" fails (the
//      component-worded warning is back).
//   4. toast member branch removed → 3 toast specs fail (verbatim
//      `toast.bogus(...)`, no warning).
//   5. early return removed → "one named warning" fails (2 SizedMap warnings).
//   6. old message restored → 3 useUrlState specs fail.
//   7. type-heterogeneity line removed → "the SAME field set with Int vs
//      Double" fails (rows keep `__Obj0`/`__Obj1`); Swift conflict warning
//      removed → the NAMED spec + cov-swift-c's `Any?` spec fail.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const warn = (r: { warnings: string[] }) => r.warnings.join('\n')
const DYN = 'is only known at runtime, so this entry cannot be read at compile time'

const app = (imports: string, body: string) =>
  `${imports}\nimport { Text } from '@pyreon/primitives'\nexport function App(){\n${body}\n  return <Text>x</Text>\n}`

// ---------------------------------------------------------------------------
// 1. computed keys
// ---------------------------------------------------------------------------

describe('computed keys are never read as the identifier name', () => {
  it('createMachine: a computed event key is named, not lowered as the event "EV"', () => {
    const r = swift(
      app(`import { createMachine } from '@pyreon/machine'`, `  const EV = 'GO'\n  const m = createMachine({ initial: 'a', states: { a: { on: { [EV]: 'b' } }, b: {} } })`),
    )
    expect(warn(r)).toContain(`createMachine declaration \`m\`: state \`a\` \`on\`: the computed key \`[EV]\` ${DYN}`)
    expect(r.code).not.toContain('"EV"')
  })

  it('useCounter: a computed option key is named and the declaration is not lowered', () => {
    const r = swift(app(`import { useCounter } from '@pyreon/hooks'`, `  const min = 'min'\n  const c = useCounter(0, { [min]: 0 })`))
    expect(warn(r)).toContain('useCounter() `c`: option `[min]` is not a numeric literal')
  })

  it('useForm: a computed config key and a computed initialValues key are named', () => {
    const r = swift(
      app(`import { useForm } from '@pyreon/form'`, `  const k = 'email'\n  const f = useForm({ [k]: 1, initialValues: { [k]: 'a', name: 'n' } })`),
    )
    expect(warn(r)).toContain(`useForm \`f\`: config: the computed key \`[k]\` ${DYN}`)
    expect(warn(r)).toContain(`useForm \`f\`: initialValues: the computed key \`[k]\` ${DYN}`)
    // The literal entry still lowers; the computed one is not renamed to "k".
    expect(r.code).toContain('"name"')
    expect(r.code).not.toContain('"k"')
  })

  it('a computed LITERAL key is the static key it spells', () => {
    const r = swift(app(`import { useForm } from '@pyreon/form'`, `  const f = useForm({ initialValues: { ['email']: 'a@b' } })`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"email"')
  })

  it('useParams: `{ [k]: v } = useParams()` is named, not bound to the param "k"', () => {
    const r = swift(
      `import { useParams } from '@pyreon/router'\nimport { Text } from '@pyreon/primitives'\nexport function App(){\n  const k = 'id'\n  const { [k]: v, other } = useParams()\n  return <Text>{other}</Text>\n}`,
    )
    expect(warn(r)).toContain(`\`const { … } = useParams()\`: the computed key \`[k]\` ${DYN}`)
    expect(r.code).not.toContain('"k"')
  })

  it('a general object destructure with a computed key does not alias the key "k"', () => {
    const r = swift(
      `import { signal } from '@pyreon/reactivity'\nimport { Text } from '@pyreon/primitives'\nexport function App(){\n  const k = 'a'\n  const o = signal({ a: 1, k: 2 })\n  const { [k]: v } = o()\n  return <Text>{String(v)}</Text>\n}`,
    )
    expect(r.code).not.toMatch(/__pyDestr\d+\.k\b/)
  })

  it('createRouter: a computed route key bails the table by name', () => {
    const r = swift(
      `import { createRouter } from '@pyreon/router'\nimport { Text } from '@pyreon/primitives'\nfunction Home(){ return <Text>h</Text> }\nconst P = 'path'\nexport function App(){\n  const router = createRouter({ routes: [{ [P]: '/', component: Home }] })\n  return <Text>x</Text>\n}`,
    )
    expect(warn(r)).toContain(`createRouter route: the computed key \`[P]\` ${DYN}`)
  })

  it('@pyreon/validate `.url({ [k]: re })` is named — whether it sets `protocol` is unknown', () => {
    const r = swift(
      `import { s } from '@pyreon/validate'\nimport { Text } from '@pyreon/primitives'\nconst k = 'protocol'\nconst L = s.object({ web: s.string().url({ [k]: /^https$/ }) })\nexport function App() { return <Text>x</Text> }`,
    )
    expect(warn(r)).toContain('the computed key `[k]` in the options cannot be read, so whether it sets `protocol` is unknown')
  })

  it('zod shape: a computed field key is named, never a field called "k"', () => {
    const r = swift(
      `import { zodSchema } from '@pyreon/validation'\nimport { z } from 'zod'\nimport { Text } from '@pyreon/primitives'\nconst k = 'name'\nconst U = zodSchema(z.object({ [k]: z.string(), age: z.number() }))\nexport function App() { return <Text>x</Text> }`,
    )
    expect(warn(r)).toContain(`z.object() shape: the computed key \`[k]\` ${DYN}`)
    expect(r.code).not.toMatch(/\bvar k:|\bk: String/)
  })

  it('an endpoint call with a computed `params` key is named and stays web', () => {
    const r = swift(`import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const ep = api.endpoint('GET /users/:id')
export function S() {
  const key = 'id'
  const u = useFetch<User>(ep({ params: { [key]: '1' } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}`)
    expect(warn(r)).toContain('the `params` key `[key]` is computed')
    expect(r.code).not.toContain('"/api/users/1"')
  })

  it('useFetch init: a computed header key is named', () => {
    const r = swift(
      app(`import { useFetch } from '@pyreon/query'`, `  const h = 'x-a'\n  const q = useFetch<{ ok: boolean }>('https://x', { headers: { [h]: 'b' } })`),
    )
    expect(warn(r)).toContain(`useFetch headers: the computed key \`[h]\` ${DYN}`)
  })

  it('createFlow defaultEdgeOptions: a computed key rejects the object (it used to pass the unhandled-key check)', () => {
    const r = swift(
      app(
        `import { createFlow } from '@pyreon/flow'`,
        `  const k = 'animated'\n  const flow = createFlow({ nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }], edges: [], defaultEdgeOptions: { type: 'step', [k]: true } })`,
      ),
    )
    expect(warn(r)).toContain('defaultEdgeOptions (not a supported literal edge-options object)')
  })

  it('toast() options: a computed key is named', () => {
    const r = swift(
      `import { toast } from '@pyreon/toast'\nimport { Press, Text } from '@pyreon/primitives'\nexport function App(){ const k = 'duration'; return <Press onPress={() => toast('m', { [k]: 5 })}><Text>x</Text></Press> }`,
    )
    expect(warn(r)).toContain(`toast() options: the computed key \`[k]\` ${DYN}`)
  })

  it('a computed TYPE-literal member is named, not a field called "K"', () => {
    const r = swift(
      `import { signal } from '@pyreon/reactivity'\nimport { Text } from '@pyreon/primitives'\nconst K = 'a'\nexport function App(){\n  const o = signal<{ [K]: string; b: number }>({ b: 1 } as never)\n  return <Text>x</Text>\n}`,
    )
    expect(warn(r)).toContain('Computed type-literal members (`{ [K]: … }`)')
    expect(r.code).not.toMatch(/\bvar K\b/)
  })

  it('model() state: a computed field key is named', () => {
    const r = swift(
      `import { model } from '@pyreon/state-tree'\nimport { Text } from '@pyreon/primitives'\nconst k = 'count'\nconst store = model({ state: { [k]: 0, name: 'a' } }).create()\nexport function App(){ return <Text>x</Text> }`,
    )
    expect(warn(r)).toContain(`model declaration \`store\`: state: the computed key \`[k]\` ${DYN}`)
  })
})

// ---------------------------------------------------------------------------
// 3. lowercase helper params are not component props
// ---------------------------------------------------------------------------

describe('a lowercase helper is not warned about as a component', () => {
  const src = (fn: string) =>
    `import { Text } from '@pyreon/primitives'\n${fn}\nexport function App(){ return <Text>{describe('x')}</Text> }`

  it('`function describe(err: Error)` is not called a component — its parameter is named in HELPER terms', () => {
    const w = warn(swift(src('function describe(err: Error): string { return "e" }')))
    expect(w).not.toContain('Component props type `Error`')
    // The unresolvable type still reaches the native signature, so it is named —
    // as the helper parameter it is (union-fat-struct.test.ts relies on this).
    expect(w).toContain('Helper function `describe`: parameter type `Error` can\'t be resolved')
  })

  it('a PascalCase component with the same unresolvable props type still warns', () => {
    const w = warn(
      swift(`import { Text } from '@pyreon/primitives'\nexport function Card(props: Missing) { return <Text>x</Text> }`),
    )
    expect(w).toContain('Component props type `Missing` can\'t be resolved')
  })

  it('a lowercase function that DOES return JSX is a component and still warns', () => {
    const w = warn(
      swift(`import { Text } from '@pyreon/primitives'\nexport function card(props: Missing) { return <Text>x</Text> }`),
    )
    expect(w).toContain('Component props type `Missing` can\'t be resolved')
  })
})

// ---------------------------------------------------------------------------
// 4. toast methods
// ---------------------------------------------------------------------------

describe('a non-preset toast member call is named', () => {
  const handler = (stmts: string) =>
    `import { toast } from '@pyreon/toast'\nimport { Press, Text } from '@pyreon/primitives'\nexport function App(){ return <Press onPress={() => { ${stmts} }}><Text>x</Text></Press> }`

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: \`toast.bogus("q")\` is not a @pyreon/toast method — named, never verbatim`, () => {
      const r = transform(handler('toast.bogus("q")'), { target })
      expect(warn(r)).toContain('`toast.bogus(…)` is not supported in native (PMTC) — @pyreon/toast has no such method')
      expect(r.code).not.toContain('toast.bogus')
    })
  }

  it('a real-but-unlowered method (`toast.dismiss`) gets the follow-up wording', () => {
    const r = swift(handler('toast.dismiss("q")'))
    expect(warn(r)).toContain('`toast.dismiss` has no native lowering yet')
    expect(r.code).not.toContain('toast.dismiss')
  })

  it('the presets still lower with no warning', () => {
    const r = swift(handler('toast.success("ok")'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonToast.shared.add("ok", type: "success")')
  })
})

// ---------------------------------------------------------------------------
// 5. SizedMap
// ---------------------------------------------------------------------------

describe('SizedMap with a non-literal maxEntries warns once', () => {
  it('one named warning, not a second generic "class construction" one', () => {
    const r = swift(
      `import { SizedMap } from '@pyreon/sized-map'\nimport { Text } from '@pyreon/primitives'\nconst N = Math.random()\nexport function App(){ const m = new SizedMap<string, number>({ maxEntries: N }); return <Text>x</Text> }`,
    )
    const hits = r.warnings.filter((w) => w.includes('SizedMap'))
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain('lowers only with a LITERAL `{ maxEntries: N }`')
  })

  it('a computed `[maxEntries]` key is not read as the literal option', () => {
    const r = swift(
      `import { SizedMap } from '@pyreon/sized-map'\nimport { Text } from '@pyreon/primitives'\nconst maxEntries = 'lru'\nexport function App(){ const m = new SizedMap<string, number>({ [maxEntries]: 5 }); return <Text>x</Text> }`,
    )
    expect(warn(r)).toContain('lowers only with a LITERAL `{ maxEntries: N }`')
  })
})

// ---------------------------------------------------------------------------
// 6. useUrlState default wording
// ---------------------------------------------------------------------------

describe('useUrlState rejection names the real reason', () => {
  const u = (def: string) =>
    warn(swift(app(`import { useUrlState } from '@pyreon/url-state'`, `  const p = useUrlState('k', ${def})`)))

  it('`1e999` (Infinity) is a non-finite number, not "an array or object"', () => {
    const w = u('1e999')
    expect(w).toContain('NON-FINITE number')
    expect(w).not.toContain('array or object default')
  })

  it('`-Infinity` / `NaN` get the same non-finite reason', () => {
    expect(u('-Infinity')).toContain('NON-FINITE number')
    expect(u('NaN')).toContain('NON-FINITE number')
  })

  it('an array default keeps the collection wording; a variable gets "not a literal"', () => {
    expect(u("['a']")).toContain('an array or object default')
    expect(u('someVar')).toContain('this default is not a literal')
  })
})

// ---------------------------------------------------------------------------
// 7. createFlow heterogeneous data rows — compile checks
// ---------------------------------------------------------------------------

const flowSrc = (rows: string[]) => `import { createFlow } from '@pyreon/flow'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const flow = createFlow({ nodes: [${rows
    .map((data, i) => `{ id: '${i}', position: { x: 0, y: 0 }, data: ${data} }`)
    .join(', ')}], edges: [] })
  return (<Stack><Text>{() => String(flow.nodes().length)}</Text></Stack>)
}`

describe('createFlow data rows unify by field names AND types', () => {
  // Int + Double merge to Double; a null value or an omitted field is optional.
  const MERGEABLE = flowSrc([`{ label: 'A', w: 1 }`, `{ label: 'B', w: 2.5, p: null }`, `{ label: 'C', w: 3, p: 'x' }`])

  it('Int/Double merge to Double, a null value is optional, and every row uses ONE struct', () => {
    const s = swift(MERGEABLE)
    expect(s.warnings).toEqual([])
    const row = /PyreonFlowState<(\w+)>/.exec(s.code)?.[1]
    expect([...s.code.matchAll(/data: (__Obj\d+)\(/g)].every((m) => m[1] === row)).toBe(true)
    expect(s.code).toContain('var w: Double')
    expect(s.code).toContain('var p: String? = nil')
    const k = kotlin(MERGEABLE)
    expect(k.warnings).toEqual([])
    expect(k.code).toContain('var w: Double, var p: String? = null')
  })

  it('the SAME field set with Int vs Double / null vs String shares ONE struct (a type-only difference)', () => {
    const s = swift(flowSrc([`{ w: 1, p: null }`, `{ w: 2.5, p: 'x' }`]))
    expect(s.warnings).toEqual([])
    const row = /PyreonFlowState<(\w+)>/.exec(s.code)?.[1]
    const used = [...s.code.matchAll(/data: (__Obj\d+)\(/g)].map((m) => m[1])
    expect(used).toEqual([row, row])
    expect(s.code).toContain('var w: Double')
    expect(s.code).toContain('var p: String? = nil')
  })

  it('a field with no common Codable type is NAMED on both targets', () => {
    const src = flowSrc([`{ label: 'A', w: 1 }`, `{ label: 'B', w: 'wide' }`])
    for (const r of [swift(src), kotlin(src)]) {
      expect(warn(r)).toContain('createFlow `flow`: node `data` field(s) `w`')
      expect(warn(r)).toContain('have no single native type across the nodes')
    }
  })

  it.skipIf(!isSwiftcAvailable())('swiftc: the unified row struct compiles', () => {
    const res = validateSwiftWithStubs(swift(MERGEABLE).code)
    expect(res.ok, res.error).toBe(true)
  }, 120_000)

  it.skipIf(!isKotlincAvailable())('kotlinc: the unified row data class compiles', () => {
    const res = validateKotlin(kotlin(MERGEABLE).code)
    expect(res.ok, res.error).toBe(true)
  }, 240_000)
})
