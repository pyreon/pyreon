// The early-exit narrowing guard in EVERY statement list, and the integer
// literals that sit beside a nullable Double (#3956).
//
// TypeScript narrows a value after `if (v === null) return/continue/break`.
// Swift never narrows through a nil test, so the emit lowers that shape to
// `guard let v else { … }` and the rest of the list reads the unwrapped
// binding (Kotlin: a smart cast for a stable local, `val x = a.b ?: run { … }`
// for a mutable field). That lowering ran only where a statement list went
// through the guard-aware emitter — a function / handler body and an `if`
// branch. A LOOP body, a `switch` case, an onMount body and a closure body
// emitted statement by statement, so the same line of shared source compiled
// in a function body and failed inside `for … of` — and a local declared inside
// a nested list was never typed, so even a routed list could not see that it
// was optional.
//
// Two neighbours of #3956 items 2/4 found while probing: an integer literal
// passed to a `Double | null` parameter emitted `1L`, and an integer literal
// compared against a `Double`-aliased value emitted `x == 0L` — both kotlinc
// type errors.
//
// Bisect-load-bearing: routing the loop / switch bodies back to the
// statement-by-statement emit fails the guard specs and the swiftc compiles
// ("value of optional type 'Double?' must be unwrapped"); reverting the
// optional unwrap in `contextual-double-literals.ts` / `isDoubleOperand`
// fails the literal specs and the kotlinc compiles.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const HEAD = `import { Stack, Text } from '@pyreon/primitives'
import { useGeolocation } from '@pyreon/hooks'
type Double = number
type Book = { title: string; tags?: string[] | undefined }
function half(v: Double): Double { return v / 2 }
`
const swift = (body: string) => transform(HEAD + body, { target: 'swift' })
const kotlin = (body: string) => transform(HEAD + body, { target: 'kotlin' })

const app = (expr: string) =>
  `export function App() { return <Stack><Text>{${expr}}</Text></Stack> }`

// The shape #3956 item 3 reported: a const local of an optional type, an
// early return, then a read that needs the unwrapped value.
const ISSUE = `export function App() {
  const geo = useGeolocation()
  const label = () => { const lat = geo.latitude; if (lat === null) return ''; return \`\${half(lat)}\` }
  return <Stack><Text>{label()}</Text></Stack>
}`

const FOR_OF = `function sum(xs: (Double | null)[]): Double {
  let t = 0.5
  for (const x of xs) { const v = x; if (v === null) continue; t += half(v) }
  return t
}
${app('sum([1, null, 3])')}`

const WHILE = `function sum(xs: (Double | null)[]): Double {
  let i = 0
  let t = 0.5
  while (i < xs.length) { const v = xs[i]; i++; if (v == null) continue; t += half(v) }
  return t
}
${app('sum([1])')}`

const SWITCH = `function fmt(k: string, x: Double | null): string {
  switch (k) {
    case 'a': { const v = x; if (v === null) return ''; return \`\${half(v)}\` }
    default: return 'd'
  }
}
${app("fmt('a', 1)")}`

const MEMBER_LOOP = `function count(bs: Book[]): number {
  let n = 0
  for (const b of bs) { if (b.tags === undefined) continue; n += b.tags.length }
  return n
}
${app('count([])')}`

const OPTIONAL_PARAM = `function fmt(x: Double | null): string { if (x === null) return ''; return \`\${half(x)}\` }
${app('fmt(1)')}`

const ALIAS_COMPARE = `function zero(x: Double): string { const lat = x; if (lat === 0) return 'z'; return 'n' }
${app('zero(1)')}`

describe('#3956 item 3 — the reported shape', () => {
  it('Swift: guard let over the const local', () => {
    const out = swift(ISSUE).code
    expect(out).toContain('let lat = geo.latitude')
    expect(out).toMatch(/guard let lat else \{\s*return ""\s*\}/)
    expect(out).toContain('half(lat)')
    expect(out).not.toContain('if lat == nil')
  })
  it('Kotlin: unchanged — a val local smart-casts', () => {
    const out = kotlin(ISSUE).code
    expect(out).toContain('if (lat == null)')
    expect(out).not.toContain('?: run')
  })
})

describe('the guard reaches every statement list', () => {
  it('a for-of body', () => {
    expect(swift(FOR_OF).code).toMatch(
      /for x in xs \{\s*let v = x\s*guard let v else \{\s*continue\s*\}\s*t \+= half\(v\)/,
    )
  })
  it('a while body', () => {
    expect(swift(WHILE).code).toMatch(/guard let v else \{\s*continue\s*\}/)
  })
  it('a switch case', () => {
    expect(swift(SWITCH).code).toMatch(/guard let v else \{\s*return ""\s*\}/)
  })
  it('a member subject inside a loop, on both targets', () => {
    expect(swift(MEMBER_LOOP).code).toMatch(
      /guard let tags = b\.tags else \{\s*continue\s*\}\s*n \+= tags\.count/,
    )
    // A data-class `var` field does not smart-cast, so Kotlin binds it too.
    expect(kotlin(MEMBER_LOOP).code).toMatch(/val tags = b\.tags \?: run \{\s*continue\s*\}/)
  })
})

describe('no guard where it would be wrong', () => {
  it('a local written in a closure after the check', () => {
    const out = swift(`function fmt(x: Double | null): string {
  let lat = x
  if (lat === null) return ''
  const reset = () => { lat = null }
  return \`\${lat}\${reset}\`
}
${app('fmt(1)')}`).code
    expect(out).not.toContain('guard let')
  })
  it('a local reassigned directly after the check', () => {
    const out = swift(`function fmt(x: Double | null, y: Double | null): Double {
  let lat = x
  if (lat === null) return 0
  lat = y
  return lat ?? 0
}
${app('fmt(1, 2)')}`).code
    expect(out).not.toContain('guard let')
  })
  it('a non-optional binding', () => {
    const out = swift(ALIAS_COMPARE).code
    expect(out).not.toContain('guard let')
    expect(out).toContain('if lat == 0')
  })
  it('a null check whose body does not exit', () => {
    const out = swift(`function fmt(x: Double | null): string {
  const lat = x
  let s = ''
  if (lat === null) { s = 'none' }
  return s + \`\${lat ?? 0}\`
}
${app('fmt(1)')}`).code
    expect(out).not.toContain('guard let')
  })
})

describe('integer literals beside a nullable / aliased Double (Kotlin)', () => {
  it('an argument to a `Double | null` parameter is a Double literal', () => {
    expect(kotlin(OPTIONAL_PARAM).code).toContain('fmt(1.0)')
    expect(kotlin(FOR_OF).code).toContain('sum(listOf(1.0, null, 3.0))')
  })
  it('a comparison against a `Double`-aliased local is a Double literal', () => {
    expect(kotlin(ALIAS_COMPARE).code).toContain('if (lat == 0.0)')
  })
})

const ALL = { ISSUE, FOR_OF, WHILE, SWITCH, MEMBER_LOOP, OPTIONAL_PARAM, ALIAS_COMPARE }

describe('the emit compiles', () => {
  for (const [name, src] of Object.entries(ALL)) {
    it.skipIf(!isSwiftcAvailable())(`Swift: ${name}`, () => {
      const r = validateSwiftWithStubs(swift(src).code)
      expect(r.error ?? '').toBe('')
      expect(r.ok).toBe(true)
    })
    it.skipIf(!isKotlincAvailable())(`Kotlin: ${name}`, () => {
      const r = validateKotlin(kotlin(src).code)
      expect(r.error ?? '').toBe('')
      expect(r.ok).toBe(true)
    })
  }
})
