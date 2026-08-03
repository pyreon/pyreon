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
import { transform } from '../index'

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
    expect(out.code).toContain('.pointerInput(Unit) { var dragTotal = 0f; detectHorizontalDragGestures(')
    expect(out.code).toContain('onDragStart = { dragTotal = 0f }')
    expect(out.code).toMatch(/if \(dragTotal < -40f\) run\(\{\s*dir = "left"/)
    expect(out.code).toMatch(/else if \(dragTotal > 40f\) run\(\{\s*dir = "right"/)
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
    expect(kotlin.code).toContain('dragTotal < -40f')
    expect(kotlin.code).not.toContain('dragTotal > 40f')
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
