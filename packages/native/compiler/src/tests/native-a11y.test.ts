// `@pyreon/a11y` `announce(...)` emit — the imperative screen-reader
// announcement lowered to PyreonA11y on both native targets.
//
//   announce("Saved")                              → PyreonA11y.announce("Saved", assertive: false)
//   announce("Error", { politeness: 'assertive' }) → …, assertive: true
//
// v1: the message (any expression) + politeness lower; the live-region
// COMPONENTS (VisuallyHidden / LiveRegion / SkipLink) + createA11yId stay
// web-only (they still warn, per-export). `announce` no longer warns.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { Text, Press } from '@pyreon/primitives'
import { announce } from '@pyreon/a11y'
export function P({ label }: { label: string }) {
  return (
    <Press data-testid="save" onPress={() => { announce(label); announce("Failed", { politeness: 'assertive' }) }}>
      <Text>Go</Text>
    </Press>
  )
}
`

describe('@pyreon/a11y announce() emit', () => {
  it('announce no longer warns web-only (the live-region helpers still would)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(SRC, { target }).warnings, `${target}`).toEqual([])
    }
  })

  it('Swift: announce() → PyreonA11y.announce(message, assertive:)', () => {
    const r = transform(SRC, { target: 'swift' })
    // Message is any expression (here a prop); politeness sets assertive.
    expect(r.code).toContain('PyreonA11y.announce(label, assertive: false)')
    expect(r.code).toContain('PyreonA11y.announce("Failed", assertive: true)')
  })

  it('Kotlin: announce() → PyreonA11y.announce(message, assertive)', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('PyreonA11y.announce(label, false)')
    expect(r.code).toContain('PyreonA11y.announce("Failed", true)')
  })

  it('a renamed import (`announce as say`) still lowers', () => {
    const src = `
import { Text, Press } from '@pyreon/primitives'
import { announce as say } from '@pyreon/a11y'
export function P() {
  return <Press onPress={() => say("Hi")}><Text>Go</Text></Press>
}
`
    expect(transform(src, { target: 'swift' }).code).toContain('PyreonA11y.announce("Hi", assertive: false)')
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonA11y.announce("Hi", false)')
  })

  it('the DOM-based helpers still warn (per-export, announce excepted)', () => {
    const src = `
import { Text } from '@pyreon/primitives'
import { VisuallyHidden } from '@pyreon/a11y'
export function P() { return <Text>x</Text> }
`
    expect(transform(src, { target: 'swift' }).warnings.some((w) => /VisuallyHidden/.test(w))).toBe(true)
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const v = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
