// Branch matrices for the Swift NUMERIC-INTRINSIC emit arms: the `Math.*`
// lowering table, `Number.isInteger`, `isNaN`, and `Boolean(x)`.
//
// Every one of these exists because the JS global has NO native analog —
// `Math`, `Number` and `Boolean` are all "cannot find … in scope" on Swift —
// so the emit either rewrites the call or leaves a raw one that swiftc names
// loudly. The sharp edge is the ARITY guard on each table entry: a call whose
// argument count does not match falls THROUGH to the generic member emit,
// producing the raw `Math.x(…)`. Each entry is therefore asserted in both
// directions, because a silently-wrong arithmetic lowering is not a compile
// error at all.
//
// The second axis is the argument's INFERRED type. `Number.isInteger`,
// `isNaN` and `Boolean` all choose a DIFFERENT Swift spelling per type, and
// an unresolvable type must produce a NAMED warning rather than a silent
// wrong answer — so the unknown arm is asserted on the warning text.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/** Emit a component whose computeds are the expressions under test. */
function sw(decls: string, params = ''): { code: string; warnings: string[] } {
  const r = transform(
    `import { Stack, Text } from '@pyreon/primitives'
import { computed, signal } from '@pyreon/reactivity'
export function App(${params}) {
  const n = signal<number>(3)
  const d = signal<number>(1.5)
  const s = signal<string>('')
  const b = signal<boolean>(false)
  const optN = signal<number | undefined>(undefined)
  const optS = signal<string | undefined>(undefined)
  const optB = signal<boolean | undefined>(undefined)
  const nums = signal<number[]>([1, 2])
${decls}
  return (<Stack><Text>hi</Text></Stack>)
}`,
    { target: 'swift' },
  )
  return { code: r.code, warnings: [...r.warnings] }
}

/** The body of `private var <name>: T { … }` in the emitted component. */
function body(code: string, name: string): string {
  const m = code.match(new RegExp(`private var ${name}: [^{]+\\{ (.*) \\}`))
  if (m === null) throw new Error(`no computed \`${name}\` in:\n${code}`)
  return m[1]!
}

