// Bitwise binary operators (`& | ^ << >>`) — subset widening.
//
// These previously fell through the parser's arith/comparison maps to a
// warn + WRONG `+` fallback (`a & b` emitted `a + b`, silently corrupting
// the result if the warning was ignored). Now they lower to a real `binary`
// IR node and emit correctly per target:
//
//   Swift:  same symbols (`a & b`, `a << 2`) — native Int operators.
//   Kotlin: INFIX FUNCTIONS (`a and b`, `a shl 2`) — Kotlin has NO bitwise
//           symbols on Int.
//
// Precedence differs from JS on both targets (Swift `&` binds TIGHTER than
// `+`, the reverse of JS; Kotlin infix functions bind LOOSER than
// arithmetic), so a compound operand is parenthesized to preserve the
// JS-parsed grouping: `a & b + 1` is `a & (b + 1)` in JS, and emits as
// `a & (b + 1)` / `a and (b + 1)`.
//
// Verification rungs (honest):
//  - Kotlin: full `kotlinc` semantic typecheck (the infix functions resolve
//    + typecheck on Int — real proof).
//  - Swift: `swiftc -parse` (the harness rung — parse-only) + emit-shape.
//
// `>>>` (JS unsigned-right-shift, uint32 semantics) is deliberately NOT
// lowered — it has no faithful signed-Int equivalent and keeps the
// warn-fallback.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
function App() {
  const a = signal<number>(6)
  const b = signal<number>(3)
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe('bitwise operators', () => {
  it('Swift: emits native bitwise symbols (no `+` fallback, no warning)', () => {
    const r = transform(
      app(`  const andv = computed(() => a() & b())
  const orv = computed(() => a() | b())
  const xorv = computed(() => a() ^ b())
  const shl = computed(() => a() << 2)
  const shr = computed(() => a() >> 1)`),
      { target: 'swift' },
    )
    expect(r.code).toContain('a & b')
    expect(r.code).toContain('a | b')
    expect(r.code).toContain('a ^ b')
    expect(r.code).toContain('a << 2')
    expect(r.code).toContain('a >> 1')
    expect(r.warnings).toEqual([])
  })

  it('Kotlin: maps to infix functions and/or/xor/shl/shr (no warning)', () => {
    const r = transform(
      app(`  const andv = computed(() => a() & b())
  const orv = computed(() => a() | b())
  const xorv = computed(() => a() ^ b())
  const shl = computed(() => a() << 2)
  const shr = computed(() => a() >> 1)`),
      { target: 'kotlin' },
    )
    expect(r.code).toContain('a and b')
    expect(r.code).toContain('a or b')
    expect(r.code).toContain('a xor b')
    expect(r.code).toContain('a shl 2')
    expect(r.code).toContain('a shr 1')
    expect(r.warnings).toEqual([])
  })

  it('parenthesizes a compound operand to preserve JS grouping (both targets)', () => {
    // JS: `a & b + 1` === `a & (b + 1)` (`+` binds tighter than `&`).
    const body = `  const m = computed(() => a() & b() + 1)`
    expect(transform(app(body), { target: 'swift' }).code).toContain('a & (b + 1)')
    expect(transform(app(body), { target: 'kotlin' }).code).toContain('a and (b + 1)')
  })

  it('still warn-falls-back for `>>>` (unsigned shift — deliberately unsupported)', () => {
    const r = transform(app(`  const u = computed(() => a() >>> 1)`), { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('>>>'))).toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: bitwise emit parses via swiftc -parse', () => {
    const out = transform(
      app(`  const flags = computed(() => (a() & b()) | (a() ^ b()))
  const shifted = computed(() => a() << 2)
  const mixed = computed(() => a() & b() + 1)`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: bitwise infix emit typechecks via kotlinc', () => {
    const out = transform(
      app(`  const flags = computed(() => (a() & b()) | (a() ^ b()))
  const shifted = computed(() => a() << 2)
  const mixed = computed(() => a() & b() + 1)`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
