// Zero-silent-drops (P1) — a computed RETURNING a `Math.*` call had no inference
// case, so it typed `Any` on Swift (`private var pageCount: Any { ceil(…) }`) and
// a downstream `String(pageCount())` / arithmetic / comparison failed ("no exact
// matches in call to initializer" / "cannot convert 'Any' to 'Int'"). Surfaced by
// compiling a realistic paginated data-table end-to-end.
//
// The faithful fix (not just "infer a number") splits by JS semantics:
//   • ceil/floor/round/trunc are INTEGER-VALUED in JS (page counts, indices) →
//     inferType returns Int AND the Swift emit wraps the Double free-function
//     result `Int(ceil(Double(x)))`, so the value stays an Int usable in
//     `page < pageCount` and prints "4" not "4.0". (Inferring Double — matching
//     the OLD `ceil(Double(x))` emit — was a half-fix: `page() < pageCount()`
//     then failed `Int < Double`.)
//   • sqrt/pow + the trig/log/exp free functions → Double (irrational results).
//   • abs → preserves the arg's numeric type (`abs(Int)` stays Int).
//   • min/max → the args' common type (Double if any arg is fractional).
// Kotlin's `derivedStateOf` infers on its own (and allows Int↔Double comparison),
// so Kotlin already compiled — this fixes Swift's annotation. `inferMathCall`
// (infer-type.ts) is the shared inference helper; the Swift emit change lives in
// emit-swift.ts's Math.* switch.
//
// Bisect-load-bearing: neuter `inferMathCall` → a `Math.ceil` computed re-types
// `Any`, the `: Int` emit-shape spec + the compile proofs fail; the boolean /
// Double controls stay green.

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
  // ceil/floor/round/trunc → Int, emitted `Int(ceil(Double(…)))`.
  it('Swift: ceil/floor/round/trunc computeds type Int (emit `Int(…)`)', () => {
    for (const [fn, wrap] of [
      ['ceil', 'Int(ceil('],
      ['floor', 'Int(floor('],
      ['round', 'Int((Double'],
      ['trunc', 'Int(trunc('],
    ] as const) {
      const code = sw(C(`  const pc=computed(()=>Math.${fn}(rows().length/2))`))
      expect(code, fn).toContain('private var pc: Int')
      expect(code, fn).toContain(wrap)
      expect(code, fn).not.toContain('pc: Any')
      expect(code, fn).not.toContain('pc: Double')
    }
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

  // Kotlin unaffected (derivedStateOf infers) — still references the Math call.
  it('Kotlin: a Math.ceil computed still emits (unchanged)', () => {
    expect(kt(C(`  const pc=computed(()=>Math.ceil(rows().length/2))`))).toContain('ceil')
  })

  // Compile proofs — the Int result works in String(), arithmetic AND an
  // Int-context comparison; a Double result (sqrt) works in String(); the
  // headline paginated DATA-TABLE compiles end-to-end.
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
