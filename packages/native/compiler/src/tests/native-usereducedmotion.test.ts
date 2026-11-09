// `useReducedMotion()` native emit. The web hook is an accessor over `(prefers-reduced-motion: reduce)`; natively a
// `PyreonReducedMotion` container holds the same flag (UIAccessibility on iOS, the animator-duration-scale setting
// on Android) and the accessor call reads its `enabled`.
//
// Two properties worth holding beyond "it compiles":
//   1. the container is STARTED/INSTALLED — a never-started one reports the construction-time value forever (the
//      never-wired class), so Swift must call start() on a stable host and Kotlin must use the self-installing factory;
//   2. the accessor call `motion()` lowers to the `enabled` read, with `.value` on Kotlin (it is Compose MutableState)
//      and NOT on Swift (@Observable) — a missing `.value` renders the state object's toString.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `
import { Stack, Text, Show } from '@pyreon/primitives'
import { useReducedMotion } from '@pyreon/hooks'
export function Banner() {
  const motion = useReducedMotion()
  return (
    <Stack>
      <Show when={() => motion()}><Text>Calm mode</Text></Show>
      <Text>{() => 'Reduced: ' + motion()}</Text>
    </Stack>
  )
}
`

describe('useReducedMotion() native emit', () => {
  it('Swift: starts the container on a stable host and reads .enabled bare', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var motion = PyreonReducedMotion()')
    expect(r.code).toContain('.onAppear { motion.start() }')
    expect(r.code).toContain('.onDisappear { motion.stop() }')
    expect(r.code).toContain('motion.enabled')
    expect(r.code).not.toContain('motion.enabled.value')
    // `'Reduced: ' + motion()` concatenates a Bool: it must be converted, not added to a String raw (swiftc rejects that).
    expect(r.code).toContain('String(motion.enabled)')
    expect(r.code).not.toMatch(/\bmotion\(\)/)
  })

  it('Kotlin: the self-installing factory, and the MutableState read carries .value', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val motion = rememberPyreonReducedMotion()')
    expect(r.code).toContain('motion.enabled.value')
    expect(r.code).toContain('(motion.enabled.value).toString()')
    expect(r.code).not.toMatch(/\bmotion\(\)/)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
