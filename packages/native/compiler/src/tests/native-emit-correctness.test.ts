// Regression locks for the pre-release native-emit audit.
//
// Every finding here was a SILENT WRONG EMIT — the compiler produced code with
// zero warnings on both targets, and the code either failed to compile or
// answered differently from the web. The load-bearing assertion for each is the
// REAL TOOLCHAIN accepting the emit (or the semantic value it produces), not a
// string match; the string assertions are there to make a failure diagnosable.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = (body: string, read = `"x"`) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const strs = signal<string[]>(["a", "b"])
  const s = signal<string>("hello")
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

const swiftOf = (src: string) => transform(src, { target: 'swift' })
const kotlinOf = (src: string) => transform(src, { target: 'kotlin' })

describe('TS utility-type annotations never leak the TS name', () => {
  // `Partial<ChartTheme>` emitted `private let T: Partial<ChartTheme>` —
  // `cannot find type 'Partial' in scope` / `unresolved reference`, silently.
  const PRIM = `import { Stack, Text } from '@pyreon/primitives'\n`
  const PARTIAL = `${PRIM}type Th = { text: string; bg: string }
const T: Partial<Th> = { text: '#fff' }
export function C() { return <Stack><Text>{T.text}</Text></Stack> }`
  const RECORD = `${PRIM}const M: Record<string, number> = { a: 1 }
export function C() { return <Stack><Text>{String(M["a"] ?? 0)}</Text></Stack> }`
  // NOTE the \`?? 0\`: a native dictionary subscript is OPTIONAL on both
  // targets, where a TS \`Record\` index is not. That divergence is inherent to
  // the map lowering (it applies to \`Map<K, V>\` identically) and is not what
  // this fixture is pinning — the DECLARATION is.

  it('an ERASABLE utility lowers to its base type', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(
        `${PRIM}const R: Readonly<{ a: number }> = { a: 1 }\nexport function C() { return <Stack><Text>{String(R)}</Text></Stack> }`,
        { target },
      )
      expect(r.code).not.toContain('Readonly<')
      expect(r.warnings).toEqual([])
    }
  })

  it('`Record<K, V>` lowers to the native DICTIONARY — type AND literal', () => {
    const src = RECORD
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('private let M: [String: Int] = ["a": 1]')
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('private val M: MutableMap<String, Int> = mutableMapOf("a" to 1)')
    expect(sw.warnings).toEqual([])
    expect(kt.warnings).toEqual([])
  })

  it('a DECLINED utility warns BY NAME and drops the annotation (never emits the TS name)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(PARTIAL, { target })
      expect(r.code).not.toContain('Partial<')
      expect(r.warnings.join(' ')).toContain('`Partial<…>` has no native form in PMTC')
      // The annotation is dropped, so the initializer's own struct stands.
      expect(r.code).toMatch(/private (let|val) T = __Obj0\(/)
    }
  })

  it('`Pick` / `Omit` / `ReturnType` all warn by their own name', () => {
    for (const [name, src] of [
      ['Pick', `${PRIM}const P: Pick<{a:number;b:string}, 'a'> = { a: 1 }\nexport function C() { return <Stack><Text>{String(P)}</Text></Stack> }`],
      ['Omit', `${PRIM}const O: Omit<{a:number;b:string}, 'b'> = { a: 1 }\nexport function C() { return <Stack><Text>{String(O)}</Text></Stack> }`],
      ['ReturnType', `${PRIM}function f() { return 1 }\nconst R: ReturnType<typeof f> = 1\nexport function C() { return <Stack><Text>{String(R)}</Text></Stack> }`],
    ] as const) {
      const r = transform(src, { target: 'swift' })
      expect(r.warnings.join(' '), name).toContain(`\`${name}<…>\` has no native form`)
      expect(r.code, name).not.toContain(`${name}<`)
    }
  })

  it('swiftc accepts the utility-type fixtures', { skip: !isSwiftcAvailable() }, () => {
    for (const src of [PARTIAL, RECORD]) {
      const r = validateSwiftWithStubs(swiftOf(src).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })

  it('kotlinc accepts the utility-type fixtures', { skip: !isKotlincAvailable() }, () => {
    for (const src of [PARTIAL, RECORD]) {
      const r = validateKotlin(kotlinOf(src).code)
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})

describe('an unmapped Array/String method WARNS instead of leaking verbatim', () => {
  const UNMAPPED: Array<[string, string]> = [
    ['nums().toSorted()', '.toSorted()'],
    ['nums().pop()', '.pop()'],
    ['nums().entries()', '.entries()'],
    ['nums().reduceRight((a: number, b: number) => a + b, 0)', '.reduceRight()'],
    ['nums().findLastIndex((x: number) => x > 1)', '.findLastIndex()'],
    ['s().codePointAt(0)', '.codePointAt()'],
    ['s().substr(1)', '.substr()'],
    ['s().localeCompare("b")', '.localeCompare()'],
    ['s().normalize()', '.normalize()'],
    ['s().toLocaleUpperCase()', '.toLocaleUpperCase()'],
  ]
  for (const [expr, named] of UNMAPPED) {
    it(`${expr} is loud on BOTH targets`, () => {
      const src = APP(`  const out = computed(() => ${expr})`)
      for (const r of [swiftOf(src), kotlinOf(src)]) {
        expect(r.warnings.join(' ')).toContain(`\`${named}\``)
        expect(r.warnings.join(' ')).toContain('has no lowering in PMTC')
      }
    })
  }

  // The other half of the invariant: the methods that reach the same verbatim
  // emit and are CORRECT there must stay silent. Measured on both real
  // toolchains — a blanket fallthrough warning would fire on every one.
  const MAPPED_OR_CORRECT = [
    'nums().map((x: number) => x + 1).length',
    'nums().filter((x: number) => x > 1).length',
    'nums().indexOf(2)',
    's().trim()',
    's().split(",").length',
    's().startsWith("h")',
    's().padEnd(8, ".")',
    's().repeat(2)',
  ]
  for (const expr of MAPPED_OR_CORRECT) {
    it(`${expr} stays SILENT (no false positive)`, () => {
      const src = APP(`  const out = computed(() => ${expr})`)
      for (const r of [swiftOf(src), kotlinOf(src)]) {
        expect(r.warnings.filter((w) => w.includes('has no lowering in PMTC'))).toEqual([])
      }
    })
  }
})

describe('Math.round matches JS on both targets', () => {
  // JS `Math.round` is `floor(x + 0.5)` (ties toward +Infinity); Swift's
  // `.rounded()` is toNearestOrAwayFromZero. Executed on the real toolchains
  // over [-0.5, -1.5, 2.5]: JS/Kotlin `0 -1 3`, `.rounded()` `-1 -2 3`.
  it('Swift emits the floor(x + 0.5) form, not .rounded()', () => {
    const r = swiftOf(APP(`  const out = computed(() => Math.round(-0.5))`))
    expect(r.code).toContain(') + 0.5).rounded(.down)')
    expect(r.code).not.toMatch(/\)\)\.rounded\(\)/)
  })
  it('Kotlin is unchanged — java.lang.Math.round IS floor(x + 0.5)', () => {
    const r = kotlinOf(APP(`  const out = computed(() => Math.round(-0.5))`))
    expect(r.code).toContain('Math.round(')
  })
})

describe('String.length is UTF-16 units on every target', () => {
  // `"👍".length` is 2 in JS and Kotlin; Swift's `.count` is 1 (grapheme
  // clusters) and `.utf16.count` is 2.
  it('a STRING receiver emits .utf16.count on Swift', () => {
    const r = swiftOf(APP(`  const out = computed(() => s().length)`))
    expect(r.code).toContain('s.utf16.count')
  })
  it('an ARRAY receiver keeps .count (correct there)', () => {
    const r = swiftOf(APP(`  const out = computed(() => nums().length)`))
    expect(r.code).toContain('nums.count')
    expect(r.code).not.toContain('nums.utf16')
  })
})

describe('toFixed is locale-INVARIANT on Android', () => {
  // `"%.2f".format(x)` uses Locale.getDefault() — under Locale.GERMANY it
  // yields `1234,57` where JS and Swift give `1234.57`.
  it('Kotlin passes Locale.ROOT', () => {
    const r = kotlinOf(APP(`  const out = computed(() => (nums()[0] / 2).toFixed(2))`))
    expect(r.code).toContain('"%.2f".format(java.util.Locale.ROOT,')
  })
  it('Swift needs no change — String(format:) with no locale is already invariant', () => {
    const r = swiftOf(APP(`  const out = computed(() => (nums()[0] / 2).toFixed(2))`))
    expect(r.code).toContain('String(format: "%.2f"')
    expect(r.code).not.toContain('locale:')
  })
})

describe('`||` / `&&` on a non-boolean operand is loud', () => {
  it('warns by name and names the fix', () => {
    const src = APP(`  const out = computed(() => s() || "anon")`, 'out()')
    for (const r of [swiftOf(src), kotlinOf(src)]) {
      expect(r.warnings.join(' ')).toContain('with a non-boolean left operand (`string`)')
      expect(r.warnings.join(' ')).toContain('Use `??`')
    }
  })
  it('a genuinely boolean `&&` stays silent', () => {
    const src = APP(`  const ok = signal<boolean>(true)\n  const out = computed(() => ok() && s().length > 0)`)
    for (const r of [swiftOf(src), kotlinOf(src)]) {
      expect(r.warnings.filter((w) => w.includes('non-boolean'))).toEqual([])
    }
  })
})

describe('`{arr.map(x => <JSX/>)}` as a child is loud and points at <For>', () => {
  const MAP = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const items = signal<string[]>(['a','b'])
  return (<Stack>{items().map((i: string) => <Text>{i}</Text>)}</Stack>)
}`
  const FOR = `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const items = signal<string[]>(['a','b'])
  return (<Stack><For each={items} by={(i: string) => i}>{(i: string) => <Text>{i}</Text>}</For></Stack>)
}`
  it('the .map() form warns on both targets', () => {
    for (const r of [swiftOf(MAP), kotlinOf(MAP)]) {
      expect(r.warnings.join(' ')).toContain('does NOT lower to a list on iOS or Android')
      expect(r.warnings.join(' ')).toContain('<For each={items}')
    }
  })
  it('the <For> form is silent', () => {
    for (const r of [swiftOf(FOR), kotlinOf(FOR)]) {
      expect(r.warnings.filter((w) => w.includes('does NOT lower to a list'))).toEqual([])
    }
  })
})

describe('<For> without `by` resolves the identity instead of assuming `.id`', () => {
  const P = (extra: string, elem: string, init: string) =>
    `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
${extra}export function App(){
  const rows = signal<${elem}[]>(${init})
  return (<Stack><For each={rows}>{(r: ${elem}) => <Text>{String(r)}</Text>}</For></Stack>)
}`
  const PRIMITIVE = P('', 'string', `['a','b']`)
  const NO_ID = P(`type Row = { label: string }\n`, 'Row', `[{ label: 'a' }]`)
  const WITH_ID = P(`type Row = { id: string }\n`, 'Row', `[{ id: 'a' }]`)

  it('a PRIMITIVE element keys on the value itself', () => {
    expect(swiftOf(PRIMITIVE).code).toContain('ForEach(rows, id: \\.self)')
    expect(kotlinOf(PRIMITIVE).code).toContain('key = { it }')
    expect(swiftOf(PRIMITIVE).warnings).toEqual([])
  })
  it('a struct with NO `id` warns by name', () => {
    for (const [r, target] of [[swiftOf(NO_ID), 'iOS'], [kotlinOf(NO_ID), 'Android']] as const) {
      expect(r.warnings.join(' ')).toContain('without a `by` key')
      expect(r.warnings.join(' ')).toContain('`Row`, which has no `id` field')
      expect(r.warnings.join(' ')).toContain(target)
    }
  })
  it('a struct WITH `id` is unchanged and silent', () => {
    expect(swiftOf(WITH_ID).code).toContain('ForEach(rows, id: \\.id)')
    expect(swiftOf(WITH_ID).warnings).toEqual([])
    expect(kotlinOf(WITH_ID).warnings).toEqual([])
  })

  it('swiftc accepts a primitive <For> with no `by`', { skip: !isSwiftcAvailable() }, () => {
    const r = validateSwiftWithStubs(swiftOf(PRIMITIVE).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it('kotlinc accepts a primitive <For> with no `by`', { skip: !isKotlincAvailable() }, () => {
    const r = validateKotlin(kotlinOf(PRIMITIVE).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('a DYNAMIC baked prop is named instead of dropped', () => {
  const V = (prop: string, value: string) =>
    `import { signal } from '@pyreon/reactivity'
import { Stack, Video } from '@pyreon/primitives'
export function App(){
  const on = signal<boolean>(true)
  return (<Stack><Video src="/a.mp4" ${prop}={${value}} /></Stack>)
}`
  for (const prop of ['controls', 'muted', 'loop', 'autoPlay']) {
    it(`<Video ${prop}={sig()}> warns on both targets`, () => {
      for (const r of [swiftOf(V(prop, 'on()')), kotlinOf(V(prop, 'on()'))]) {
        expect(r.warnings.join(' ')).toContain(`<Video ${prop}> was given a non-static value`)
      }
    })
  }
  it('a STATIC value stays silent (no false positive)', () => {
    for (const r of [swiftOf(V('controls', 'false')), kotlinOf(V('controls', 'false'))]) {
      expect(r.warnings.filter((w) => w.includes('non-static value'))).toEqual([])
    }
  })
  it('<Text truncate={sig()}> warns; a static one does not', () => {
    const T = (v: string) =>
      `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const on = signal<boolean>(true)
  return (<Stack><Text truncate={${v}}>hi</Text></Stack>)
}`
    for (const r of [swiftOf(T('on()')), kotlinOf(T('on()'))]) {
      expect(r.warnings.join(' ')).toContain('<Text truncate> was given a non-static value')
    }
    for (const r of [swiftOf(T('true')), kotlinOf(T('true'))]) {
      expect(r.warnings.filter((w) => w.includes('non-static value'))).toEqual([])
    }
  })
})

describe('every lifecycle-emitting decl gets a stable-identity Swift host', () => {
  // A `.task` / `.onAppear` attached to a transparent `Group { if … else … }`
  // is redistributed onto the BRANCHES, so SwiftUI cancels and re-applies it
  // on every flip. `sortable` / `form` / `rate-limited` / `hotkey` all emit a
  // lifecycle modifier and were missing from the hand-listed gate.
  const SORTABLE = `import { signal } from '@pyreon/reactivity'
import { useSortable } from '@pyreon/table'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const rows = signal<string[]>(['a'])
  const sort = useSortable({ items: () => rows(), by: (r: string) => r, onReorder: (n: string[]) => rows.set(n) })
  return (<Stack><Text>{String(rows().length)}</Text></Stack>)
}`
  it('a useSortable component body is wrapped in a ZStack', () => {
    const code = swiftOf(SORTABLE).code
    expect(code).toContain('.onAppear {')
    expect(code).toContain('ZStack {')
  })
})
