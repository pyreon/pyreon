// `x === undefined ? fb : x` narrows in TS and not in Swift — the straight
// emit fails "must be unwrapped". The idiom IS nil-coalescing on both
// targets, so the ternary rewrites to `(x ?? fb)` / `(x ?: fb)` when the
// surviving branch is STRUCTURALLY the checked expression and the checked
// expression is provably optional. One shared pattern definition
// (`nilCoalesceTernary` in infer-type.ts) claims the same ternaries on both
// backends.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SHAPES = `
  type Cfg = { progress?: Double; label?: string }
  function clampProgress(cfg: Cfg): Double {
    const raw = cfg.progress
    const p = raw === undefined ? 1.0 : raw
    return p
  }
  function nameOf(cfg: Cfg): string {
    const l = cfg.label
    return l !== undefined ? l : 'unnamed'
  }
  export function P() {
    const c: Cfg = { progress: 0.5 }
    return <Text>{nameOf(c) + String(clampProgress(c))}</Text>
  }
`

const swift = transform(SHAPES, { target: 'swift' }).code
const kotlin = transform(SHAPES, { target: 'kotlin' }).code

describe('optional-narrowing ternary → nil-coalescing', () => {
  it('rewrites the == form: absent-check picks the fallback', () => {
    expect(swift).toContain('let p = (raw ?? 1.0)')
    expect(kotlin).toContain('val p = (raw ?: 1.0)')
  })

  it('rewrites the != form: present-check keeps the value', () => {
    expect(swift).toContain('(l ?? "unnamed")')
    expect(kotlin).toContain('(l ?: "unnamed")')
  })

  it('does NOT claim a ternary whose survivor is not the checked expression', () => {
    const src = `
      type Cfg = { progress?: Double }
      function f(cfg: Cfg): Double {
        const raw = cfg.progress
        return raw === undefined ? 1.0 : raw * 2.0
      }
      export function P() { return <Text>{String(f({ progress: 1.0 }))}</Text> }
    `
    // `raw * 2.0` is not `raw` — a coalesce would change the meaning.
    expect(transform(src, { target: 'swift' }).code).not.toContain('??')
  })

  it('skips a PROVABLY non-optional — a known local type says the branch is dead', () => {
    const src = `
      function f(): Double {
        const n = 2.0
        return n === undefined ? 1.0 : n
      }
      export function P() { return <Text>{String(f())}</Text> }
    `
    // Inference KNOWS `n` is Double here (locals carry initializer types), so
    // the coalesce — which would only draw a compiler warning — is skipped.
    expect(transform(src, { target: 'swift' }).code).not.toContain('(n ?? 1.0)')
  })

  it('an UNKNOWN-typed check still rewrites — the asymmetry decides the default', () => {
    // Inference through a typed PARAM is unknown at the emit site today. The
    // rewrite is value-preserving either way (on a non-optional the absent
    // branch is dead and `x ?? fb` is x), and the failure modes are not
    // symmetric: coalescing a non-optional is a WARNING on both targets,
    // while a missing unwrap is a hard ERROR.
    const src = `
      function f(n: Double): Double {
        return n === undefined ? 1.0 : n
      }
      export function P() { return <Text>{String(f(2.0))}</Text> }
    `
    expect(transform(src, { target: 'swift' }).code).toContain('(n ?? 1.0)')
  })

  it('matches the null-literal on either side', () => {
    const src = `
      type Cfg = { label?: string }
      function f(cfg: Cfg): string {
        const l = cfg.label
        return undefined === l ? 'x' : l
      }
      export function P() { return <Text>{f({})}</Text> }
    `
    expect(transform(src, { target: 'swift' }).code).toContain("(l ?? \"x\")")
  })

  it.runIf(isSwiftUIAvailable())('the emitted Swift type-checks', () => {
    const r = validateSwiftWithStubs(swift)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })

  it.runIf(isKotlincAvailable())('the emitted Kotlin compiles', async () => {
    const r = await validateKotlin(kotlin)
    expect(r.ok ? [] : [r.error]).toEqual([])
  })
})
