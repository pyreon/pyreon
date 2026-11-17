// Gestures row — `<Press onSwipeLeft/onSwipeRight>` swipe lowering (the
// swipe/drag half of the row; tap + long-press were M2.3).
//
// Swift: a HIGH-PRIORITY DragGesture (a simultaneous one let the
// Button's touch-up-inside action fire on a real swipe — device-found)
// with a horizontal-dominance guard and ±40pt end-translation threshold.
// Android: `pointerInput { detectHorizontalDragGestures }` — the detector
// is direction-locked so taps still reach `.clickable`; deltas ACCUMULATE
// per-move into `dragTotal`, reset in `onDragStart` because the detector
// loop lives for the composable's lifetime.
//
// Device proof lives in examples/native-router-demo-*'s swipe tests
// (real XCUITest `swipeLeft()` / Compose `performTouchInput`). This spec
// locks the EMIT SHAPE + is the bisect target.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SRC = `import { signal } from '@pyreon/reactivity'
export function App() {
  const dir = signal<string>('none')
  return (
    <VStack>
      <Text>Dir: {dir}</Text>
      <Press
        onPress={() => dir.set('tap')}
        onSwipeLeft={() => dir.set('left')}
        onSwipeRight={() => dir.set('right')}
        data-testid="swipe-zone"
      ><Text>Swipe me</Text></Press>
    </VStack>
  )
}`

describe('<Press onSwipeLeft/onSwipeRight> gesture emit', () => {
  it('Swift emits a HIGH-PRIORITY DragGesture with dominance guard + both branches', () => {
    const out = transform(SRC, { target: 'swift' })
    // HIGH-priority, not simultaneous — device-found: a simultaneous drag
    // let the Button's touch-up-inside action fire on a real swipe (the
    // status read 'tap'); highPriorityGesture claims drags >20pt while
    // taps fail the drag and pass through to the Button.
    expect(out.code).toContain('.highPriorityGesture(DragGesture(minimumDistance: 20).onEnded')
    expect(out.code).not.toContain('.simultaneousGesture(DragGesture')
    expect(out.code).toContain('abs(value.translation.width) > abs(value.translation.height)')
    expect(out.code).toMatch(/if value\.translation\.width < -40 \{ \(\{\s*dir = "left"/)
    expect(out.code).toMatch(/else if value\.translation\.width > 40 \{ \(\{\s*dir = "right"/)
    // The tap action still rides the Button — coexistence, not replacement.
    expect(out.code).toMatch(/Button\(action: \{\s*dir = "tap"/)
    expect(out.warnings).toEqual([])
  })

  it('Kotlin emits pointerInput + detectHorizontalDragGestures with per-gesture reset', () => {
    const out = transform(SRC, { target: 'kotlin' })
    // The threshold is 40 DP converted with the scope's density: drag deltas
    // are pixels, and a raw 40f fired at ~13 dp on a 3x screen (#4364).
    // Bisect-verified: the old emit fails these with the raw `40f` literal.
    expect(out.code).toContain(
      '.pointerInput(Unit) { val swipeThreshold = 40.dp.toPx(); var dragTotal = 0f; detectHorizontalDragGestures(',
    )
    expect(out.code).not.toMatch(/dragTotal [<>] -?40f/)
    expect(out.code).toContain('onDragStart = { dragTotal = 0f }')
    expect(out.code).toMatch(/if \(dragTotal < -swipeThreshold\) run\(\{\s*dir = "left"/)
    expect(out.code).toMatch(/else if \(dragTotal > swipeThreshold\) run\(\{\s*dir = "right"/)
    expect(out.code).toContain('onHorizontalDrag = { _, amount -> dragTotal += amount }')
    // clickable still present — swipe composes with tap.
    expect(out.code).toContain('.clickable(onClick = {')
    expect(out.warnings).toEqual([])
  })

  it('a single-direction swipe emits only that branch (no else, no dead handler)', () => {
    const one = `export function App() {
      const n = signal<number>(0)
      return <Press onSwipeLeft={() => n.set(1)}><Text>x</Text></Press>
    }`
    const swift = transform(`import { signal } from '@pyreon/reactivity'\n${one}`, {
      target: 'swift',
    })
    expect(swift.code).toContain('value.translation.width < -40')
    expect(swift.code).not.toContain('value.translation.width > 40')
    const kotlin = transform(`import { signal } from '@pyreon/reactivity'\n${one}`, {
      target: 'kotlin',
    })
    expect(kotlin.code).toContain('dragTotal < -swipeThreshold')
    expect(kotlin.code).not.toContain('dragTotal > swipeThreshold')
  })

  it('a swipe-only <Press> (no onPress/onLongPress) does NOT warn', () => {
    const swipeOnly = `export function App() {
      const n = signal<number>(0)
      return <Press onSwipeRight={() => n.set(1)}><Text>x</Text></Press>
    }`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(`import { signal } from '@pyreon/reactivity'\n${swipeOnly}`, { target })
      expect(
        out.warnings.some((w) => w.includes('without an `onPress`')),
        `${target}: ${JSON.stringify(out.warnings)}`,
      ).toBe(false)
    }
  })
})

// Vertical swipe (GES-1): `onSwipeUp` / `onSwipeDown` ride the same drag on
// iOS behind a vertical-dominance guard, and a second direction-locked
// detector (`detectVerticalDragGestures`) on Android.
const VSRC = `import { signal } from '@pyreon/reactivity'
export function App() {
  const dir = signal<string>('none')
  return (
    <VStack>
      <Press
        onPress={() => dir.set('tap')}
        onSwipeLeft={() => dir.set('left')}
        onSwipeRight={() => dir.set('right')}
        onSwipeUp={() => dir.set('up')}
        onSwipeDown={() => dir.set('down')}
      ><Text>Swipe me</Text></Press>
    </VStack>
  )
}`

describe('<Press onSwipeUp/onSwipeDown> gesture emit', () => {
  it('Swift: one high-priority drag, horizontal branch first, then the vertical-dominance branch', () => {
    const out = transform(VSRC, { target: 'swift' })
    expect(out.code.match(/\.highPriorityGesture\(DragGesture/g)).toHaveLength(1)
    expect(out.code).toContain(
      '} else if abs(value.translation.height) > abs(value.translation.width) { if value.translation.height < -40 {',
    )
    expect(out.code).toMatch(/if value\.translation\.height < -40 \{ \(\{\s*dir = "up"/)
    expect(out.code).toMatch(/else if value\.translation\.height > 40 \{ \(\{\s*dir = "down"/)
    expect(out.warnings).toEqual([])
  })

  it('Kotlin: a vertical detector beside the horizontal one, each with its own accumulator', () => {
    const out = transform(VSRC, { target: 'kotlin' })
    expect(out.code).toContain('detectHorizontalDragGestures(')
    expect(out.code).toContain(
      '.pointerInput(Unit) { val swipeThreshold = 40.dp.toPx(); var dragTotal = 0f; detectVerticalDragGestures(onDragStart = { dragTotal = 0f }',
    )
    expect(out.code).toContain('onVerticalDrag = { _, amount -> dragTotal += amount }')
    expect(out.code).toMatch(/if \(dragTotal < -swipeThreshold\) run\(\{\s*dir = "up"/)
    expect(out.code).toMatch(/else if \(dragTotal > swipeThreshold\) run\(\{\s*dir = "down"/)
    expect(out.warnings).toEqual([])
  })

  it('a vertical-only swipe emits no horizontal guard or detector, and does not warn', () => {
    const src = `import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal<number>(0)
  return <Press onSwipeDown={() => n.set(1)}><Text>x</Text></Press>
}`
    const swift = transform(src, { target: 'swift' })
    expect(swift.code).toContain(
      '.highPriorityGesture(DragGesture(minimumDistance: 20).onEnded { value in if abs(value.translation.height) > abs(value.translation.width) { if value.translation.height > 40 {',
    )
    expect(swift.code).not.toContain('abs(value.translation.width) > abs(value.translation.height)')
    expect(swift.warnings).toEqual([])
    const kotlin = transform(src, { target: 'kotlin' })
    expect(kotlin.code).toContain('detectVerticalDragGestures(')
    expect(kotlin.code).not.toContain('detectHorizontalDragGestures(')
    expect(kotlin.warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('both directions on both axes typecheck (Swift)', () => {
    const r = validateSwiftWithStubs(transform(VSRC, { target: 'swift' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('both directions on both axes compile (Kotlin)', () => {
    const r = validateKotlin(transform(VSRC, { target: 'kotlin' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })
})
