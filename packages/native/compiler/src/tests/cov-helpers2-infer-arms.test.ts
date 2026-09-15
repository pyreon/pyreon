// Branch matrices for `infer-type.ts` — the type the emit ANNOTATES a computed
// / helper / local with. Getting an arm wrong here is not a compile error in
// the compiler; it is a wrong Swift/Kotlin TYPE on the generated declaration,
// which fails at the swiftc/kotlinc gate with a message pointing at generated
// code rather than at the line that produced it. So every arm is asserted by
// the ANNOTATION it produces (`private var x: T`), which is the observable the
// inference actually feeds.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function app(decls: string, ret = '<Text>x</Text>'): string {
  return `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal, computed } from '@pyreon/reactivity'
type Rec = { id: number; name: string; price: Double }
type Opt = { a: string; b?: string }
export function App() {
  const n = signal(1)
  const d = signal(1.5)
  const s = signal('abc')
  const b = signal(true)
  const xs = signal<number[]>([1, 2])
  const ss = signal<string[]>(['a'])
  const rs = signal<Rec[]>([])
  const m = new Map<string, number>()
  const st = new Set<number>()
${decls}
  return (<Stack>${ret}</Stack>)
}`
}

const sw = (decls: string, ret?: string): string =>
  transform(app(decls, ret), { target: 'swift' }).code
const kt = (decls: string, ret?: string): string =>
  transform(app(decls, ret), { target: 'kotlin' }).code

/**
 * The Swift annotation of the COMPUTED `private var <name>: T`.
 *
 * The `private ` prefix is load-bearing: an emitted STRUCT field is also
 * `var <name>: T`, and a bare `var a:` match picked `Opt`'s own `a` field
 * instead of the computed — 68 assertions that read a real type and compared
 * it against the wrong declaration.
 */
function annot(decls: string, name: string, ret?: string): string {
  const line = sw(decls, ret)
    .split('\n')
    .find((l) => l.includes(`private var ${name}:`))
  return line?.trim() ?? '(missing)'
}

// ── Map / Set method results ───────────────────────────────────────────────

describe('Map / Set method result types', () => {
  it('`m.get(k)` is OPTIONAL (the union arm), not a bare value', () => {
    expect(annot(`  const a = computed(() => m.get('k'))`, 'a')).toContain('var a: Int?')
  })

  it.each([
    ['has', `m.has('k')`],
    ['delete', `m.delete('k')`],
  ])('`m.%s` is a boolean', (_k, expr) => {
    expect(annot(`  const a = computed(() => ${expr})`, 'a')).toContain('var a: Bool')
  })

  it.each([
    ['has', 'st.has(1)'],
    ['delete', 'st.delete(1)'],
    ['add', 'st.add(1)'],
  ])('`set.%s` is a boolean', (_k, expr) => {
    expect(annot(`  const a = computed(() => ${expr})`, 'a')).toContain('var a: Bool')
  })

  it('`.size` on a Map AND on a Set is a number', () => {
    expect(annot(`  const a = computed(() => m.size)`, 'a')).toContain('var a: Int')
    expect(annot(`  const a = computed(() => st.size)`, 'a')).toContain('var a: Int')
  })

  it('a same-named method on a NON-collection receiver does NOT take those arms', () => {
    expect(annot(`  const a = computed(() => ss().includes('a'))`, 'a')).toContain('var a: Bool')
  })
})

// ── Math.* ─────────────────────────────────────────────────────────────────

