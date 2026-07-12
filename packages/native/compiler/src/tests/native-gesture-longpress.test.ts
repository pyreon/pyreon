// M2.3 — `<Press onLongPress={fn}>` gesture lowering (was silently dropped
// from the native emit; the type + web polyfill already existed).
//
// Swift: a SIMULTANEOUS LongPressGesture, NOT `.onLongPressGesture` — a
// bare long-press modifier on a `Button` does not fire (the button's tap
// recognizer swallows it; device-found on a real Simulator, invisible to
// swiftc which typechecks either form). Android: `combinedClickable(
// onClick, onLongClick)` (the idiomatic Compose long-press surface).
//
// Behavior is device-proven in examples/native-counter-ios's XCUITest
// `test_longPressResetsCounter` (a >=0.5s hold resets the counter, R4
// local Simulator pass). This spec locks the EMIT SHAPE + is the bisect
// target (neuter the emit → these fail).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { signal } from '@pyreon/reactivity'
export function App() {
  const count = signal<number>(0)
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Press onLongPress={() => count.set(0)} data-testid="reset-zone"><Text>Hold</Text></Press>
    </VStack>
  )
}`

describe('M2.3 <Press onLongPress> gesture emit', () => {
  it('Swift emits a simultaneous LongPressGesture (not the swallowed onLongPressGesture)', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('.simultaneousGesture(LongPressGesture(minimumDuration: 0.5).onEnded')
    // The action body is threaded as a (Bool)->Void closure (`_ in`).
    expect(out.code).toMatch(/\.onEnded \{ _ in\s*count = 0/)
    // A bare `.onLongPressGesture` would NOT fire on the Button — guard it.
    expect(out.code).not.toContain('.onLongPressGesture')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin emits combinedClickable(onClick, onLongClick)', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('.combinedClickable(onClick = {}, onLongClick = { count = 0 })')
    expect(out.warnings).toEqual([])
  })

  it('a long-press-only <Press> (no onPress) does NOT warn', () => {
    // The tap action is intentionally empty; only the long-press acts.
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(SRC, { target })
      expect(
        out.warnings.some((w) => w.includes('without an `onPress`')),
        `${target}: ${JSON.stringify(out.warnings)}`,
      ).toBe(false)
    }
  })

  it('a <Press> with neither onPress nor onLongPress STILL warns', () => {
    const bare = `export function App() { return <Press data-testid="x"><Text>y</Text></Press> }`
    const out = transform(bare, { target: 'swift' })
    expect(out.warnings.some((w) => w.includes('onPress') && w.includes('onLongPress'))).toBe(true)
  })

  it('onPress + onLongPress coexist — tap action AND long-press gesture both emit', () => {
    const both = `import { signal } from '@pyreon/reactivity'
export function App() {
  const n = signal<number>(0)
  return <Press onPress={() => n.set(n() + 1)} onLongPress={() => n.set(0)}><Text>x</Text></Press>
}`
    const sw = transform(both, { target: 'swift' })
    expect(sw.code).toContain('Button(action: { n = n + 1 })')
    expect(sw.code).toContain('.simultaneousGesture(LongPressGesture')
    const kt = transform(both, { target: 'kotlin' })
    expect(kt.code).toContain('.combinedClickable(onClick = { n = n + 1 }, onLongClick = { n = 0 })')
  })
})
