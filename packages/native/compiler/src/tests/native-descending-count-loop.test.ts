import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

// Descending count-loops (`for (let i = n; i >= 0; i--)` / `i -= k`) lower to
// Swift negative-step stride / Kotlin `downTo` instead of warn-DROPPING the
// loop body. Surfaced by the charts engine's `arcPolygon`: its inner-edge
// reverse walk was silently gutted (compile-green `return pts` with no loop),
// which would have broken every pie/donut/gauge on native. The same PR defers
// the component-classifier's bare-call warning so a helper the helper path
// emits COMPLETELY (charts' `smooth`) no longer false-warns "DROPPED".
//
// Bisect-load-bearing: revert the `descending` arm in classifyForRange → the
// stride/downTo specs fail with the count-loop warning present; revert the
// droppedStmtWarnings deferral → the zero-warnings helper spec fails.

const sw = (src: string) => transform(src, { target: 'swift' })
const kt = (src: string) => transform(src, { target: 'kotlin' })

const DESC = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const run = () => {
    for (let i = 5; i >= 0; i--) {
      n.set(n() + i)
    }
    for (let j = 10; j > 0; j -= 2) {
      n.set(n() + j)
    }
  }
  return <Stack gap="sm"><Button onPress={() => run()}>go</Button></Stack>
}`

const MIXED = `
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const run = () => {
    for (let i = 0; i < 5; i--) {
      n.set(n() + i)
    }
  }
  return <Stack gap="sm"><Button onPress={() => run()}>go</Button></Stack>
}`

// The arcPolygon shape: an ascending outer walk + a descending inner walk in
// one helper, both feeding push — the exact charts-engine function that was
// silently gutted.
const ARC = `
import { Stack, Text } from '@pyreon/primitives'
type Double = number
interface Pt { x: Double; y: Double }
function ring(steps: number): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push({ x: i * 1.0, y: 0.0 })
  }
  for (let i = steps; i >= 0; i--) {
    pts.push({ x: i * 1.0, y: 1.0 })
  }
  return pts
}
export function App() {
  return <Stack><Text>{String(ring(4).length)}</Text></Stack>
}`

describe('descending count-loops lower to native', () => {
  it('Swift: inclusive `i--` and exclusive `i -= 2` emit negative strides', () => {
    const r = sw(DESC)
    expect(r.code).toContain('for i in stride(from: 5, through: 0, by: -1) {')
    expect(r.code).toContain('for j in stride(from: 10, to: 0, by: -2) {')
    expect(r.warnings).toEqual([])
  })

  it('Kotlin: inclusive downTo / exclusive downTo-plus-one with step', () => {
    const r = kt(DESC)
    expect(r.code).toContain('for (i in 5 downTo 0) {')
    expect(r.code).toContain('for (j in 10 downTo (0 + 1) step 2) {')
    expect(r.warnings).toEqual([])
  })

  it('mixed-direction (`i < n; i--`) still warns — it is an infinite loop in JS', () => {
    for (const r of [sw(MIXED), kt(MIXED)]) {
      expect(r.warnings.some((w) => String(w).includes('count-loop'))).toBe(true)
    }
  })

  it('a fractional EXCLUSIVE descending bound floors (JS `i > 2.5` bottoms at 3)', () => {
    const SRC = `
import { Stack, Text } from '@pyreon/primitives'
function walk(hi: number): number {
  let s = 0
  for (let i = hi; i > 2.5; i--) {
    s = s + i
  }
  return s
}
export function App() { return <Stack><Text>{String(walk(10))}</Text></Stack> }`
    expect(sw(SRC).code).toContain('to: Int(floor(Double(2.5)))')
    expect(kt(SRC).code).toContain('downTo (Math.floor(2.5).toInt() + 1)')
  })

  it('the arcPolygon shape emits BOTH walks with zero warnings on both targets', () => {
    for (const [r, needle] of [
      [sw(ARC), 'stride(from: steps, through: 0, by: -1)'],
      [kt(ARC), 'steps downTo 0'],
    ] as const) {
      expect(r.code).toContain(needle)
      expect(r.warnings).toEqual([])
    }
  })

  it('a helper with bare push calls no longer false-warns DROPPED (smooth shape)', () => {
    const SRC = `
import { Stack, Text } from '@pyreon/primitives'
type Double = number
interface Pt { x: Double; y: Double }
function smoothish(points: Pt[], out: Pt[]): Double {
  out.push(points[0]!)
  out.push(points[1]!)
  return 1.0
}
export function App() { return <Stack><Text>ok</Text></Stack> }`
    for (const r of [sw(SRC), kt(SRC)]) {
      expect(r.warnings.filter((w) => String(w).includes('DROPPED'))).toEqual([])
    }
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: the arc shape TYPECHECKS', () => {
    const r = validateSwiftTypecheck(sw(ARC).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the arc shape compiles via kotlinc', () => {
    const r = validateKotlin(kt(ARC).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
