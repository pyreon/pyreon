// `<Transition easing="spring" bounce>` (ANI-2): the same physical spring on
// both targets. SwiftUI's `.spring(duration:bounce:)` is the definition — the
// duration is the response, bounce the overshoot — and Compose runs it as
// `spring(dampingRatio = 1 - bounce, stiffness = (2π / response)²)`.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const src = (attrs: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Transition } from '@pyreon/primitives'
export function App() {
  const on = signal(true)
  return (
    <Stack>
      <Transition show={() => on()} ${attrs}><Text>x</Text></Transition>
    </Stack>
  )
}`

describe('<Transition easing="spring">', () => {
  it('Swift: .spring(duration:bounce:) with the response in seconds', () => {
    const out = transform(src('duration={2000} easing="spring" bounce={0.8}'), { target: 'swift' })
    expect(out.warnings).toEqual([])
    expect(out.code).toContain('.animation(.spring(duration: 2, bounce: 0.8), value: on)')
  })

  it('Kotlin: the same spring as damping ratio and stiffness', () => {
    const out = transform(src('duration={2000} easing="spring" bounce={0.8}'), { target: 'kotlin' })
    expect(out.warnings).toEqual([])
    // (2π / 2 s)² = 9.8696
    expect(out.code).toContain('fadeIn(animationSpec = spring(dampingRatio = 0.2f, stiffness = 9.87f))')
    expect(out.code).toContain('fadeOut(animationSpec = spring(dampingRatio = 0.2f, stiffness = 9.87f))')
  })

  it('no bounce is critically damped; a preset takes the spring on every part', () => {
    const swift = transform(src('duration={500} easing="spring" name="slideUp"'), { target: 'swift' })
    expect(swift.code).toContain('.spring(duration: 0.5, bounce: 0)')
    const kotlin = transform(src('duration={500} easing="spring" name="slideUp"'), { target: 'kotlin' })
    expect(kotlin.code).toContain('slideInVertically(animationSpec = spring(dampingRatio = 1.0f, stiffness = 157.914f))')
  })

  it('asymmetric: a spring enter beside a tween leave', () => {
    const swift = transform(src('enterDuration={400} enterEasing="spring" leaveDuration={200} leaveEasing="linear"'), {
      target: 'swift',
    })
    expect(swift.code).toContain('insertion: AnyTransition.opacity.animation(.spring(duration: 0.4, bounce: 0))')
    expect(swift.code).toContain('removal: AnyTransition.opacity.animation(.linear(duration: 0.2))')
    const kotlin = transform(src('enterDuration={400} enterEasing="spring" leaveDuration={200} leaveEasing="linear"'), {
      target: 'kotlin',
    })
    expect(kotlin.code).toContain('enter = fadeIn(animationSpec = spring(dampingRatio = 1.0f')
    expect(kotlin.code).toContain('exit = fadeOut(animationSpec = tween(durationMillis = 200, easing = LinearEasing))')
  })

  it('a dynamic bounce is named and falls back to no overshoot', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(src('duration={500} easing="spring" bounce={on() ? 0.5 : 0}'), { target })
      expect(out.warnings.join('\n')).toContain('<Transition bounce>: must be a static number')
    }
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(src('duration={2000} easing="spring" bounce={0.8} name="scale"'), { target: 'swift' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(src('duration={2000} easing="spring" bounce={0.8} name="slideLeft"'), { target: 'kotlin' }).code)
    expect(r.ok, String(r.error)).toBe(true)
  })
})
