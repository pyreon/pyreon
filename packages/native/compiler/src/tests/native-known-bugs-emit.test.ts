// Known-bug fixes in the GENERAL (non-flow, non-chart-host) native emit.
//
// 1. A view helper passed BY REFERENCE into a render slot with more params
//    (`render={cell}`, slot `(u, i)`) was wrapped `{ a0 -> cell(a0) }` on
//    Kotlin — a kotlinc arity error. Swift was already padded; Kotlin now is.
// 2. A MAPPED JS Array/String/number method reached with an argument shape its
//    arm did not cover fell through to a VERBATIM re-emit under its web name —
//    `s.toUpperCase('tr')`, `xs.filter(fn, ctx)`, `xs.indexOf(x, 2)`,
//    `n.toFixed(d)` — none of which exist natively, with no warning. Now:
//    faithful positioned forms LOWER (indexOf / includes fromIndex, startsWith
//    position, endsWith endPosition, split limit, toString(radix) on an Int,
//    toFixed(dynamic)); arguments JS itself ignores (a thisArg, anything past
//    the declared parameters) are DROPPED with a named warning; every other
//    shape keeps the verbatim name WITH a named warning (method-shapes.ts).
// 3. A helper PARAMETER typed as an inline object emitted a tuple on Swift (a
//    single-field one collapsed to the bare field type) and a per-helper
//    `PyreonHelpers<Param>` data class on Kotlin, while the call site passes
//    the literal's `__ObjN` — neither target compiled. Both now name the
//    literal's struct (`namedInlineParamType`).
// 4. A `<For>` row with a BLOCK body rendered `""` silently on both targets.
//    It now lowers through `planViewBlock` (the render-prop block-body shape
//    of PR #3717); an unplannable block is named and renders an empty row.
//
// Bisect (each fix reverted alone, then restored — all green after restore):
//   1  Kotlin padding reverted → `expected … to contain '{ a0, _ -> cell(a0) }'`
//      and kotlinc: "argument type mismatch: actual type is '(User) -> Unit',
//      but '(User, Int) -> Unit' was expected".
//   2a positioned-search helpers neutered → 12 specs fail (`xs.indexOf(2, 2)`
//      re-emitted).
//   2b ignored-arg trimming neutered → `expected 's.toUpperCase("tr")' to be
//      's.uppercased()'`; swiftc: "value of type 'String' has no member
//      'toUpperCase'".
//   2c shape warning neutered → all 9 `.method` cases fail.
//   2d/2e arms neutered → `expected 's.trimStart()' …`, `'n.toString(16)'`,
//      `'f.toFixed(n)'`; swiftc "value of type 'Int' has no member
//      'toString'", kotlinc "unresolved reference 'toFixed'".
//   3  param naming reverted → swiftc "value of type 'String' has no member
//      'c'"; kotlinc "actual type is '__Obj0', but 'PyreonHelpersT' was expected".
//   4  For block lowering reverted → the `""` row returns; swiftc "static
//      method 'buildExpression' requires that 'String' conform to 'View'"
//      (kotlinc ACCEPTS the `""` row — the Android half is a silent drop only
//      the string assertion sees).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const SLOT_SRC = `import { Stack, Text } from '@pyreon/primitives'
import type { VNodeChild } from '@pyreon/core'
type User = { name: string; age: number }
function Row(props: { render: (u: User, i: number) => VNodeChild }) {
  const u: User = { name: 'Ada', age: 3 }
  return <Stack>{props.render(u, 0)}</Stack>
}
const cell = (u: User) => <Text>{u.name}</Text>
export function A() { return <Stack><Row render={cell} /></Stack> }
`

describe('1. a view helper passed into a wider render slot is arity-padded', () => {
  it('Kotlin: `{ a0, _ -> cell(a0) }`', () => {
    expect(kotlin(SLOT_SRC).code).toContain('{ a0, _ -> cell(a0) }')
  })
  it('Swift: `{ a0, _ in cell(a0) }`', () => {
    expect(swift(SLOT_SRC).code).toContain('{ a0, _ in cell(a0) }')
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the padded lambda', () => {
    const r = validateKotlin(kotlin(SLOT_SRC).code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
  it.skipIf(!isSwiftcAvailable())('swiftc accepts the padded closure', () => {
    const r = validateSwiftWithStubs(swift(SLOT_SRC).code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// 2. Mapped JS methods reached with an argument shape their arm does not cover
// ---------------------------------------------------------------------------

const METHODS_HEAD = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function A() {
  const xs = signal([1, 2, 3, 2])
  const s = signal('hello world')
`
const methods = (body: string, ret = '<Text>x</Text>') =>
  `${METHODS_HEAD}${body}\n  return <Stack>${ret}</Stack>\n}\n`

