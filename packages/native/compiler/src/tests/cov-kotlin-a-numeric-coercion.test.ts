// Coverage: the Kotlin backend's numeric / truthiness coercions
// (emit-kotlin.ts ~4195-4470 + the `unary` case ~5641).
//
// Every one of these exists because the VERBATIM emit was valid-looking
// and wrong: `Math.sqrt(intArg)` is a java.lang.Math type mismatch,
// `Number`/`isNaN`/`Boolean`/`Date` are unresolved references, and a JS
// `!x` on a non-Boolean is an argument-type mismatch. So each spec asserts
// the idiom AND the neighbouring type that must take the other arm —
// Int vs Double is the discriminator throughout, and getting it backwards
// is a compile error rather than a cosmetic difference.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = (body: string) => `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const xs = signal<number[]>([1, 2, 3])
  const ds = signal<number[]>([1.5, 2.5])
  const name = signal<string>('hello')
  const n = signal<number>(3)
  const dn = signal<number>(1.5)
  const flag = signal<boolean>(true)
  const opt = signal<string | null>(null)
  const optn = signal<number | null>(null)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

const kt = (body: string) => transform(SRC(body), { target: 'kotlin' })

describe('Kotlin expr: Math lowerings', () => {
  it('Double-domain fns coerce every arg .toDouble() (java.lang.Math does not widen Int)', () => {
    const out = kt(`  const a = computed(() => Math.sqrt(n()))
  const b = computed(() => Math.pow(n(), 2))`).code
    expect(out).toContain('Math.sqrt((n).toDouble())')
    expect(out).toContain('Math.pow((n).toDouble(), (2).toDouble())')
  })

  it('sign/trunc/log2 remap to kotlin.math (they are not on java.lang.Math at all)', () => {
    const out = kt(`  const a = computed(() => Math.sign(dn()))
  const b = computed(() => Math.trunc(dn()))
  const c = computed(() => Math.log2(dn()))`).code
    expect(out).toContain('kotlin.math.sign((dn).toDouble())')
    expect(out).toContain('kotlin.math.truncate((dn).toDouble())')
    expect(out).toContain('kotlin.math.log2((dn).toDouble())')
  })

  it('max/min with MIXED Int+Double coerces the Int side; a same-kind pair is left alone', () => {
    const mixed = kt(`  const a = computed(() => Math.max(2, Math.ceil(dn())))`).code
    expect(mixed).toContain('Math.max((2).toDouble(), Math.ceil(dn))')
    // both Int → no coercion (the generic emit already validates)
    const same = kt(`  const a = computed(() => Math.max(2, 3))`).code
    expect(same).toContain('Math.max(2, 3)')
  })

  it('max/min SPREAD picks the sentinel from the element type (Int.MIN_VALUE vs -Infinity)', () => {
    const out = kt(`  const a = computed(() => Math.max(...xs()))
  const b = computed(() => Math.min(...xs()))
  const c = computed(() => Math.max(...ds()))
  const d = computed(() => Math.min(...ds()))`).code
    expect(out).toContain('(xs.maxOrNull() ?: Int.MIN_VALUE)')
    expect(out).toContain('(xs.minOrNull() ?: Int.MAX_VALUE)')
    expect(out).toContain('(ds.maxOrNull() ?: Double.NEGATIVE_INFINITY)')
    expect(out).toContain('(ds.minOrNull() ?: Double.POSITIVE_INFINITY)')
  })

  it('Math.PI is emitted fully qualified (kotlin.math.PI) so no import is needed', () => {
    expect(kt(`  const a = computed(() => Math.PI * n())`).code).toContain('kotlin.math.PI')
  })
})

describe('Kotlin expr: Number.isInteger / isNaN fold on the INFERRED numeric kind', () => {
  it('an Int arg folds to a constant; a Double arg gets the runtime check', () => {
    const out = kt(`  const a = computed(() => Number.isInteger(n()))
  const b = computed(() => Number.isInteger(dn()))
  const c = computed(() => isNaN(n()))
  const d = computed(() => isNaN(dn()))`).code
    // Kotlin Int is integral by construction / can never be NaN
    expect(out).toContain('val a by remember { derivedStateOf { true } }')
    expect(out).toContain('val c by remember { derivedStateOf { false } }')
    expect(out).toContain('((dn) % 1.0 == 0.0)')
    expect(out).toContain('(dn).isNaN()')
  })

  it('an UNRESOLVABLE arg type warns NAMED rather than folding to a wrong constant', () => {
    const r = kt(`  const a = computed(() => Number.isInteger(name()))
  const b = computed(() => isNaN(name()))`)
    const w = r.warnings.join('\n')
    expect(w).toContain('Number.isInteger')
    expect(w).toContain('isNaN')
  })
})