describe('inferMathCall — the Double set, abs, min/max and Math.PI', () => {
  it.each(['sqrt', 'cbrt', 'sin', 'cos', 'tan', 'log', 'log10', 'log2', 'exp', 'atan'])(
    '`Math.%s` is always Double',
    (fn) => {
      expect(annot(`  const a = computed(() => Math.${fn}(n()))`, 'a')).toContain('var a: Double')
    },
  )

  it('`Math.pow` / `Math.hypot` / `Math.atan2` are Double too', () => {
    expect(annot(`  const a = computed(() => Math.pow(n(), 2))`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => Math.hypot(n(), 2))`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => Math.atan2(n(), 2))`, 'a')).toContain('var a: Double')
  })

  it('`Math.abs` PRESERVES the argument\'s float-ness (both arms)', () => {
    expect(annot(`  const a = computed(() => Math.abs(d()))`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => Math.abs(n()))`, 'a')).toContain('var a: Int')
  })

  it('`Math.min`/`max` are Double iff ANY argument is (both arms)', () => {
    expect(annot(`  const a = computed(() => Math.min(n(), d()))`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => Math.max(n(), 2))`, 'a')).toContain('var a: Int')
  })

  it('`Math.PI` is a Double CONSTANT (the member arm, not a call)', () => {
    expect(annot(`  const a = computed(() => Math.PI)`, 'a')).toContain('var a: Double')
    expect(sw(`  const a = computed(() => Math.PI)`)).toContain('Double.pi')
  })

  it('an UNKNOWN `Math.*` returns null so the generic path handles it', () => {
    expect(annot(`  const a = computed(() => Math.clz32(n()))`, 'a')).toContain('var a:')
  })
})

// ── array method results ───────────────────────────────────────────────────

describe('array method result types', () => {
  it('`.map` element = the callback RETURN type, via the bound param', () => {
    expect(annot(`  const a = computed(() => rs().map((r) => r.name))`, 'a')).toContain(
      'var a: [String]',
    )
  })

  it('`.map` with a BLOCK-body callback resolves through the first return', () => {
    expect(
      annot(`  const a = computed(() => rs().map((r) => { return r.id }))`, 'a'),
    ).toContain('var a: [Int]')
  })

  it('`.map` whose body cannot be inferred falls back to Array<unknown>', () => {
    expect(annot(`  const a = computed(() => rs().map((r) => mystery(r)))`, 'a')).toContain(
      'var a: [Any]',
    )
  })

  it('`.flatMap` returns the callback\'s ARRAY body ITSELF (one level flattened)', () => {
    expect(annot(`  const a = computed(() => rs().flatMap((r) => [r.name]))`, 'a')).toContain(
      'var a: [String]',
    )
  })

  it('`.flatMap` with a non-array body degrades to Array<unknown>', () => {
    expect(annot(`  const a = computed(() => rs().flatMap((r) => r.name))`, 'a')).toContain(
      'var a: [Any]',
    )
  })

  it('`.find` / `.findLast` are OPTIONAL — the shape both targets actually return', () => {
    expect(annot(`  const a = computed(() => xs().find((x) => x > 1))`, 'a')).toContain('var a: Int?')
    expect(annot(`  const a = computed(() => xs().findLast((x) => x > 1))`, 'a')).toContain(
      'var a: Int?',
    )
  })

  it.each(['some', 'every', 'includes'])('`.%s` is a boolean', (fn) => {
    const arg = fn === 'includes' ? '1' : '(x) => x > 1'
    expect(annot(`  const a = computed(() => xs().${fn}(${arg}))`, 'a')).toContain('var a: Bool')
  })

  it.each(['indexOf', 'findIndex', 'lastIndexOf'])('`.%s` is a number', (fn) => {
    const arg = fn === 'findIndex' ? '(x) => x > 1' : '1'
    expect(annot(`  const a = computed(() => xs().${fn}(${arg}))`, 'a')).toContain('var a: Int')
  })

  it('`.join` is a string', () => {
    expect(annot(`  const a = computed(() => xs().join(','))`, 'a')).toContain('var a: String')
  })

  it('`.flat()` on an array-of-arrays gives the INNER array; otherwise unknown', () => {
    expect(
      annot(
        `  const g = signal<number[][]>([[1]])
  const a = computed(() => g().flat())`,
        'a',
      ),
    ).toContain('var a: [Int]')
    expect(annot(`  const a = computed(() => xs().flat())`, 'a')).toContain('var a: Any')
  })

  it('`.reduce` SEEDED takes the seed type; SEEDLESS takes the ELEMENT type', () => {
    expect(annot(`  const a = computed(() => xs().reduce((acc, x) => acc + x, 0))`, 'a')).toContain(
      'var a: Int',
    )
    expect(annot(`  const a = computed(() => xs().reduce((acc, x) => acc + x))`, 'a')).toContain(
      'var a: Int',
    )
  })

  it('`.reduce` with a BLOCK-body reducer resolves through its first return', () => {
    expect(
      annot(`  const a = computed(() => xs().reduce((acc, x) => { return acc + x }, 0))`, 'a'),
    ).toContain('var a: Int')
  })

  it('`.reduce` with a ONE-param reducer still binds the accumulator', () => {
    expect(annot(`  const a = computed(() => xs().reduce((acc) => acc, 0))`, 'a')).toContain(
      'var a: Int',
    )
  })

  it('`.reduce` with a NON-arrow reducer falls back to the seed type', () => {
    expect(annot(`  const a = computed(() => xs().reduce(combine, 0))`, 'a')).toContain('var a: Int')
  })

  it('`.length` on an array AND on a string are both numbers', () => {
    expect(annot(`  const a = computed(() => xs().length)`, 'a')).toContain('var a: Int')
    expect(annot(`  const a = computed(() => s().length)`, 'a')).toContain('var a: Int')
  })
})

