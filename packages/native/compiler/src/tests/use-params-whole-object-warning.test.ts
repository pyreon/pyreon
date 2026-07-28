// `const p = useParams()` then `p.id` failed on both targets, silently.
//
// The hook lowers to a native dictionary (`[String: String]`) / map, so the
// natural JS follow-up emits `p.id` — which is not how either is read. Both
// targets failed to type-check and nothing warned.
//
// The destructured form has always worked:
//
//   const { id } = useParams()
//   →  private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }
//
// per key, with the Optional handled. It is also what the device-proven
// router-demo effectively uses (via `props.params.id`), which is why the
// matrix records `useParams` at R5 while this shape was broken: the gap was in
// a form no example exercised.
//
// Warn rather than rewrite `.id` → `["id"]`: member access is emitted from
// everywhere in this compiler, and narrowing a codegen rewrite to exactly this
// binding is a change that wants a reliably-green full suite to land safely.
// The destructure is already the supported, idiomatic shape.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (decl: string, use: string) => `import { useParams } from '@pyreon/router'
import { Stack, Text } from '@pyreon/primitives'
export function C(){ ${decl}; return (<Stack><Text>{${use}}</Text></Stack>) }`

const WHOLE = app('const p = useParams()', 'p.id')
const DESTRUCTURED = app('const { id } = useParams()', 'id')

const warns = (src: string, target: 'swift' | 'kotlin' = 'swift') =>
  transform(src, { target }).warnings ?? []

describe('useParams whole-object form', () => {
  it('warns, naming the binding', () => {
    const hit = warns(WHOLE).find((w) => w.includes('useParams()'))
    expect(hit, `no warning; got ${JSON.stringify(warns(WHOLE))}`).toBeTruthy()
    expect(hit).toContain('p.id')
  })

  it('names the WORKING form, not just the broken one', () => {
    expect(warns(WHOLE).some((w) => w.includes('const { id } = useParams()'))).toBe(true)
  })

  it('warns on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warns(WHOLE, target).some((w) => w.includes('useParams()')), target).toBe(true)
    }
  })

  it('does NOT warn for the destructured form', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warns(DESTRUCTURED, target), target).toEqual([])
    }
  })

  // The measurements the warning is derived from. If the whole-object form ever
  // starts compiling, this fails and the warning should go.
  it.skipIf(!isSwiftcAvailable())('the destructured form type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(DESTRUCTURED, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the destructured form type-checks on Kotlin', () => {
    const res = validateKotlin(transform(DESTRUCTURED, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('the whole-object form really does NOT — the warning is earned', () => {
    expect(validateSwiftWithStubs(transform(WHOLE, { target: 'swift' }).code).ok).toBe(false)
  })
})
