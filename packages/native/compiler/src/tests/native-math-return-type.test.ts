// Zero-silent-drops (P1) — a computed RETURNING a `Math.*` call had no inference
// case, so it typed `Any` on Swift (`private var pageCount: Any { ceil(…) }`) and
// a downstream `String(pageCount())` / arithmetic / comparison failed ("no exact
// matches in call to initializer" / "cannot convert 'Any' to 'Int'"). Surfaced by
// compiling a realistic paginated data-table end-to-end.
//
// The faithful fix (not just "infer a number") splits by JS semantics:
//   • ceil/floor/round/trunc return a NUMBER in JS — inferType returns
//     Double and the Swift emit is the bare Double free function. The
//     earlier `Int(ceil(Double(x)))` wrap closed `page() < pageCount()`
//     (`Int < Double`) but poisoned every downstream mixed expression
//     (`Math.floor(min/step) * step` → 'Int * Double', 18 errors on the
//     charts engine bundle). The Int-context uses now survive via the
//     binary-op coercion (`Double(page) < pageCount`) — asserted below —
//     and a float-typed INDEX re-wraps `Int(...)` at the subscript.
//   • sqrt/pow + the trig/log/exp free functions → Double (irrational results).
//   • abs → preserves the arg's numeric type (`abs(Int)` stays Int).
//   • min/max → the args' common type (Double if any arg is fractional).
// Kotlin's `derivedStateOf` infers on its own (and allows Int↔Double comparison),
// so Kotlin already compiled — this fixes Swift's annotation. `inferMathCall`
// (infer-type.ts) is the shared inference helper; the Swift emit change lives in
// emit-swift.ts's Math.* switch.
//
// Bisect-load-bearing: neuter `inferMathCall` → a `Math.ceil` computed re-types
// `Any`, the `: Double` emit-shape spec + the compile proofs fail; the
// abs/max Int controls stay green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const sw = (src: string) => transform(src, { target: 'swift' }).code
const kt = (src: string) => transform(src, { target: 'kotlin' }).code