// ── Array.* statics ────────────────────────────────────────────────────────

describe('inferArrayStaticCall', () => {
  it('`Array.isArray` is a boolean — and a typed source emits the literal `true`', () => {
    expect(annot(`  const a = computed(() => Array.isArray(xs()))`, 'a')).toContain('var a: Bool')
    expect(sw(`  const a = computed(() => Array.isArray(xs()))`)).toContain('var a: Bool { true }')
  })

  it('`Array.from(src)` preserves the source array type', () => {
    expect(annot(`  const a = computed(() => Array.from(xs()))`, 'a')).toContain('var a: [Int]')
  })

  it('`Array.from(nonArray)` falls back to Array<unknown>', () => {
    expect(annot(`  const a = computed(() => Array.from(s()))`, 'a')).toContain('var a: [Any]')
  })

  it('`Array.from(src, fn)` is the `.map` result (element = callback return)', () => {
    expect(annot(`  const a = computed(() => Array.from(rs(), (r) => r.name))`, 'a')).toContain(
      'var a: [String]',
    )
  })

  it('the `{ length: n }` RANGE form types from the BODY, index bound to a number', () => {
    expect(
      annot(`  const a = computed(() => Array.from({ length: n() }, (_, i) => i * 2))`, 'a'),
    ).toContain('var a: [Int]')
    expect(
      annot(`  const a = computed(() => Array.from({ length: n() }, (_, i) => \`#\${i}\`))`, 'a'),
    ).toContain('var a: [String]')
  })

  it('a non-`Array` receiver returns null (the guard), leaving the generic path', () => {
    expect(annot(`  const a = computed(() => NotArray.from(xs()))`, 'a')).toContain('var a:')
  })
})

// ── objectLengthRangeForm guards ───────────────────────────────────────────

describe('objectLengthRangeForm — every refusal is a NAMED warning, not a mis-emit', () => {
  const rangeWarns = (call: string): string =>
    transform(app(`  const a = computed(() => ${call})`), { target: 'swift' }).warnings.join('\n')

  it('a `{ length }` object with an EXTRA field is not the range form', () => {
    expect(rangeWarns(`Array.from({ length: n(), x: 1 }, (_, i) => i)`)).toContain('Array.from(')
  })

  it('a ONE-param callback is not the range form (no index to bind)', () => {
    expect(rangeWarns(`Array.from({ length: n() }, (i) => i)`)).toContain('Array.from(')
  })

  it('a SINGLE-`return` block body is normalised to an expression body upstream, so it LOWERS', () => {
    // The `fn.stmts !== undefined` guard is real, but the parser collapses a
    // one-statement `{ return e }` arrow to an expression body before the
    // classifier sees it — so this spelling reaches the range lowering rather
    // than the warning. Asserted so the guard is not mistaken for covering it.
    expect(
      transform(app(`  const a = computed(() => Array.from({ length: n() }, (_, i) => { return i }))`), {
        target: 'swift',
      }).code,
    ).toContain('(0..<n).map({ i in')
  })

  it('a MULTI-statement block body IS deferred (the guard that does fire)', () => {
    expect(
      rangeWarns(`Array.from({ length: n() }, (_, i) => { const j = i + 1; return j })`),
    ).toContain('Array.from(')
  })

  it('a body referencing the ELEMENT param is deferred (no faithful native value)', () => {
    expect(rangeWarns(`Array.from({ length: n() }, (el, i) => el)`)).toContain('Array.from(')
  })

  it('a one-ARG `Array.from({ length })` is not the range form either', () => {
    expect(rangeWarns(`Array.from({ length: n() })`)).toContain('Array.from(')
  })
})

