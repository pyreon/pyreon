// Swift Math.* Double-domain mapping — correctness widening.
//
// The Swift Math emit mapped only round/floor/ceil/abs/sqrt/min/max/pow; the
// rest (hypot/sin/cos/tan/atan2/log/log10/log2/exp/cbrt/trunc/asin/acos/atan/
// sinh/cosh/tanh) fell through to the generic emit as `Math.hypot(...)` —
// INVALID Swift ("cannot find 'Math' in scope", confirmed via real
// `swiftc -typecheck`). Map them to the Foundation free function with each arg
// coerced to Double (Swift has no implicit Int→Double; `Double(x)` is identity
// on a Double, so coercion is safe for any arg type):
//
//   Math.hypot(3, 4) → hypot(Double(3), Double(4))
//   Math.sin(1)      → sin(Double(1))
//   Math.log(2)      → log(Double(2))         (natural log = JS Math.log)
//   Math.trunc(3.7)  → trunc(Double(3.7))
//
// Additive: the existing mappings (sqrt/pow/floor/ceil/abs/min/max/round) are
// untouched. Kotlin's mirror is the kotlin.math coercion fix; this is the
// Swift half.
//
// Verification rungs (honest):
//  - `swiftc -parse` (the harness rung) + emit-shape. The full set was ALSO
//    verified at the stronger `swiftc -typecheck` rung manually (standalone
//    `import Foundation` snippet of every emitted expr → 0 errors); the
//    harness only exposes -parse.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwift } from '../validate'

const app = (expr: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const v = computed(() => ${expr})
  return (<Stack><Text>x</Text></Stack>)
}`

const sw = (expr: string) => transform(app(expr), { target: 'swift' }).code

describe('Swift Math.* Double-domain mapping', () => {
  it('maps previously-unmapped fns to Foundation free functions (not invalid Math.X)', () => {
    expect(sw('Math.hypot(3, 4)')).toContain('hypot(Double(3), Double(4))')
    expect(sw('Math.sin(1)')).toContain('sin(Double(1))')
    expect(sw('Math.atan2(1, 2)')).toContain('atan2(Double(1), Double(2))')
    expect(sw('Math.log(2)')).toContain('log(Double(2))')
    expect(sw('Math.cbrt(8)')).toContain('cbrt(Double(8))')
    expect(sw('Math.trunc(3.7)')).toContain('trunc(Double(3.7))')
    // none of them emit the invalid `Math.<fn>` passthrough
    expect(sw('Math.hypot(3, 4)')).not.toContain('Math.hypot')
  })

  it('leaves the existing mappings untouched (sqrt / abs / max / pow)', () => {
    expect(sw('Math.sqrt(16)')).toContain('sqrt(16)')
    expect(sw('Math.abs(-5)')).toContain('abs(-5)')
    expect(sw('Math.max(1, 2)')).toContain('max(1, 2)')
    expect(sw('Math.pow(2, 3)')).toContain('pow(2, 3)')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: the new mappings parse via swiftc -parse', () => {
    const out = transform(
      `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const a = computed(() => Math.hypot(3, 4))
  const b = computed(() => Math.sin(1))
  const c = computed(() => Math.log10(100))
  const d = computed(() => Math.cbrt(8))
  return (<Stack><Text>x</Text></Stack>)
}`,
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