describe('Math.* — the lowering table, one arm per entry', () => {
  it('rewrites each table entry at its declared arity', () => {
    const { code } = sw(`  const a = computed(() => Math.round(n()))
  const b2 = computed(() => Math.floor(d()))
  const c = computed(() => Math.ceil(d()))
  const e = computed(() => Math.trunc(d()))
  const f = computed(() => Math.abs(n()))
  const g = computed(() => Math.sqrt(d()))
  const h = computed(() => Math.min(n(), 2))
  const i = computed(() => Math.max(n(), 2))
  const j = computed(() => Math.pow(n(), 2))`)
    // `Math.round` is floor(x + 0.5) — NOT `.rounded()`, whose default rule
    // disagrees with JS on every negative half.
    expect(body(code, 'a')).toBe('((Double(n)) + 0.5).rounded(.down)')
    // Double-domain Foundation free functions: the arg is coerced, the
    // result stays Double (an `Int(…)` wrap poisons downstream mixed math).
    expect(body(code, 'b2')).toBe('floor(Double(d))')
    expect(body(code, 'c')).toBe('ceil(Double(d))')
    expect(body(code, 'e')).toBe('trunc(Double(d))')
    expect(body(code, 'g')).toBe('sqrt(Double(d))')
    expect(body(code, 'j')).toBe('pow(Double(n), Double(2))')
    // GENERIC over SignedNumeric/Comparable — NOT coerced, so an Int stays Int.
    expect(body(code, 'f')).toBe('abs(n)')
    expect(body(code, 'h')).toBe('min(n, 2)')
    expect(body(code, 'i')).toBe('max(n, 2)')
    expect(code).toContain('private var f: Int')
    expect(code).toContain('private var h: Int')
  })

  it('ARITY MISMATCH on every entry falls through to the raw member emit', () => {
    // The neighbouring shape for each arm above: the table entry matches by
    // NAME, the arity guard rejects, and the generic emit produces the raw
    // `Math.x(…)` that swiftc names ("cannot find 'Math' in scope").
    const { code } = sw(`  const a = computed(() => Math.round(n(), 2))
  const b2 = computed(() => Math.floor(n(), 2))
  const c = computed(() => Math.ceil(n(), 2))
  const e = computed(() => Math.trunc(n(), 2))
  const f = computed(() => Math.abs(n(), 2))
  const g = computed(() => Math.sqrt(n(), 2))
  const h = computed(() => Math.min(n()))
  const i = computed(() => Math.max(n()))
  const j = computed(() => Math.pow(n()))`)
    expect(body(code, 'a')).toBe('Math.round(n, 2)')
    expect(body(code, 'b2')).toBe('Math.floor(n, 2)')
    expect(body(code, 'c')).toBe('Math.ceil(n, 2)')
    expect(body(code, 'e')).toBe('Math.trunc(n, 2)')
    expect(body(code, 'f')).toBe('Math.abs(n, 2)')
    expect(body(code, 'g')).toBe('Math.sqrt(n, 2)')
    expect(body(code, 'j')).toBe('Math.pow(n)')
    // `min`/`max` are VARIADIC in ECMAScript, so a 1-arg call is not an arity
    // mismatch at all — `Math.min(n)` IS `n`. They used to fall through here
    // to the same uncompilable `Math.min(n)`; the totality lowering folds
    // them instead (see `native-math-totality.test.ts`). The invariant this
    // spec protects — a NAME-matched entry whose arity the TABLE rejects is
    // not rewritten BY THE TABLE — is unchanged and still asserted above.
    expect(body(code, 'h')).toBe('n')
    expect(body(code, 'i')).toBe('n')
  })

  it('SWIFT_MATH_DOUBLE table: matched arity coerces every arg; wrong arity and an unknown name do not', () => {
    const { code } = sw(`  const k = computed(() => Math.hypot(1, 2))
  const l = computed(() => Math.sin(1))
  const m = computed(() => Math.atan2(1, 2))
  const p = computed(() => Math.log10(10))
  const q = computed(() => Math.cbrt(1, 2))
  const r = computed(() => Math.hypot(1))
  const t = computed(() => Math.nope(1))`)
    expect(body(code, 'k')).toBe('hypot(Double(1), Double(2))')
    expect(body(code, 'l')).toBe('sin(Double(1))')
    expect(body(code, 'm')).toBe('atan2(Double(1), Double(2))')
    expect(body(code, 'p')).toBe('log10(Double(10))')
    // arity ≠ table arity → NOT rewritten (both directions of the guard)
    expect(body(code, 'q')).toBe('Math.cbrt(1, 2)')
    // `hypot` is variadic in ECMAScript; `Math.hypot(1)` is `abs(1)`, so the
    // totality lowering claims it rather than leaving the raw member emit.
    expect(body(code, 'r')).toBe('abs(Double(1))')
    // a name absent from the table → never rewritten
    expect(body(code, 't')).toBe('Math.nope(1)')
  })

  it('Math.max/min over a SPREAD picks the sentinel by element floatness', () => {
    // The JS empty-array sentinel (`Math.max() === -Infinity`) has no Int
    // analog, so an Int array uses Int.min/Int.max and a Double array the
    // real infinities — the two arms of the `isFloat` ternary.
    const { code } = sw(`  const ints = signal<number[]>([1])
  const dbls = signal<number[]>([1.5])
  const a = computed(() => Math.max(...ints()))
  const b2 = computed(() => Math.min(...ints()))
  const c = computed(() => Math.max(...dbls()))
  const e = computed(() => Math.min(...dbls()))`)
    expect(body(code, 'a')).toBe('(ints.max() ?? Int.min)')
    expect(body(code, 'b2')).toBe('(ints.min() ?? Int.max)')
    expect(body(code, 'c')).toBe('(dbls.max() ?? -Double.infinity)')
    expect(body(code, 'e')).toBe('(dbls.min() ?? Double.infinity)')
  })
})