// ── string method results ──────────────────────────────────────────────────

describe('string method results', () => {
  it.each(['trim', 'toLowerCase', 'toUpperCase'])('`.%s()` stays a string', (fn) => {
    expect(annot(`  const a = computed(() => s().${fn}())`, 'a')).toContain('var a: String')
  })

  it('`.substring` / `.slice` / `.replace` stay strings', () => {
    expect(annot(`  const a = computed(() => s().substring(0, 1))`, 'a')).toContain('var a: String')
    expect(annot(`  const a = computed(() => s().slice(0, 1))`, 'a')).toContain('var a: String')
    expect(annot(`  const a = computed(() => s().replace('a', 'b'))`, 'a')).toContain(
      'var a: String',
    )
  })
})

// ── binary / logical / comparison ──────────────────────────────────────────

describe('binary — string concat, division, exponent and float contagion', () => {
  it('`+` with EITHER side a string is a string', () => {
    expect(annot(`  const a = computed(() => 'x' + n())`, 'a')).toContain('var a: String')
    expect(annot(`  const a = computed(() => n() + 'x')`, 'a')).toContain('var a: String')
  })

  it('`/` is ALWAYS Double — JS division never truncates', () => {
    expect(annot(`  const a = computed(() => n() / 2)`, 'a')).toContain('var a: Double')
  })

  it('`**` is Double-domain on both targets', () => {
    expect(annot(`  const a = computed(() => n() ** 2)`, 'a')).toContain('var a: Double')
  })

  it('float is CONTAGIOUS through `+` / `*`; all-int stays Int', () => {
    expect(annot(`  const a = computed(() => n() + d())`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => n() * 2)`, 'a')).toContain('var a: Int')
  })

  it('one side UNKNOWN falls through to the concrete side, float-ness preserved', () => {
    expect(annot(`  const a = computed(() => mystery() + d())`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => mystery() + n())`, 'a')).toContain('var a: Int')
  })

  it('a FRACTIONAL literal is Double; an integral one is Int (the ergonomic default)', () => {
    expect(annot(`  const a = computed(() => 9.99)`, 'a')).toContain('var a: Double')
    expect(annot(`  const a = computed(() => 7)`, 'a')).toContain('var a: Int')
  })

  it('`===` / `<` / `&&` produce booleans; `??` produces the UNWRAPPED left type', () => {
    expect(annot(`  const a = computed(() => n() === 1)`, 'a')).toContain('var a: Bool')
    expect(annot(`  const a = computed(() => n() < 1)`, 'a')).toContain('var a: Bool')
    expect(annot(`  const a = computed(() => b() && true)`, 'a')).toContain('var a: Bool')
    // `.find` is `Int?`; `?? 0` must unwrap it, not keep the optional.
    expect(annot(`  const a = computed(() => (xs().find((x) => x > 1) ?? 0))`, 'a')).toContain(
      'var a: Int',
    )
  })

  it('a template literal is always a string; `JSON.stringify` too', () => {
    expect(annot(`  const a = computed(() => \`v=\${n()}\`)`, 'a')).toContain('var a: String')
    expect(annot(`  const a = computed(() => JSON.stringify(xs()))`, 'a')).toContain('var a: String')
  })

  it('`x++` is a number; `paren` and `await` pass the inner type through', () => {
    expect(annot(`  const a = computed(() => (n()))`, 'a')).toContain('var a: Int')
    expect(annot(`  const a = computed(() => ((s())))`, 'a')).toContain('var a: String')
  })
})

