// Zero-silent-drops (P1): a NEGATIVE-index `.slice` — `arr.slice(-1)` (last
// element/N) / `arr.slice(0, -1)` (all but last N) — was mis-emitted on BOTH
// targets. The existing slice lowering (`dropFirst`/`prefix` Swift, `drop`/
// `take` Kotlin) counts from the FRONT and explicitly BAILED on any unary-minus
// arg, so the raw `.slice(-1)` survived → `[T] has no member 'slice'` (Swift) /
// invalid (Kotlin). Last-N / drop-last-N is a common idiom (recent items,
// pagination tails) → a clean-parse but uncompilable silent mis-emit.
//
// Fixed by lowering the two dominant negative idioms to the native count-from-
// the-end methods, via one shared `classifyNegativeSlice(args, emitArg)`
// (infer-type.ts):
//   slice(-m)    → Swift suffix(m)   / Kotlin takeLast(m)
//   slice(0, -n) → Swift dropLast(n) / Kotlin dropLast(n)
// Other negative combos (`slice(1, -1)`, `slice(-2, -1)`) are rarer + ambiguous
// to clamp — they return null and fall through to the existing non-negative
// path (still unsupported, an honest follow-up). NON-negative slices are
// unchanged.
//
// Bisect-load-bearing: neuter `classifyNegativeSlice` → null → both negative
// idioms fall through to the bail; the negative-emit + compile specs fail, the
// non-negative control stays green.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const wrap = (expr: string) =>
  `import { signal, computed } from '@pyreon/reactivity'\n` +
  `import { Stack, Text } from '@pyreon/primitives'\n` +
  `export function App(){\n` +
  `  const a = signal([1, 2, 3, 4])\n` +
  `  const out = computed(() => String(${expr}))\n` +
  `  return (<Stack><Text>{out}</Text></Stack>)\n}`

const sw = (expr: string) => transform(wrap(expr), { target: 'swift' }).code
const kt = (expr: string) => transform(wrap(expr), { target: 'kotlin' }).code

describe('P1 — negative-index .slice lowers (last-N / drop-last-N)', () => {
  it('Swift: `slice(-m)` → `suffix(m)`, `slice(0, -n)` → `dropLast(n)`', () => {
    expect(sw(`a().slice(-1).length`)).toContain('.suffix(1)')
    expect(sw(`a().slice(0, -2).length`)).toContain('.dropLast(2)')
  })
  it('Kotlin: `slice(-m)` → `takeLast(m)`, `slice(0, -n)` → `dropLast(n)`', () => {
    expect(kt(`a().slice(-1).length`)).toContain('.takeLast(1)')
    expect(kt(`a().slice(0, -2).length`)).toContain('.dropLast(2)')
  })

  // Non-negative slices must be unchanged (front-counting drop/take/prefix).
  it('Swift/Kotlin: a non-negative `slice(1, 3)` is unchanged', () => {
    expect(sw(`a().slice(1, 3).length`)).toContain('.dropFirst(1)')
    expect(sw(`a().slice(1, 3).length`)).not.toContain('suffix')
    expect(kt(`a().slice(1, 3).length`)).toContain('.drop(1)')
  })

  // Real proof: the two negative idioms COMPILE.
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: `slice(-1)` + `slice(0, -1)` TYPECHECK against real SwiftUI',
    () => {
      expect(validateSwiftTypecheck(sw(`a().slice(-1).length`)).ok).toBe(true)
      expect(validateSwiftTypecheck(sw(`a().slice(0, -1).length`)).ok).toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())('Android: the same compile via kotlinc', () => {
    expect(validateKotlin(kt(`a().slice(-1).length`)).ok).toBe(true)
    expect(validateKotlin(kt(`a().slice(0, -1).length`)).ok).toBe(true)
  })
})