describe('Number.isInteger — one arm per inferred numeric type', () => {
  it('Int → statically `true`; Double → the remainder check', () => {
    const { code, warnings } = sw(`  const a = computed(() => Number.isInteger(n()))
  const b2 = computed(() => Number.isInteger(d()))`)
    expect(body(code, 'a')).toBe('true')
    expect(body(code, 'b2')).toBe('((d).truncatingRemainder(dividingBy: 1) == 0)')
    expect(warnings.filter((w) => w.includes('isInteger'))).toEqual([])
  })

  it('a `Double`-typeRef arg normalizes to the FLOAT number arm', () => {
    // The typeRef→number normalization: a param annotated `Double` is not a
    // `{kind:'number'}` TypeIR, so without it the call fell to the warning.
    const { code, warnings } = sw(
      `  const a = computed(() => Number.isInteger(props.dd))`,
      'props: { dd: Double }',
    )
    expect(body(code, 'a')).toBe('((dd).truncatingRemainder(dividingBy: 1) == 0)')
    expect(warnings.filter((w) => w.includes('isInteger'))).toEqual([])
  })

  it('an UNRESOLVABLE type keeps the raw call AND names it', () => {
    const { code, warnings } = sw(
      `  const a = computed(() => Number.isInteger(props.anyv))`,
      'props: { anyv: unknown }',
    )
    expect(body(code, 'a')).toBe('Number.isInteger(anyv)')
    expect(warnings.some((w) => w.startsWith('Number.isInteger(anyv):'))).toBe(true)
  })
})

describe('isNaN — one arm per inferred numeric type', () => {
  it('Int → statically `false`; Double → `.isNaN`', () => {
    const { code, warnings } = sw(`  const a = computed(() => isNaN(n()))
  const b2 = computed(() => isNaN(d()))`)
    expect(body(code, 'a')).toBe('false')
    expect(body(code, 'b2')).toBe('(d).isNaN')
    expect(warnings.filter((w) => w.includes('isNaN'))).toEqual([])
  })

  it('a `Float`-typeRef arg normalizes to the FLOAT arm', () => {
    const { code } = sw(
      `  const a = computed(() => isNaN(props.ff))`,
      'props: { ff: Float }',
    )
    expect(body(code, 'a')).toBe('(ff).isNaN')
  })

  it('an UNRESOLVABLE type keeps the raw call AND names it', () => {
    const { code, warnings } = sw(
      `  const a = computed(() => isNaN(props.anyv))`,
      'props: { anyv: unknown }',
    )
    expect(body(code, 'a')).toBe('isNaN(anyv)')
    expect(warnings.some((w) => w.startsWith('isNaN(anyv):'))).toBe(true)
  })
})

describe('Boolean(x) — JS truthiness as a VALUE, one arm per type', () => {
  it('bool identity / number != 0 / string non-empty', () => {
    const { code } = sw(`  const a = computed(() => Boolean(b()))
  const c = computed(() => Boolean(n()))
  const e = computed(() => Boolean(s()))`)
    expect(body(code, 'a')).toBe('b')
    expect(body(code, 'c')).toBe('(n != 0)')
    expect(body(code, 'e')).toBe('!(s).isEmpty')
  })

  it('OPTIONAL number/string check the INNER value; any other optional checks presence', () => {
    // JS `Boolean(undefined) === Boolean(0) === false`, so an optional
    // number must not collapse to a mere nil check.
    const { code } = sw(`  const a = computed(() => Boolean(optN()))
  const c = computed(() => Boolean(optS()))
  const e = computed(() => Boolean(optB()))`)
    expect(body(code, 'a')).toBe('((optN ?? 0) != 0)')
    expect(body(code, 'c')).toBe('!((optS ?? "").isEmpty)')
    expect(body(code, 'e')).toBe('(optB != nil)')
  })

  it('an UNRESOLVABLE type keeps the raw call AND names it', () => {
    const { code, warnings } = sw(
      `  const a = computed(() => Boolean(props.anyv))`,
      'props: { anyv: unknown }',
    )
    expect(body(code, 'a')).toBe('Boolean(anyv)')
    expect(warnings.some((w) => w.startsWith('Boolean(anyv):'))).toBe(true)
  })
})