// ── member reads ───────────────────────────────────────────────────────────

describe('member reads — struct fields, object literals, locals and ternaries', () => {
  it('a declared struct FIELD resolves through the struct registry', () => {
    expect(annot(`  const a = computed(() => rs()[0].price)`, 'a')).toContain('var a: Double')
  })

  it('a field of an INLINE object literal resolves from the literal itself', () => {
    expect(annot(`  const a = computed(() => ({ count: xs().length }).count)`, 'a')).toContain(
      'var a: Int',
    )
  })

  it('a field of a BODY-LOCAL object const resolves through objectLocals', () => {
    expect(
      annot(
        `  const a = computed(() => { const o = { count: xs().length, label: s() }; return o.label })`,
        'a',
      ),
    ).toContain('var a: String')
  })

  it('a field of a TERNARY of two object literals resolves from a branch', () => {
    expect(annot(`  const a = computed(() => (b() ? { v: 1 } : { v: 2 }).v)`, 'a')).toContain(
      'var a: Int',
    )
  })

  it('a MIXED ternary (the field missing from one branch) bails to Any', () => {
    expect(annot(`  const a = computed(() => (b() ? { v: 1 } : { w: 2 }).v)`, 'a')).toContain(
      'var a: Any',
    )
  })

  it('an object literal with a SPREAD cannot be field-typed — it bails', () => {
    expect(annot(`  const a = computed(() => ({ ...base, v: 1 }).v)`, 'a')).toContain('var a:')
  })

  it('a member read through an OPTIONAL base unwraps to the real field type', () => {
    expect(
      annot(
        `  const sel = computed(() => rs().find((r) => r.id === 1))
  const a = computed(() => sel() ? sel().name : '')`,
        'a',
      ),
    ).toContain('var a: String')
  })

  it('an UNKNOWN property on a known struct degrades rather than guessing', () => {
    expect(annot(`  const a = computed(() => rs()[0].nope)`, 'a')).toContain('var a: Any')
  })
})

// ── optional condition / nil-coalesce / optional-member ternaries ─────────

describe('classifyOptionalCondition / nilCoalesceTernary / optionalMemberTernary', () => {
  const optDecls = `  const sel = computed(() => rs().find((r) => r.id === 1))`

  it('`opt ? opt.prop : fb` lowers to optional-chaining + coalescing', () => {
    expect(sw(`${optDecls}
  const a = computed(() => sel() ? sel().name : 'none')`)).toContain('?.name')
  })

  it('Kotlin lowers the same ternary to `?.` + elvis', () => {
    expect(kt(`${optDecls}
  const a = computed(() => sel() ? sel().name : 'none')`)).toContain('?.name')
  })

  it('`x === null ? fb : x` collapses to a nil-coalesce', () => {
    const out = sw(`${optDecls}
  const a = computed(() => sel() === null ? rs()[0] : sel())`)
    expect(out).toContain('??')
  })

  it('`x !== null ? x : fb` collapses the same way (the mirrored operand order)', () => {
    const out = sw(`${optDecls}
  const a = computed(() => sel() !== null ? sel() : rs()[0])`)
    expect(out).toContain('??')
  })

  it('a ternary whose two sides are DIFFERENT expressions is not a coalesce', () => {
    const out = sw(`${optDecls}
  const a = computed(() => sel() === null ? rs()[0] : rs()[1])`)
    expect(out).not.toContain('?? rs[0]')
  })

  it('`!opt` in a CONDITION becomes an explicit nil test, not a Bool coercion', () => {
    const out = sw(
      `${optDecls}`,
      '<Text>{!sel() ? "empty" : "full"}</Text>',
    )
    expect(out).toContain('== nil')
  })

  it('`opt !== null` binds rather than merely testing', () => {
    const out = sw(
      `${optDecls}
  const one = computed(() => sel())`,
      '<Text>{one() !== null ? "full" : "empty"}</Text>',
    )
    expect(out).toContain('nil')
  })
})

// ── negative slice ─────────────────────────────────────────────────────────

