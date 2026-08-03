// Asymmetric enter/leave — `<Transition enterDuration leaveDuration>` (+ the
// per-side easings), each falling back to the symmetric `duration`/`easing`.
//
// Before this, ONE duration drove both directions on every target, so "quick
// in, slow out" — the common real shape — had no vocabulary at all. The
// numeric timing props were also native-only: kinetic (the web renderer) never
// typed `duration`/`easing`, so a shared source animated over 2.5s on a phone
// and over the CSS default in a browser, silently. Both halves are fixed; this
// file locks the native emit.
//
// Device proof lives in the router demo: Android reads two boxes with OPPOSITE
// configs at ONE instant on the virtual clock (1000ms into the exit, the
// 2500ms box is present and the 200ms box is gone — an outcome no symmetric
// emit can produce whichever duration it picks). iOS asserts the behaviour;
// its fade timing is not readable through the accessibility tree, which this
// row already documents.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const src = (attrs: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const on = signal<boolean>(true)
  return (
    <Stack>
      <Transition show={() => on()} ${attrs}>
        <Text>box</Text>
      </Transition>
    </Stack>
  )
}`

const ASYM = src('enterDuration={200} leaveDuration={2500} easing="linear"')

describe('asymmetric enter/leave timing', () => {
  it('Swift: per-side animations inside .asymmetric(insertion:removal:)', () => {
    const out = transform(ASYM, { target: 'swift' })
    expect(out.code).toContain('insertion: AnyTransition.opacity.animation(.linear(duration: 0.2))')
    expect(out.code).toContain('removal: AnyTransition.opacity.animation(.linear(duration: 2.5))')
    expect(out.warnings).toEqual([])
  })

  it('Kotlin: separate enter/exit tween specs', () => {
    const out = transform(ASYM, { target: 'kotlin' })
    expect(out.code).toContain('enter = fadeIn(animationSpec = tween(durationMillis = 200, easing = LinearEasing))')
    expect(out.code).toContain('exit = fadeOut(animationSpec = tween(durationMillis = 2500, easing = LinearEasing))')
    expect(out.warnings).toEqual([])
  })

  it('each side falls back to the symmetric duration when only one is given', () => {
    const partial = src('duration={1000} leaveDuration={2500} easing="linear"')
    const kt = transform(partial, { target: 'kotlin' }).code
    expect(kt).toContain('tween(durationMillis = 1000') // enter falls back
    expect(kt).toContain('tween(durationMillis = 2500') // leave overrides
  })

  it('the SYMMETRIC shape is byte-identical to before — no churn on proven emits', () => {
    // The symmetric branch keeps its container `.animation(_:value:)`; the
    // asymmetric one deliberately has none, because
    // `AnyTransition.animation(_:)` is self-contained. (An earlier cut added
    // one on the theory that a transition needs an ambient trigger scope;
    // bisecting it out on a device disproved that, so it is not emitted.)
    const sym = transform(src('duration={2500} easing="linear"'), { target: 'swift' }).code
    expect(sym).toContain('.transition(.opacity)')
    expect(sym).toContain('.animation(.linear(duration: 2.5), value: on)')
    expect(sym).not.toContain('asymmetric')

    const asym = transform(ASYM, { target: 'swift' }).code
    expect(asym).toContain('asymmetric')
    expect(asym).not.toMatch(/\.animation\([^)]*, value: on\)/)
  })

  it('a NON-LITERAL per-side duration warns and falls back', () => {
    const dyn = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const on = signal<boolean>(true)
  const ms = signal<number>(400)
  return (
    <Stack>
      <Transition show={() => on()} leaveDuration={ms()} duration={1000}>
        <Text>box</Text>
      </Transition>
    </Stack>
  )
}`
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(dyn, { target })
      expect(out.warnings.join('\n')).toMatch(/leaveDuration.*static number/)
    }
  })

  it.skipIf(!isSwiftUIAvailable())('the asymmetric emit typechecks (real SwiftUI SDK)', () => {
    const r = validateSwiftTypecheck(transform(ASYM, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the asymmetric emit compiles (real kotlinc)', () => {
    const r = validateKotlin(transform(ASYM, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