describe('Kotlin expr: Boolean(x) truthiness lowering', () => {
  it('picks the idiom from the arg type — bool identity, != 0, isNotEmpty, null-aware', () => {
    const out = kt(`  const a = computed(() => Boolean(flag()))
  const b = computed(() => Boolean(n()))
  const c = computed(() => Boolean(name()))
  const d = computed(() => Boolean(opt()))
  const e = computed(() => Boolean(optn()))`).code
    expect(out).toContain('val a by remember { derivedStateOf { flag } }')
    expect(out).toContain('(n != 0)')
    expect(out).toContain('(name).isNotEmpty()')
    // optional string / number check the INNER value — JS Boolean(undefined) is false
    expect(out).toContain('(opt ?: "").isNotEmpty()')
    expect(out).toContain('((optn ?: 0) != 0)')
  })

  it('an unresolvable arg keeps the raw call AND warns (never a silent wrong truthiness)', () => {
    const r = kt(`  type P = { a: number }
  const p = signal<P>({ a: 1 })
  const a = computed(() => Boolean(p()))`)
    expect(r.code).toContain('Boolean(p)')
    expect(r.warnings.join('\n')).toContain('Boolean(')
  })
})

describe('Kotlin expr: `!` / `!!` truthiness (the unary case)', () => {
  it('one idiom per arg kind, and the double-negation is the positive form', () => {
    const out = kt(`  const a = computed(() => !n())
  const b = computed(() => !!n())
  const c = computed(() => !name())
  const d = computed(() => !!name())
  const e = computed(() => !flag())
  const f = computed(() => !!flag())
  const g = computed(() => !opt())
  const h = computed(() => !!opt())`).code
    expect(out).toContain('(n == 0)')
    expect(out).toContain('(n != 0)')
    expect(out).toContain('(name).isEmpty()')
    expect(out).toContain('(name).isNotEmpty()')
    expect(out).toContain('val e by remember { derivedStateOf { !flag } }')
    expect(out).toContain('val f by remember { derivedStateOf { flag } }')
    expect(out).toContain('(opt == null)')
    expect(out).toContain('(opt != null)')
  })
})

describe('Kotlin expr: String() / Date / Object statics', () => {
  it('String(x) is .toString() for an Int and the JS-faithful formatter for a Double', () => {
    const out = kt(`  const a = computed(() => String(n()))
  const b = computed(() => String(dn()))`).code
    // Kotlin `3.0.toString()` is "3.0" but the web prints "3"
    expect(out).toContain('(n).toString()')
    expect(out).toContain('pyreonNumString(dn)')
    expect(out).toContain('fun pyreonNumString')
  })

  it('Date.now() is epoch millis as a Double; any other Date static warns NAMED', () => {
    const ok = kt(`  const a = computed(() => Date.now())`)
    expect(ok.code).toContain('System.currentTimeMillis().toDouble()')
    expect(ok.warnings.join('\n')).not.toContain('Date.')
    const bad = kt(`  const a = computed(() => Date.parse('2020-01-01'))`)
    expect(bad.warnings.join('\n')).toContain('Date.parse')
  })

  it('Object.values/entries degrade to a typed empty list + a NAMED warning (no runtime reflection)', () => {
    const r = kt(`  const o = { a: 1, b: 2 }
  const a = computed(() => Object.values(o))
  const b = computed(() => Object.entries(o))`)
    expect(r.code).toContain('emptyList<Any>()')
    const w = r.warnings.join('\n')
    expect(w).toContain('Object.values')
    expect(w).toContain('Object.entries')
  })
})

describe('Kotlin expr: Array statics', () => {
  it('Array.isArray folds to `true` (a typed source IS statically an array)', () => {
    expect(kt(`  const a = computed(() => Array.isArray(xs()))`).code).toContain(
      'val a by remember { derivedStateOf { true } }',
    )
  })

  it('Array.from(x) is a shallow toList(); the {length} range form becomes an index map', () => {
    const out = kt(`  const a = computed(() => Array.from(xs()))
  const b = computed(() => Array.from({ length: 3 }, (_, i) => i * 2))`).code
    expect(out).toContain('(xs).toList()')
    expect(out).toContain('(0 until 3).map')
  })
})

describe('Kotlin expr: bitwise operators are INFIX functions, not symbols', () => {
  it('&/|/^/<</>> map to and/or/xor/shl/shr, parenthesising a compound operand', () => {
    const out = kt(`  const a = computed(() => n() & 3)
  const b = computed(() => n() | 3)
  const c = computed(() => n() ^ 3)
  const d = computed(() => n() << 1)
  const e = computed(() => n() >> 1)
  const f = computed(() => n() & (n() + 1))`).code
    expect(out).toContain('n and 3')
    expect(out).toContain('n or 3')
    expect(out).toContain('n xor 3')
    expect(out).toContain('n shl 1')
    expect(out).toContain('n shr 1')
    // infix binds looser than arithmetic — the compound side keeps its parens
    expect(out).toContain('n and (n + 1)')
  })
})