describe('classifyNegativeSlice — the four idioms, and the shapes that fall through', () => {
  it('`slice(-m)` → the LAST m', () => {
    expect(sw(`  const a = computed(() => xs().slice(-2))`)).toContain('suffix(2)')
  })

  it('`slice(0, -n)` → drop the last n', () => {
    expect(sw(`  const a = computed(() => xs().slice(0, -2))`)).toContain('dropLast(2)')
  })

  it('`slice(s, -n)` with a POSITIVE literal start → dropFirst + dropLast', () => {
    const out = sw(`  const a = computed(() => xs().slice(1, -2))`)
    expect(out).toContain('dropFirst(1)')
    expect(out).toContain('dropLast(2)')
  })

  it('`slice(-m, -n)` → suffix then dropLast', () => {
    const out = sw(`  const a = computed(() => xs().slice(-5, -2))`)
    expect(out).toContain('suffix(5)')
    expect(out).toContain('dropLast(2)')
  })

  it('a NON-literal start with a negative end falls through (not front-anchored)', () => {
    const out = sw(`  const a = computed(() => xs().slice(n(), -2))`)
    expect(out).not.toContain('dropFirst(n)')
  })

  it('an all-POSITIVE slice keeps the ordinary path', () => {
    expect(sw(`  const a = computed(() => xs().slice(1, 3))`)).not.toContain('dropLast(')
  })

  it('Kotlin lowers the same four idioms', () => {
    expect(kt(`  const a = computed(() => xs().slice(-2))`)).toContain('takeLast(2)')
    expect(kt(`  const a = computed(() => xs().slice(0, -2))`)).toContain('dropLast(2)')
  })
})

// ── array spread concat ────────────────────────────────────────────────────

describe('buildArraySpreadConcat — spread positions and the parenthesisation rule', () => {
  it('`[...a, ...b]` joins the two bare arrays', () => {
    const out = sw(
      `  const ys = signal<number[]>([3])
  const a = computed(() => [...xs(), ...ys()])`,
    )
    expect(out).toContain('xs + ys')
  })

  it('`[...a, 9]` groups the trailing literals and PARENTHESISES the concat', () => {
    const out = sw(`  const a = computed(() => [...xs(), 9].length)`)
    expect(out).toContain('(xs + [9]).count')
  })

  it('`[...a]` alone is just `a` — one part, no parens', () => {
    expect(sw(`  const a = computed(() => [...xs()])`)).toContain('{ xs }')
  })

  it('a LEADING literal run flushes before the spread', () => {
    expect(sw(`  const a = computed(() => [0, ...xs()])`)).toContain('([0] + xs)')
  })

  it('NO spread → the plain literal path (the null return)', () => {
    expect(sw(`  const a = computed(() => [1, 2])`)).toContain('[1, 2]')
  })

  it('the element type is inferred through the spread', () => {
    expect(annot(`  const a = computed(() => [...xs(), 9])`, 'a')).toContain('var a: [Int]')
  })

  it('a HETEROGENEOUS array degrades rather than guessing an element type', () => {
    expect(annot(`  const a = computed(() => [1, 'two'])`, 'a')).toContain('var a: Any')
  })

  it('an EMPTY array degrades; a TYPED-empty one carries its element type', () => {
    expect(annot(`  const a = computed(() => [])`, 'a')).toContain('var a: Any')
    expect(annot(`  const a = computed(() => [] as number[])`, 'a')).toContain('var a: [Int]')
  })

  it('Kotlin joins with the same algorithm, its own literal wrapper', () => {
    expect(kt(`  const a = computed(() => [...xs(), 9].length)`)).toContain(
      '(xs + listOf(9)).length',
    )
  })
})

// ── Object.keys / Object.values ────────────────────────────────────────────

