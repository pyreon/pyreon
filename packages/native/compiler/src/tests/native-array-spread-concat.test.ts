// Zero-silent-drops (P1): an array literal with spreads — `[...a, ...b]` /
// `[...a, 9]` / `[9, ...a]` — was mis-emitted on BOTH targets. Two bugs:
//
//   (1) MULTI-SPREAD: `[...a, ...b]` emitted `a + [b]` (Swift) / `a + listOf(b)`
//       (Kotlin) — the SECOND spread's argument got wrapped in a literal
//       instead of concatenated bare. The result is the wrong type (`[Int] +
//       [[Int]]` / `List + List<List>`) → swiftc/kotlinc reject it (Kotlin
//       "cannot infer type parameter R"); only the FIRST leading spread was
//       ever unwrapped.
//   (2) MISSING PARENS: `[...a, 9].length` emitted `a + [9].count` — the
//       `.count` bound to the trailing `[9]`, not the whole concat → `[Int] +
//       Int` type error. The concat needed parenthesising.
//
// The add-to-list idiom `signal.set([...items(), newItem])` happened to work
// (a single leading spread + tail in a bare-arg position needs no parens), so
// the bug hid until a SECOND spread or a method applied to the literal.
//
// Fixed by one shared, target-neutral `buildArraySpreadConcat(elements, emitEl,
// litWrap)` (infer-type.ts): emits each spread's argument bare, groups
// consecutive non-spreads into a literal (`[…]` Swift / `listOf(…)` Kotlin),
// joins with ` + `, and PARENTHESISES for ≥2 parts — any spread count, any
// position. 1-element / no-spread literals are unchanged.
//
// Bisect-load-bearing: neuter `buildArraySpreadConcat` → null → both emitters
// fall through to the plain-literal emit (which can't express a spread); the
// spread emit + compile specs fail, the no-spread control stays green.

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
  `  const a = signal([1, 2]); const b = signal([3, 4])\n` +
  `  const out = computed(() => String(${expr}))\n` +
  `  return (<Stack><Text>{out}</Text></Stack>)\n}`

const sw = (expr: string) => transform(wrap(expr), { target: 'swift' }).code
const kt = (expr: string) => transform(wrap(expr), { target: 'kotlin' }).code

describe('P1 — array-spread concat (multi-spread + parens) lowers correctly', () => {
  it('Swift: multi-spread `[...a, ...b]` → `a + b` (NOT `a + [b]`)', () => {
    const code = sw(`[...a(), ...b()].length`)
    expect(code).toContain('a + b')
    expect(code).not.toContain('a + [b]')
  })
  it('Swift: `[...a, 9]` is parenthesised → `(a + [9])` (so `.count` chains)', () => {
    expect(sw(`[...a(), 9].length`)).toContain('(a + [9])')
  })
  it('Kotlin: multi-spread `[...a, ...b]` → `a + b` (NOT `a + listOf(b)`)', () => {
    const code = kt(`[...a(), ...b()].length`)
    expect(code).toContain('a + b')
    expect(code).not.toContain('a + listOf(b)')
  })
  it('Kotlin: `[...a, 9]` is parenthesised → `(a + listOf(9))`', () => {
    expect(kt(`[...a(), 9].length`)).toContain('(a + listOf(9))')
  })

  // No-spread control — must stay a plain literal (no concat / parens).
  it('Swift/Kotlin: a no-spread `[9, 10]` stays a plain literal', () => {
    expect(sw(`[9, 10].length`)).toContain('[9, 10]')
    expect(kt(`[9, 10].length`)).toContain('listOf(9, 10)')
  })

  // Real proof: multi-spread + a method chain on the literal COMPILE.
  it.skipIf(!isSwiftUIAvailable())(
    'iOS: multi-spread + chained `.map` TYPECHECK against real SwiftUI',
    () => {
      const r = validateSwiftTypecheck(sw(`[...a(), 9, ...b()].map(x => x * 2).length`))
      expect(r.ok, r.error ?? '').toBe(true)
    },
  )
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(kt(`[...a(), 9, ...b()].map(x => x * 2).length`))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
