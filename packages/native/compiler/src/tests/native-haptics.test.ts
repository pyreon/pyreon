// M3.1 — `const h = useHaptics()` platform-API hook lowering.
//
// The FIRST imperative platform-API hook proved end-to-end (the pattern
// M3.2-M3.9 reuse). Analog = useClipboard (fire-and-forget container,
// NOT the useFetch data/mount-harness path): decl-recognition only,
// member method calls flow through unchanged, string arg passes straight
// through (no arg rewriting).
//
// Swift:  `@State private var h = PyreonHaptics()` — no ctor arg (iOS
//         haptics need no context); `h.impact("light")` flows through to
//         UIImpactFeedbackGenerator.
// Kotlin: `val hHaptic = LocalHapticFeedback.current` (composition-local,
//         hoisted out of the non-Composable `remember` lambda) +
//         `remember { PyreonHaptics(hHaptic) }`; methods flow through.
//
// Behaviour is device-proven in examples/native-counter-ios's XCUITest
// (the increment tap fires `haptics.impact("light")` — builds + runs +
// does not crash; haptics have no observable UI, an honest-weak R4).
// This spec locks the EMIT SHAPE + is the bisect target.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { signal } from '@pyreon/reactivity'
import { useHaptics } from '@pyreon/hooks'
export function Counter() {
  const count = signal<number>(0)
  const haptics = useHaptics()
  return (
    <VStack>
      <Text>Count: {count}</Text>
      <Button onClick={() => { count.set(count() + 1); haptics.impact('light') }}>Increment</Button>
    </VStack>
  )
}`

describe('M3.1 useHaptics platform-API hook emit', () => {
  it('Swift emits an @State PyreonHaptics + passes the method call through', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('@State private var haptics = PyreonHaptics()')
    // Method call flows through unchanged (string arg, no rewrite).
    expect(out.code).toContain('haptics.impact("light")')
    // Emitted inside the block handler alongside the count write.
    expect(out.code).toMatch(/count = count \+ 1\s*\n\s*haptics\.impact\("light"\)/)
    expect(out.warnings).toEqual([])
  })

  it('Kotlin hoists LocalHapticFeedback + remembers PyreonHaptics', () => {
    const out = transform(SRC, { target: 'kotlin' })
    // The composition-local is read into a sibling val (can't live in the
    // non-Composable remember lambda) and injected.
    expect(out.code).toContain('val hapticsHaptic = LocalHapticFeedback.current')
    expect(out.code).toContain('val haptics = remember { PyreonHaptics(hapticsHaptic) }')
    expect(out.code).toContain('haptics.impact("light")')
    expect(out.warnings).toEqual([])
  })

  it('all three methods (impact/notification/selection) flow through unchanged', () => {
    const src = `import { useHaptics } from '@pyreon/hooks'
export function App() {
  const h = useHaptics()
  return (
    <VStack>
      <Button onClick={() => h.impact('heavy')}>A</Button>
      <Button onClick={() => h.notification('success')}>B</Button>
      <Button onClick={() => h.selection()}>C</Button>
    </VStack>
  )
}`
    const sw = transform(src, { target: 'swift' })
    expect(sw.code).toContain('h.impact("heavy")')
    expect(sw.code).toContain('h.notification("success")')
    expect(sw.code).toContain('h.selection()')
    expect(sw.warnings).toEqual([])
    const kt = transform(src, { target: 'kotlin' })
    expect(kt.code).toContain('h.impact("heavy")')
    expect(kt.code).toContain('h.notification("success")')
    expect(kt.code).toContain('h.selection()')
    expect(kt.warnings).toEqual([])
  })

  it('impact() with no style arg is valid (Swift + Kotlin default to medium)', () => {
    const src = `import { useHaptics } from '@pyreon/hooks'
export function App() {
  const h = useHaptics()
  return <Button onClick={() => h.impact()}>x</Button>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src, { target })
      expect(out.code, target).toContain('h.impact()')
      expect(out.warnings, target).toEqual([])
    }
  })
})