describe('rewriteObjectKeys / rewriteObjectValues', () => {
  it('`Object.keys({…})` becomes the literal key array', () => {
    const out = sw(`  const a = computed(() => Object.keys({ p: 1, q: 2 }))`)
    expect(out).toContain('["p", "q"]')
    expect(annot(`  const a = computed(() => Object.keys({ p: 1, q: 2 }))`, 'a')).toContain(
      'var a: [String]',
    )
  })

  it('`Object.keys(<declared-struct value>)` resolves through the struct registry', () => {
    const out = sw(
      `  const r = signal<Rec>({ id: 1, name: 'a', price: 1.5 })
  const a = computed(() => Object.keys(r()))`,
    )
    expect(out).toContain('"id"')
    expect(out).toContain('"name"')
  })

  const objWarns = (expr: string): string =>
    transform(app(`  const a = computed(() => ${expr})`), { target: 'swift' }).warnings.join('\n')

  it('a SPREAD makes the key set non-static — refused with a NAMED warning', () => {
    expect(objWarns(`Object.keys({ ...base, p: 1 })`)).toContain(
      'Object.keys(...) has no native equivalent',
    )
    expect(sw(`  const a = computed(() => Object.keys({ ...base, p: 1 }))`)).not.toContain('"p"')
  })

  it('a 2-ARG `Object.keys` is not the shape (the args guard)', () => {
    expect(objWarns(`Object.keys({ p: 1 }, 2)`)).toContain('Object.keys(...) has no native equivalent')
  })

  it('`Object.values({…})` emits the value exprs when the types are HOMOGENEOUS', () => {
    expect(sw(`  const a = computed(() => Object.values({ p: 1, q: 2 }))`)).toContain('[1, 2]')
  })

  it('a HETEROGENEOUS `Object.values` is refused — JS mixed arrays have no native analog', () => {
    expect(objWarns(`Object.values({ p: 1, q: 'x' })`)).toContain(
      'Object.values(...) has no native equivalent',
    )
  })

  it('`Object.values(<struct value>)` names the fields once each', () => {
    const out = sw(
      `  const p = signal<{ a: number; b: number }>({ a: 1, b: 2 })
  const a = computed(() => Object.values(p()))`,
    )
    expect(out).toContain('[p.a, p.b]')
  })

  it('`Object.entries` is NOT rewritten (tuple arrays map to neither idiom)', () => {
    expect(objWarns(`Object.entries({ p: 1 })`)).toContain(
      'Object.entries(...) has no native equivalent',
    )
  })
})

// ── float widening ─────────────────────────────────────────────────────────

