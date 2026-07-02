// Zero-silent-drops (P1) — idiom-sweep batch 2: `!x`/`!!x` truthiness,
// `isNaN`, and the loud-guard conversions (String `.at`, multi-statement
// sort comparators). All five were SILENT fails on both targets.
//
// 1. `!x` on a NON-Boolean is JS truthiness negation ("type 'Int' cannot
//    be used as a boolean"), and `!!x` (truthiness→Bool) is doubly broken
//    (juxtaposed unary is a Swift parse error). Lowered by the arg's
//    inferred type on both targets: number → `== 0` / `!= 0`; string →
//    isEmpty / non-empty; boolean → verbatim; optional → nil/null check;
//    unknown → raw (loud). Mirrors the Boolean(x) semantics (#1977 —
//    unmerged; the two compose on merge, no shared code yet).
// 2. `isNaN(x)` — no such global natively. Int arg → statically `false`;
//    Double → the native `.isNaN`; unknown → NAMED warning. Infers boolean.
// 3. String `.at(i)` — the ARRAY lowering applied to a String emitted
//    uncompilable garbage on BOTH targets (Swift String indices aren't
//    Int; Kotlin's getOrNull yields Char? vs JS's String). Now gated to
//    array receivers; String .at warns NAMED.
// 4. A MULTI-STATEMENT sort comparator can't wrap in Swift's `< 0` Bool
//    conversion (the block-body sentinel silently dropped it) — NAMED
//    warning on both targets (cross-target parity); expression bodies
//    unchanged.
//
// Bisect-load-bearing: (1) neuter the Swift unary lowering → the !/!!
// specs fail; (2) the Kotlin mirror → its specs; (3) the isNaN inference
// → the Bool-annotation spec degrades to Any (isolating spec — the
// lowering alone leaves the annotation broken); (4) the .at gate → the
// String warn spec loses its warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const A = (body: string, read = 'String(out())') =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const nums = signal<number[]>([1, 2, 3])
  const s = signal<string>("hello")
${body}
  return (<Stack><Text>{${read}}</Text></Stack>)
}`

describe('P1 — truthiness unary + isNaN + loud guards (sweep batch 2)', () => {
  it('Swift: `!!x` on a number lowers to `(x != 0)`; `!x` to `(x == 0)`', () => {
    const dd = transform(A(`  const out = computed(() => !!s().length)`), { target: 'swift' })
    expect(dd.code).toContain('(s.count != 0)')
    const sn = transform(A(`  const out = computed(() => !nums().length)`), { target: 'swift' })
    expect(sn.code).toContain('(nums.count == 0)')
  })
  it('Kotlin: the truthiness mirror (`!= 0` / `isNotEmpty`)', () => {
    const dd = transform(A(`  const out = computed(() => !!s().length)`), { target: 'kotlin' })
    expect(dd.code).toContain('!= 0)')
    const st = transform(A(`  const out = computed(() => !s())`), { target: 'kotlin' })
    expect(st.code).toContain('.isEmpty()')
  })
  it('control: `!b` on a Boolean stays verbatim on both targets', () => {
    const src = A(`  const b = signal<boolean>(true)
  const out = computed(() => !b())`)
    expect(transform(src, { target: 'swift' }).code).toContain('!b')
    expect(transform(src, { target: 'kotlin' }).code).toContain('!b')
  })
  it('isNaN: Int arg → statically false (Bool annotation — isolating spec); Double → .isNaN', () => {
    const i = transform(A(`  const out = computed(() => isNaN(nums()[0]))`), { target: 'swift' })
    expect(i.code).toContain('var out: Bool { false }')
    const d = transform(A(`  const out = computed(() => isNaN(nums()[0] / 2))`), { target: 'swift' })
    expect(d.code).toContain('.isNaN')
    const k = transform(A(`  const out = computed(() => isNaN(nums()[0] / 2))`), { target: 'kotlin' })
    expect(k.code).toContain('.isNaN()')
  })
  it('String .at warns NAMED on both targets (was uncompilable garbage); array .at unchanged', () => {
    const src = A(`  const out = computed(() => s().at(-1) ?? "")`, 'out()')
    expect(transform(src, { target: 'swift' }).warnings.some((w) => w.includes('String.at'))).toBe(true)
    expect(transform(src, { target: 'kotlin' }).warnings.some((w) => w.includes('String.at'))).toBe(true)
    const arr = transform(A(`  const out = computed(() => nums().at(0) ?? 0)`), { target: 'swift' })
    expect(arr.warnings).toHaveLength(0)
    expect(arr.code).toContain('indices.contains')
  })
  it('multi-statement sort comparator warns NAMED on both targets; expression body unchanged', () => {
    const multi = A(`  const out = computed(() => [...nums()].sort((a: number, b: number) => { if (a === b) return 0; return a - b })[0])`)
    expect(transform(multi, { target: 'swift' }).warnings.some((w) => w.includes('.sort with a multi-statement'))).toBe(true)
    expect(transform(multi, { target: 'kotlin' }).warnings.some((w) => w.includes('.sort with a multi-statement'))).toBe(true)
    const expr = transform(A(`  const out = computed(() => [...nums()].sort((a: number, b: number) => a - b)[0])`), { target: 'swift' })
    expect(expr.code).toContain('sorted(by:')
    expect(expr.warnings).toHaveLength(0)
  })

  // Compile proof — truthiness + isNaN in one component through both compilers.
  const proof = A(`  const hasItems = computed(() => !!nums().length)
  const empty = computed(() => !s())
  const bad = computed(() => isNaN(nums()[0] / 2))
  const out = computed(() => String(hasItems()) + String(empty()) + String(bad()))`, 'out()')
  it.skipIf(!isSwiftUIAvailable())('iOS: the truthiness component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(proof, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(proof, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
