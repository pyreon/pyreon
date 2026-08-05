// The heaviest row in the capability matrix — Styling & design system, weight 6
// — recorded a fraction of 0.2 with the note that `styled()` / `Element` /
// `coolgrid` / `attrs` "have no native example at all". Nothing measured
// whether they actually lower.
//
// Measured here. Three of the four DO, and one of those was being reported as
// broken by a GATE BUG rather than an emit bug:
//
//   coolgrid   Col emits `.frame(maxWidth: .infinity)` — valid SwiftUI, and
//              real device builds accept it. But the Swift stub defined ONLY
//              `frame(width:height:)`, with no flexible-frame overload, so the
//              type gate failed it with "extra argument 'maxWidth' in call".
//              A stub narrower than reality manufactures failures, exactly as
//              the over-strict PyreonPermissions stub rejected a correct no-arg
//              init. Kotlin was unaffected and always passed — a target
//              asymmetry that is itself the tell.
//
//   Element    lowers cleanly on both targets.
//   attrs()    lowers cleanly on both targets.
//
//   styled()   does NOT lower for a raw tag, and WARNS by name saying only a
//              canonical primitive may be wrapped. Disclosed, not silent — so
//              it is asserted as a warning here rather than treated as a defect.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const COOLGRID = `import { Container, Row, Col } from '@pyreon/coolgrid'
import { Text } from '@pyreon/primitives'
export function C(){ return (<Container><Row><Col><Text>x</Text></Col></Row></Container>) }`

const ELEMENT = `import { Element } from '@pyreon/elements'
import { Text } from '@pyreon/primitives'
export function C(){ return (<Element><Text>x</Text></Element>) }`

// The OPTIONS-object form — the only one `@pyreon/attrs` accepts. This fixture
// used the bare `attrs(Text)` until the call shape was verified against the
// runtime, which throws on it; see attrs-bare-component.test.ts. The invariant
// asserted here (attrs lowers natively, warning-free, and type-checks) is
// unchanged — only the spelling was wrong.
const ATTRS = `import attrs from '@pyreon/attrs'
import { Text } from '@pyreon/primitives'
const T = attrs({ name: 'T', component: Text }).attrs({ })
export function C(){ return (<T>x</T>) }`

const STYLED_RAW_TAG = `import styled from '@pyreon/styler'
import { Stack, Text } from '@pyreon/primitives'
const Card = styled('div')\`padding: 8px;\`
export function C(){ return (<Stack><Card><Text>x</Text></Card></Stack>) }`

describe('ui-system surfaces that DO lower natively', () => {
  for (const [label, src] of [
    ['coolgrid', COOLGRID],
    ['Element', ELEMENT],
    ['attrs()', ATTRS],
  ] as const) {
    it(`${label}: emits without warnings on both targets`, () => {
      for (const target of ['swift', 'kotlin'] as const) {
        expect(transform(src, { target }).warnings ?? [], `${label}/${target}`).toEqual([])
      }
    })

    it.skipIf(!isSwiftcAvailable())(`${label}: type-checks on Swift`, () => {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isKotlincAvailable())(`${label}: type-checks on Kotlin`, () => {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }

  // The specific shape the stub gap hid. Asserting the EMIT (not just that it
  // compiles) so a regression that stopped producing a flexible frame — and
  // therefore stopped exercising the overload — is visible.
  it('coolgrid Col emits a FLEXIBLE frame, which the stub must model', () => {
    expect(transform(COOLGRID, { target: 'swift' }).code).toContain('.frame(maxWidth: .infinity)')
  })
})

describe('styled() on a raw tag is disclosed, not silent', () => {
  it('warns naming the canonical-primitive constraint', () => {
    const w = transform(STYLED_RAW_TAG, { target: 'swift' }).warnings ?? []
    const hit = w.find((x) => x.includes('styled('))
    expect(hit, `no warning; got ${JSON.stringify(w)}`).toBeTruthy()
    expect(hit).toContain('CANONICAL')
  })

  it('warns on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(
        (transform(STYLED_RAW_TAG, { target }).warnings ?? []).some((x) => x.includes('styled(')),
        target,
      ).toBe(true)
    }
  })
})