describe('widenFloatSignals / widenFloatLocals — an integer seed written a Double', () => {
  it('a `signal(0)` later `.set` a Double widens the DECL to Double', () => {
    const out = sw(
      `  const total = signal(0)`,
      '<Button onPress={() => total.set(d())}>go</Button>',
    )
    expect(out).toContain('var total: Double = 0.0')
  })

  it('a `.update` writing a Double widens it too', () => {
    const out = sw(
      `  const total = signal(0)`,
      '<Button onPress={() => total.update((t) => t + d())}>go</Button>',
    )
    expect(out).toContain('var total: Double = 0.0')
  })

  it('an INT-only signal is untouched — the widening is strictly additive', () => {
    const out = sw(`  const c = signal(0)`, '<Button onPress={() => c.set(n())}>go</Button>')
    expect(out).toContain('var c: Int = 0')
  })

  // `widenFloatLocals` runs over `function` DECLS (a component-body arrow
  // helper), NOT over computeds — a computed body is never scanned, so using
  // one here would have proved nothing while looking green.
  const helperApp = (body: string): string => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const items = signal([{ id: 1, price: 2.5 }])
  const total = () => {
${body}
  }
  return (<Stack><Text>{String(total())}</Text></Stack>)
}`
  const helper = (body: string, target: 'swift' | 'kotlin' = 'swift'): string =>
    transform(helperApp(body), { target }).code

  it('a LOCAL accumulator seeded 0 and `+=`-ed a Double widens the SEED and the RETURN', () => {
    const out = helper(`    let acc = 0
    for (const it of items()) acc += it.price
    return acc`)
    expect(out).toContain('var acc = 0.0')
    expect(out).toContain('-> Double')
  })

  it('a literal fractional assignment widens it too (no for-of needed)', () => {
    const out = helper(`    let acc = 0
    acc += 1.5
    return acc`)
    expect(out).toContain('var acc = 0.0')
  })

  it('an INT-only local accumulator stays Int on BOTH targets', () => {
    const body = `    let acc = 0
    for (const it of items()) acc += it.id
    return acc`
    expect(helper(body)).toContain('var acc = 0')
    expect(helper(body)).not.toContain('var acc = 0.0')
    expect(helper(body)).toContain('-> Int')
    expect(helper(body, 'kotlin')).toContain('var acc = 0')
    expect(helper(body, 'kotlin')).toContain(': Int')
  })

  it('Kotlin widens the same shape', () => {
    const out = helper(
      `    let acc = 0
    for (const it of items()) acc += it.price
    return acc`,
      'kotlin',
    )
    expect(out).toContain('var acc = 0.0')
    expect(out).toContain(': Double')
  })
})

// ── typeIsOptional / unwrapOptionalType / typeContainsFunction ────────────

describe('optionality helpers', () => {
  it('an OPTIONAL declared field annotates as optional and unwraps on read', () => {
    const out = sw(
      `  const o = signal<Opt>({ a: 'x' })
  const a = computed(() => o().b)`,
    )
    expect(out).toContain('var b: String?')
  })

  it('a struct carrying a FUNCTION field is NOT made Codable (the conformance gate)', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type WithFn = { id: number; run: () => void }
export function App() {
  const w = signal<WithFn>({ id: 1, run: () => {} })
  return (<Stack><Text>{w().id}</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    expect(out).toContain('struct WithFn')
    expect(out).not.toContain('struct WithFn: Codable')
  })

  it('a plain struct DOES conform', () => {
    expect(sw(`  const a = computed(() => n())`)).toContain('struct Rec: Codable')
  })
})

// ── inferReturnType / helper functions ─────────────────────────────────────

describe('inferReturnType — a helper function\'s emitted return type', () => {
  it('an expression-body helper takes its body type', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function twice(v: number) { return v * 2 }
export function App() { return (<Stack><Text>{twice(2)}</Text></Stack>) }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('-> Int')
  })

  it('a helper returning a FRACTIONAL expression is Double', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function half(v: number) { return v / 2 }
export function App() { return (<Stack><Text>{half(2)}</Text></Stack>) }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('-> Double')
  })

  it('a helper whose body walks through an `if` finds the first return', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function pick(v: number) { if (v > 1) { return 'big' } return 'small' }
export function App() { return (<Stack><Text>{pick(2)}</Text></Stack>) }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('-> String')
  })

  it('findFirstReturnExpr descends into SWITCH cases (a computed typed from a case body)', () => {
    expect(
      annot(
        `  const lbl = computed(() => { switch (n()) { case 1: return 'one'; default: return 'many' } })`,
        'lbl',
      ),
    ).toContain('var lbl: String')
  })

  it('…and into a WHILE body', () => {
    expect(
      annot(`  const lbl = computed(() => { while (n() > 0) { return 'loop' } return 'done' })`, 'lbl'),
    ).toContain('var lbl: String')
  })

  it('…and into a FOR-OF body', () => {
    expect(
      annot(`  const lbl = computed(() => { for (const x of ss()) { return 'found' } return 'none' })`, 'lbl'),
    ).toContain('var lbl: String')
  })

  it('but the for-of ITEM binding is NOT seeded, so returning it degrades to Any', () => {
    // A documented asymmetry, locked so a future fix is a deliberate change:
    // `findFirstReturnExpr` seeds `let` bindings it walks past but not a
    // for-of item (unlike `widenFloatLocals`, which binds the item from the
    // iterated element type). Degrading is SAFE — `Any` compiles for an
    // interpolation — but it is a real gap for a typed consumer.
    expect(
      annot(`  const lbl = computed(() => { for (const x of ss()) { return x } return 'none' })`, 'lbl'),
    ).toContain('var lbl: Any')
  })

  it('…and binds a `let` seen ABOVE the return, so the return resolves through it', () => {
    expect(
      annot(`  const lbl = computed(() => { const t = rs().map((r) => r.name); return t })`, 'lbl'),
    ).toContain('var lbl: [String]')
  })
})
