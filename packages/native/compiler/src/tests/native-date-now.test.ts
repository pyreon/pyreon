// Zero-silent-drops (P1) — `Date.now()` faithful lowering (both targets).
//
// `Date.now()` emitted VERBATIM on both targets — a clean-parse silent
// mis-emit (0 warnings): Foundation's `Date` resolves as a TYPE on Swift so
// the call failed "cannot call value of non-function type 'Date'"; Kotlin
// failed "unresolved reference 'Date'".
//
// Lowering: JS ms-since-epoch (~1.7e12) OVERFLOWS Kotlin's 32-bit Int
// (PMTC's `number` → Int default), so the one lossless cross-target carrier
// is Double (exact for ms < 2^53):
//   Swift  → `(Date().timeIntervalSince1970 * 1000)`
//   Kotlin → `System.currentTimeMillis().toDouble()`
// The inference types it `{ number, float: true }`, so the Int×Double
// coercion machinery makes mixed arithmetic (`Date.now() - start()`) work,
// and `Math.floor(Date.now() / 1000)` composes with the Math return-type
// inference (→ Int). Other `Date.*` statics (`Date.parse`, …) have no
// faithful mapping → NAMED build-failing warning, never a silent drop.
//
// KNOWN, DISCLOSED limitation (pre-existing, general — not Date-specific):
// `.set(<float expr>)` into an Int-typed signal (`signal<number>(0)` +
// `start.set(Date.now())` — the stopwatch shape) fails LOUD with a native
// type error on both targets; `price.set(1.5)` fails identically. The
// write-site float-WIDENING of a signal's declared type is the tracked
// follow-up.
//
// Bisect-load-bearing: (1) neuter the inference case → the Double
// annotation specs degrade; (2) neuter the Swift emit → verbatim Date.now()
// + the iOS proof fails; (3) neuter the Kotlin emit → the Kotlin spec +
// Android proof fail.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const sw = (src: string) => transform(src, { target: 'swift' })
const kt = (src: string) => transform(src, { target: 'kotlin' })

const ELAPSED = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const start = signal<number>(0.5)
  const out = computed(() => Date.now() - start())
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`

describe('P1 — Date.now() lowering (both targets)', () => {
  it('Swift: `Date.now()` lowers to epoch-ms Double (no verbatim Date.now())', () => {
    const rs = sw(ELAPSED)
    expect(rs.code).toContain('(Date().timeIntervalSince1970 * 1000)')
    expect(rs.code).not.toContain('Date.now()')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Swift: the elapsed computed annotates Double (float inference)', () => {
    expect(sw(ELAPSED).code).toContain('var out: Double {')
  })
  it('Swift: a BARE `Date.now()` computed annotates Double (isolates the inference case — no float operand to piggyback on)', () => {
    const rs = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const out = computed(() => Date.now())
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`)
    expect(rs.code).toContain('var out: Double {')
    expect(rs.code).not.toContain('var out: Any {')
  })
  it('Kotlin: lowers to `System.currentTimeMillis().toDouble()`', () => {
    const rk = kt(ELAPSED)
    expect(rk.code).toContain('System.currentTimeMillis().toDouble()')
    expect(rk.code).not.toContain('Date.now()')
    expect(rk.warnings).toHaveLength(0)
  })
  it('composes: `Math.floor(Date.now() / 1000)` stays an Int computed', () => {
    const rs = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const out = computed(() => Math.floor(Date.now() / 1000))
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`)
    expect(rs.code).toContain('var out: Int {')
  })

  // Guard — other Date.* statics warn LOUD, never silent.
  it('guard: `Date.parse(...)` keeps a NAMED build-failing warning', () => {
    const rs = sw(`import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const out = computed(() => Date.parse("2026-01-01"))
  return (<Stack><Text>{String(out())}</Text></Stack>)
}`)
    expect(rs.warnings.some((w) => w.includes('Date.parse'))).toBe(true)
    expect(rs.code).toContain('Date.parse')
  })

  // Compile proof — elapsed-time component through real swiftc + kotlinc.
  const proof = `import { signal, computed } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const start = signal<number>(0.5)
  const elapsed = computed(() => Date.now() - start())
  const seconds = computed(() => Math.floor(Date.now() / 1000))
  const out = computed(() => String(elapsed()) + " " + String(seconds()))
  return (<Stack><Text>{out()}</Text></Stack>)
}`
  it.skipIf(!isSwiftUIAvailable())('iOS: the elapsed-time component TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(sw(proof).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same component compiles via kotlinc', () => {
    const r = validateKotlin(kt(proof).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
