// `const { store } = useApp()` failed both targets with zero warnings.
//
// `defineStore` returns `() => StoreApi<T>` and `store` is a real property on
// that api, so destructuring it is ordinary, valid web code. On native it
// lowered to nothing: the destructured name emitted unbound and both builds
// failed with `cannot find 'store' in scope`.
//
// The identifier-alias lowering (`const app = useApp()` → alias `app` →
// `useApp`) only fires for an Identifier binding; an ObjectPattern falls
// straight through.
//
// Warned rather than lowered. The alias map is identifier → hook name, and a
// destructured `store` aliases `useApp().store` — a member PATH, not a call —
// so supporting it means threading a second alias kind through parseExpr. The
// three other shapes all work, so naming them costs the author one line.
//
// Worth recording how this was found: the FIRST two probes of this surface
// were my own errors, not defects. `const s = useApp(); s.n()` and
// `useApp().n()` both fail on web too (they skip `.store`), and an earlier
// probe used a non-shorthand `return { n, inc: () => … }`, which the compiler
// correctly warns about. Only after checking `defineStore`'s actual return type
// did a real gap show up. A probe that fails is a hypothesis, not a finding.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (body: string) =>
  `import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
const useCounter = defineStore('counter', () => {
  const n = signal(0)
  const inc = () => n.set(n() + 1)
  return { n, inc }
})
export function C(){ ${body} }`

const DESTRUCTURED = app(
  'const { store } = useCounter(); return (<Stack><Text>{store.n}</Text></Stack>)',
)

/** Every shape that IS valid web code AND lowers. */
const WORKING: ReadonlyArray<readonly [string, string]> = [
  ['inline', 'return (<Stack><Text>{useCounter().store.n}</Text></Stack>)'],
  ['bound api', 'const api = useCounter(); return (<Stack><Text>{api.store.n}</Text></Stack>)'],
  [
    'bound api + action',
    'const api = useCounter(); return (<Stack><Text>{api.store.n}</Text><Button onPress={() => api.store.inc()}>+</Button></Stack>)',
  ],
]

const warns = (src: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(src, { target }).warnings ?? []

describe('destructuring a store api', () => {
  it('warns, naming the hook', () => {
    const hit = warns(DESTRUCTURED).find((w) => w.includes('Destructuring a store api'))
    expect(hit, `no warning; got ${JSON.stringify(warns(DESTRUCTURED))}`).toBeTruthy()
    expect(hit).toContain('useCounter()')
  })

  it('quotes the error the author would otherwise hit', () => {
    expect(warns(DESTRUCTURED).some((w) => w.includes(`cannot find 'store' in scope`))).toBe(true)
  })

  it('names the WORKING shapes, not just the broken one', () => {
    const w = warns(DESTRUCTURED)
    expect(w.some((x) => x.includes('const api = useCounter(); api.store.x'))).toBe(true)
    expect(w.some((x) => x.includes('useCounter().store.x'))).toBe(true)
  })

  it('warns on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(
        warns(DESTRUCTURED, target).some((w) => w.includes('Destructuring a store api')),
        target,
      ).toBe(true)
    }
  })

  for (const [label, body] of WORKING) {
    it(`does NOT warn for the ${label} shape`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(warns(app(body), target), `${label}/${target}`).toEqual([])
      }
    })
  }

  // The measurements the warning is derived from. If the destructured form ever
  // starts lowering, these fail and the warning should go rather than outlive
  // the defect.
  for (const [label, body] of WORKING) {
    it.skipIf(!isSwiftcAvailable())(`${label}: really does type-check on Swift`, () => {
      const res = validateSwiftWithStubs(transform(app(body), { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${label}: really does type-check on Kotlin`, () => {
      const res = validateKotlin(transform(app(body), { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }

  it.skipIf(!isSwiftcAvailable())('the destructured form really does NOT — the warning is earned', () => {
    const res = validateSwiftWithStubs(transform(DESTRUCTURED, { target: 'swift' }).code)
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toContain('store')
  })
})