const C = (body: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){
  const rows = signal<number[]>([1, 2, 3, 4, 5])
${body}
  return (<Stack><Text>{String(pc())}</Text></Stack>)
}`

describe('P1 — Math.* computed return-type inference (Swift)', () => {
  const intUse = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App(){
  const rows = signal<number[]>([1, 2, 3, 4, 5])
  const page = signal(0)
  const pageCount = computed(() => Math.ceil(rows().length / 2))
  const next = () => { if (page() < pageCount() - 1) { page.set(page() + 1) } }
  return (<Stack>
    <Text>{"Page " + String(page() + 1) + " of " + String(pageCount())}</Text>
    <Button onPress={next}>Next</Button>
  </Stack>)
}`
  // ceil/floor/round/trunc → Double (JS number), bare free functions.
  it('Swift: ceil/floor/round/trunc computeds type Double (no Int wrap)', () => {
    for (const [fn, wrap] of [
      ['ceil', 'ceil('],
      ['floor', 'floor('],
      ['round', '.rounded()'],
      ['trunc', 'trunc('],
    ] as const) {
      const code = sw(C(`  const pc=computed(()=>Math.${fn}(rows().length/2))`))
      expect(code, fn).toContain('private var pc: Double')
      expect(code, fn).toContain(wrap)
      expect(code, fn).not.toContain('pc: Any')
      expect(code, fn).not.toContain('Int(' + wrap)
    }
  })

  // The Int-context comparison that motivated the OLD Int wrap now
  // survives via binary-op coercion: the Int side wraps Double(...).
  it('Swift: Int page vs Double pageCount comparison coerces', () => {
    const code = sw(intUse)
    expect(code).toContain('Double(page) < pageCount')
  })

  // A float-typed index re-wraps Int(...) at the subscript.
  it('Swift: array index by Math.floor re-wraps Int', () => {
    const code = sw(C(`  const pc=computed(()=>rows()[Math.floor(1.4)]!)`))
    expect(code).toContain('[Int(floor(')
  })

  // A count-loop counter is an Int local — its body's mixed arithmetic
  // coerces (`first + step * Double(i)`), the charts tick-loop shape.
  it('Swift: count-loop counter coerces against a Double', () => {
    const code = sw(`
  function ticks(first: Double, step: Double, n: Double): Double[] {
    const out: Double[] = []
    for (let i = 0; i < n; i++) {
      const v = first + step * i
      out.push(v)
    }
    return out
  }
  export function P() { return <Text>{String(ticks(0.0, 2.0, 3.0).length)}</Text> }
`)
    expect(code).toContain('step * Double(i)')
    // and a Double bound cannot be a Range<Double> — it wraps to Int
    expect(code).toContain('0..<Int(ceil(Double(n)))')
  })

  it('Kotlin: array index by Math.floor re-wraps toInt()', () => {
    const code = kt(C(`  const pc=computed(()=>rows()[Math.floor(1.4)]!)`))
    expect(code).toContain('.toInt()]')
  })

  // sqrt/pow → Double.
  it('Swift: sqrt/pow computeds type Double', () => {
    expect(sw(C(`  const pc=computed(()=>Math.sqrt(rows().length))`))).toContain(
      'private var pc: Double',
    )
    expect(sw(C(`  const pc=computed(()=>Math.pow(rows().length,2))`))).toContain(
      'private var pc: Double',
    )
  })

  // abs/max on Int args stay Int (generic, not coerced).
  it('Swift: abs/max on Int args stay Int', () => {
    expect(sw(C(`  const pc=computed(()=>Math.abs(rows().length-9))`))).toContain(
      'private var pc: Int',
    )
    expect(sw(C(`  const pc=computed(()=>Math.max(rows().length,3))`))).toContain(
      'private var pc: Int',
    )
  })

  // String(float) routes through the JS-faithful formatter on BOTH targets
  // — Swift String(3.0) is "3.0", Kotlin 3.0.toString() is "3.0", the web
  // prints "3"; a numeric label must read identically on all three.
  it('String(Double) formats like JS on both targets', () => {
    const swCode = sw(C(`  const pc=computed(()=>Math.ceil(rows().length/2))`))
    expect(swCode).toContain('pyreonNumString(pc)')
    expect(swCode).toContain('func pyreonNumString')
    const ktCode = kt(C(`  const pc=computed(()=>Math.ceil(rows().length/2.0))`))
    expect(ktCode).toContain('pyreonNumString(')
    expect(ktCode).toContain('fun pyreonNumString')
  })

  // An Int arg keeps the plain String()/toString() emit — no helper included.
  it('String(Int) stays verbatim, helper not included', () => {
    const swCode = sw(C(`  const pc=computed(()=>rows().length)`))
    expect(swCode).not.toContain('pyreonNumString')
  })

  // Kotlin unaffected (derivedStateOf infers) — still references the Math call.
  it('Kotlin: a Math.ceil computed still emits (unchanged)', () => {
    expect(kt(C(`  const pc=computed(()=>Math.ceil(rows().length/2))`))).toContain('ceil')
  })

  // Compile proofs — the Int result works in String(), arithmetic AND an
  // Int-context comparison; a Double result (sqrt) works in String(); the
  // headline paginated DATA-TABLE compiles end-to-end.
  const dataTable = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Inline, Text, Button } from '@pyreon/primitives'
type Row = { id: number; name: string; score: number }
export function DataTable(){
  const rows = signal<Row[]>([{ id: 1, name: "a", score: 30 }, { id: 2, name: "b", score: 10 }])
  const page = signal(0)
  const pageCount = computed(() => Math.ceil(rows().length / 2))
  const total = computed(() => rows().reduce((sum, r) => sum + r.score, 0))
  const avg = computed(() => rows().length > 0 ? total() / rows().length : 0)
  const next = () => { if (page() < pageCount() - 1) { page.set(page() + 1) } }
  return (<Stack gap="md">
    <Text>{"Total: " + String(total()) + " Avg: " + String(avg())}</Text>
    <Text>{"Page " + String(page() + 1) + " of " + String(pageCount())}</Text>
    <Inline gap="sm"><Button onPress={next}>Next</Button></Inline>
  </Stack>)
}`
  const sqrtUse = C(`  const pc=computed(()=>Math.sqrt(rows().length))`)

  it.skipIf(!isSwiftUIAvailable())('iOS: Int-context + sqrt + the data-table TYPECHECK', () => {
    for (const src of [intUse, sqrtUse, dataTable]) {
      const r = validateSwiftTypecheck(sw(src))
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
  it.skipIf(!isKotlincAvailable())('Android: the same components compile via kotlinc', () => {
    for (const src of [intUse, sqrtUse, dataTable]) {
      const r = validateKotlin(kt(src))
      expect(r.ok, r.error ?? '').toBe(true)
    }
  })
})