/** The emitted RHS of `let name =` / `val name =`. */
const rhs = (code: string, name: string): string =>
  code.split('\n').find((l) => new RegExp(`\\b(let|val) ${name} = `).test(l))?.replace(/^\s*(let|val) \w+ = /, '') ?? ''

const POSITIONED = methods(
  `  const a = xs().indexOf(2, 2)
  const b = xs().includes(1, -2)
  const c = s().indexOf('o', 5)
  const d = s().includes('h', 1)
  const e2 = s().startsWith('world', 6)
  const f = s().endsWith('hello', 5)
  const g = s().split(' ', 1)`,
  `<Text>{String(a)}{String(b)}{String(c)}{String(d)}{String(e2)}{String(f)}{g.join(',')}</Text>`,
)

describe('2a. positioned searches lower faithfully instead of re-emitting the web name', () => {
  const sw = swift(POSITIONED)
  const kt = kotlin(POSITIONED)
  it.each(['a', 'b', 'c', 'd', 'e2', 'f', 'g'])('`%s` re-emits no 2-argument web call on Swift', (name) => {
    expect(rhs(sw.code, name)).not.toMatch(/\.(indexOf|includes|startsWith|endsWith|split)\([^)]*, /)
    expect(rhs(sw.code, name)).not.toBe('')
  })
  // Kotlin's `String.indexOf(s, i)` IS JS's (both clamp); every other 2-arg
  // form is rewritten.
  it.each(['a', 'b', 'e2', 'f', 'g'])('`%s` re-emits no 2-argument web call on Kotlin', (name) => {
    expect(rhs(kt.code, name)).not.toMatch(/\.(indexOf|includes|startsWith|endsWith|split)\([^)]*, /)
    expect(rhs(kt.code, name)).not.toBe('')
  })
  it('Swift: an array fromIndex counts from the end when negative, clamped to 0', () => {
    expect(rhs(sw.code, 'b')).toContain('__pyPos < 0 ? max(0, __pyRecv.count + __pyPos) : min(__pyPos, __pyRecv.count)')
    expect(rhs(sw.code, 'a')).toContain('__pyRecv[__pyFrom...].firstIndex(of: 2) ?? -1')
  })
  it('Swift: a string position is clamped to [0, count]', () => {
    expect(rhs(sw.code, 'c')).toContain('min(max(0, 5), __pyRecv.count)')
  })
  it('Kotlin: List.indexOf has no fromIndex — subList + offset; String.indexOf(s, i) IS JS', () => {
    expect(rhs(kt.code, 'a')).toContain('__pyRecv.subList(__pyFrom, __pyRecv.size).indexOf(2)')
    expect(rhs(kt.code, 'c')).toBe('s.indexOf("o", 5)')
  })
  it('Kotlin: startsWith clamps a negative position (Kotlin returns false for one)', () => {
    expect(rhs(kt.code, 'e2')).toContain('drop(maxOf(0, 6)).startsWith("world")')
  })
  it('split limit TRUNCATES (Kotlin `limit` would keep the remainder in the last part)', () => {
    expect(rhs(kt.code, 'g')).toContain('__pyParts.take(__pyLimit)')
    expect(rhs(sw.code, 'g')).toContain('Array(__pyParts.prefix(__pyLimit))')
  })
  it('no warnings — every shape lowered', () => {
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })
  it.skipIf(!isSwiftcAvailable())('swiftc accepts every positioned search', () => {
    const r = validateSwiftWithStubs(sw.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
  it.skipIf(!isKotlincAvailable())('kotlinc accepts every positioned search', () => {
    const r = validateKotlin(kt.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})

const IGNORED = methods(
  `  const h = s().toUpperCase('tr')
  const i = xs().filter((x) => x > 1, null)
  const j = xs().map((x, k) => x + k, null)
  const k = s().trim(1)`,
  `<Text>{h}{String(i.length)}{String(j.length)}{k}</Text>`,
)

describe('2b. arguments JS itself ignores are dropped (and named), never re-emitted', () => {
  const sw = swift(IGNORED)
  const kt = kotlin(IGNORED)
  it('Swift lowers the core arity', () => {
    expect(rhs(sw.code, 'h')).toBe('s.uppercased()')
    expect(rhs(sw.code, 'i')).toBe('xs.filter({ x in x > 1 })')
    expect(rhs(sw.code, 'j')).toBe('xs.enumerated().map({ (k, x) in x + k })')
    expect(rhs(sw.code, 'k')).toBe('s.trimmingCharacters(in: .whitespacesAndNewlines)')
  })
  it('Kotlin lowers the core arity', () => {
    expect(rhs(kt.code, 'h')).toBe('s.uppercase()')
    expect(rhs(kt.code, 'i')).toBe('xs.filter({ x -> x > 1 })')
    expect(rhs(kt.code, 'j')).toBe('xs.mapIndexed({ k, x -> x + k })')
  })
  it('names each dropped argument on both targets', () => {
    for (const w of [sw.warnings, kt.warnings]) {
      expect(w.some((x) => x.startsWith('`.toUpperCase(…)` on a string: the extra argument is dropped'))).toBe(true)
      expect(w.some((x) => x.startsWith('`.filter(…)` on an array: the extra `thisArg` argument is dropped'))).toBe(true)
      expect(w.some((x) => x.startsWith('`.map(…)` on an array: the extra `thisArg` argument is dropped'))).toBe(true)
      expect(w.some((x) => x.startsWith('`.trim(…)` on a string: the extra argument is dropped'))).toBe(true)
    }
  })
  it.skipIf(!isSwiftcAvailable())('swiftc accepts the trimmed calls', () => {
    const r = validateSwiftWithStubs(sw.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the trimmed calls', () => {
    const r = validateKotlin(kt.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})

describe('2c. every other uncovered shape of a mapped method is named, on both targets', () => {
  const cases: [string, string][] = [
    ['lastIndexOf', 'xs().lastIndexOf(2, 1)'],
    ['flat', 'xs().flat(2)'],
    ['concat', 'xs().concat([1], [2])'],
    ['fill', 'xs().fill(0, 1, 2)'],
    ['padStart', `s().padStart(5, 'ab')`],
    ['charAt', 's().charAt()'],
    ['at', 'xs().at()'],
    ['replace', `s().replace('a')`],
    ['findIndex', 'xs().findIndex()'],
  ]
  it.each(cases)('`.%s` — %s', (method, call) => {
    const src = methods(`  const v = ${call}`, '<Text>{String(v)}</Text>')
    for (const [target, r] of [['Swift', swift(src)], ['Kotlin', kotlin(src)]] as const) {
      expect(
        r.warnings.some((w) => w.startsWith(`\`.${method}(…)\``) && w.includes(`has no ${target} lowering for this argument shape`)),
        `${target}: ${r.warnings.join(' | ')}`,
      ).toBe(true)
    }
  })
  it('a shape the native stdlib spells identically stays quiet (Kotlin `find(pred)`, `reduce(fn)`)', () => {
    const r = kotlin(methods('  const v = xs().find((x) => x > 1)\n  const w = xs().reduce((a, b) => a + b)', '<Text>{String(v)}{String(w)}</Text>'))
    expect(r.warnings).toEqual([])
  })
})

describe('2d. Swift-only gaps closed in the same pass', () => {
  it('trimStart / trimEnd lower (Kotlin has them natively)', () => {
    const src = methods(`  const a = s().trimStart()\n  const b = s().trimEnd()`, '<Text>{a}{b}</Text>')
    const r = swift(src)
    expect(rhs(r.code, 'a')).toBe('String(s.drop(while: { $0.isWhitespace }))')
    expect(rhs(r.code, 'b')).toBe('String(s.reversed().drop(while: { $0.isWhitespace }).reversed())')
    expect(r.warnings).toEqual([])
    expect(kotlin(src).warnings).toEqual([])
  })
  it('a string\'s toString() is the string itself', () => {
    expect(rhs(swift(methods('  const a = s().toString()', '<Text>{a}</Text>')).code, 'a')).toBe('s')
  })
})

const NUMBERS = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function A() {
  const n = signal(255)
  const f = signal(1.5)
  const a = n().toString(16)
  const c = f().toFixed(n())
  return <Stack><Text>{a}{c}</Text></Stack>
}
`

describe('2e. number methods: a radix on an integer and a dynamic digit count lower; the rest is named', () => {
  const sw = swift(NUMBERS)
  const kt = kotlin(NUMBERS)
  it('toString(radix) on an Int', () => {
    expect(rhs(sw.code, 'a')).toBe('String(n, radix: 16)')
    expect(rhs(kt.code, 'a')).toBe('n.toString(16)')
  })
  it('toFixed(dynamic)', () => {
    expect(rhs(sw.code, 'c')).toBe('String(format: "%.\\(n)f", f)')
    expect(rhs(kt.code, 'c')).toBe('"%.${n}f".format(java.util.Locale.ROOT, f)')
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })
  it('a Double radix and a locale argument have no lowering — named', () => {
    const src = methods(`  const d = signal(1.5)\n  const a = d().toString(2)\n  const b = d().toLocaleString('en')`, '<Text>{a}{b}</Text>')
    for (const [target, r] of [['Swift', swift(src)], ['Kotlin', kotlin(src)]] as const) {
      expect(r.warnings.some((w) => w.startsWith(`\`.toString(…)\` on a number with 1 argument has no ${target} lowering`))).toBe(true)
      expect(r.warnings.some((w) => w.startsWith(`\`.toLocaleString(…)\` on a number with 1 argument has no ${target} lowering`))).toBe(true)
    }
  })
  it.skipIf(!isSwiftcAvailable())('swiftc accepts them', () => {
    const r = validateSwiftWithStubs(sw.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
  it.skipIf(!isKotlincAvailable())('kotlinc accepts them', () => {
    const r = validateKotlin(kt.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// 3. A helper parameter typed as an INLINE object
// ---------------------------------------------------------------------------

const INLINE_PARAM = `import { Text } from '@pyreon/primitives'
function f(t: { c: string }) { return t.c }
function g(u: { a: number; b: string }) { return u.b + String(u.a) }
const h = (rows: { a: number; b: string }[]): number => rows.length
export function App(){ return <Text>{f({ c: "x" })}{g({ a: 1, b: "y" })}{String(h([{ a: 2, b: "z" }]))}</Text> }
`

describe('3. an inline-object parameter is typed as the struct its call-site literal constructs', () => {
  const sw = swift(INLINE_PARAM)
  const kt = kotlin(INLINE_PARAM)
  it('Swift: the struct, not a tuple (nor a single-field collapse to the bare field type)', () => {
    expect(sw.code).toContain('func f(_ t: __Obj0) -> String')
    expect(sw.code).toContain('func g(_ u: __Obj1) -> String')
    expect(sw.code).toContain('func h(_ rows: [__Obj1]) -> Int')
    expect(sw.code).toContain('f(__Obj0(c: "x"))')
  })
  it('Kotlin: the SAME data class the literal builds, not a per-helper PyreonHelpers<Param>', () => {
    expect(kt.code).toContain('fun f(t: __Obj0): String')
    expect(kt.code).toContain('fun g(u: __Obj1): String')
    expect(kt.code).not.toContain('PyreonHelpers')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc accepts it', () => {
    const r = validateSwiftWithStubs(sw.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
  it.skipIf(!isKotlincAvailable())('kotlinc accepts it', () => {
    const r = validateKotlin(kt.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})

// ---------------------------------------------------------------------------
// 4. A <For> row with a BLOCK body
// ---------------------------------------------------------------------------

const FOR_BLOCK = `import { Text, Stack, For } from '@pyreon/primitives'
type Row = { id: number; name: string; note?: string }
export function App(props: { rows: Row[] }) {
  return <Stack>
    <For each={props.rows} by={(r) => r.id}>{(r) => { const z = r.name + "!"; if (r.note === undefined) return <Text>{z}</Text>; return <Text>{r.note}</Text> }}</For>
  </Stack>
}
`
const FOR_UNPLANNABLE = `import { Text, Stack, For } from '@pyreon/primitives'
const xs = [1]
export function App(){ return <Stack><For each={xs} by={(x) => x}>{(x) => { let q = x; q++; return <Text>{String(q)}</Text> }}</For></Stack> }
`

describe('4. a block-bodied <For> row renders its returned element', () => {
  const sw = swift(FOR_BLOCK)
  const kt = kotlin(FOR_BLOCK)
  it('Swift: const + early-return branch become view-builder statements', () => {
    expect(sw.code).toContain('ForEach(rows, id: \\.id) { r in\n        let z = r.name + "!"\n        if let note = r.note {')
    expect(sw.code).not.toMatch(/\{ r in\n\s*""\n/)
  })
  it('Kotlin twin', () => {
    expect(kt.code).toContain('items(rows, key = { it.id }) { r ->\n        val z = r.name + "!"')
    expect(kt.code).not.toMatch(/\{ r ->\n\s*""\n/)
  })
  it('no warnings for a plannable block', () => {
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })
  it('an unplannable block (a mutable local) is NAMED and renders an empty row on both targets', () => {
    for (const r of [swift(FOR_UNPLANNABLE), kotlin(FOR_UNPLANNABLE)]) {
      expect(r.warnings.some((w) => w.startsWith("<For>: this row callback's BLOCK body"))).toBe(true)
      expect(r.code).not.toMatch(/(in|->)\n\s*""\n/)
    }
  })
  it.skipIf(!isSwiftcAvailable())('swiftc accepts the block row', () => {
    const r = validateSwiftWithStubs(sw.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
  it.skipIf(!isKotlincAvailable())('kotlinc accepts the block row', () => {
    const r = validateKotlin(kt.code)
    expect(r.ok, r.error).toBe(true)
  }, 120_000)
})
