// `<Transition name>` resolves to a PLATFORM transition, not always a fade.
//
// `name` is the Vue-style prop @pyreon/runtime-dom's Transition already
// honours on the web (it derives `${name}-enter-from` and friends), and
// @pyreon/kinetic ships its presets under the same vocabulary. That makes it
// the one shape an author writes ONCE and each target resolves natively.
//
// Before this the emit ignored `name` entirely and every transition became a
// fade. An authored slide-up ran as a fade on device — and because an
// animation still played, nothing looked broken enough to investigate.

import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'
import { transform } from '../index'

const app = (name: string) => `import { Transition } from '@pyreon/runtime-dom'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C(){ const v = signal(true); return (<Stack><Transition name="${name}" show={v()}><Text>x</Text></Transition></Stack>) }`

const CASES: ReadonlyArray<readonly [string, string, string]> = [
  ['fade', '.transition(.opacity)', 'fadeIn('],
  ['scale-in', '.transition(.scale.combined(with: .opacity))', 'scaleIn('],
  ['slide-up', '.move(edge: .bottom)', 'slideInVertically('],
  ['slide-down', '.move(edge: .top)', 'slideInVertically('],
  ['slide-left', '.move(edge: .trailing)', 'slideInHorizontally('],
  ['slide-right', '.move(edge: .leading)', 'slideInHorizontally('],
]

describe('<Transition name> maps to a native transition', () => {
  for (const [name, swiftMarker, kotlinMarker] of CASES) {
    it(`${name} → the platform transition on both targets`, () => {
      expect(transform(app(name), { target: 'swift' }).code).toContain(swiftMarker)
      expect(transform(app(name), { target: 'kotlin' }).code).toContain(kotlinMarker)
    })
  }

  // A custom CSS animation has no native translation. Falling back to a fade
  // is the previous behaviour, and a better answer than refusing to compile.
  it('an UNKNOWN name falls back to a fade rather than failing', () => {
    expect(transform(app('wobble'), { target: 'swift' }).code).toContain('.transition(.opacity)')
    expect(transform(app('wobble'), { target: 'kotlin' }).code).toContain('fadeIn(')
  })

  // No name at all must stay byte-identical to the shape shipped since M2.7 —
  // this change may not churn an already-proven emit.
  it('NO name keeps the pre-existing default emit', () => {
    const src = `import { Transition } from '@pyreon/runtime-dom'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C(){ const v = signal(true); return (<Stack><Transition show={v()}><Text>x</Text></Transition></Stack>) }`
    expect(transform(src, { target: 'kotlin' }).code).toContain('AnimatedVisibility(visible = v) {')
    expect(transform(src, { target: 'swift' }).code).toContain('.transition(.opacity)')
  })

  // The emit-shape assertions above prove intent; these prove the result is
  // real code on each toolchain, which is the only thing a device cares about.
  it.runIf(isSwiftcAvailable())('every mapping type-checks against the Swift stubs', () => {
    for (const [name] of CASES) {
      const res = validateSwiftWithStubs(transform(app(name), { target: 'swift' }).code)
      expect(res.ok, `${name}: ${res.error}`).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('every mapping type-checks against the Kotlin stubs', () => {
    for (const [name] of CASES) {
      const res = validateKotlin(transform(app(name), { target: 'kotlin' }).code)
      expect(res.ok, `${name}: ${res.error}`).toBe(true)
    }
  })
})
