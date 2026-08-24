// `kinetic(tag).preset('fade')` animates on native.
//
// The preset is the whole reason this is possible: it NAMES an animation both
// targets already know, so the box lowers through the same `<Transition>` path
// the primitive uses — presets, durations and both emitters, all previously
// verified. Nothing about the animation is re-implemented here.
//
// What it needs that a primitive does not is a TRIGGER. Rewriting to
// `<Transition show={true}>` was the obvious move and is WRONG: it compiles and
// never animates, because `.animation(_:value:)` watches a constant and
// `AnimatedVisibility(visible = true)` starts visible. Verified before writing
// this, not assumed. So the enter is driven by a synthesized flag that flips on
// mount, reusing the on-mount harness — which also carries the SwiftUI
// stable-identity host a `.onAppear` needs.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const WITH_PRESET = `
import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div').preset('fade')
export function C() { return (<Stack><Box><Text>hi</Text></Box></Stack>) }
`

const NO_PRESET = `
import { kinetic } from '@pyreon/kinetic'
import { Stack, Text } from '@pyreon/primitives'
const Box = kinetic('div')
export function C() { return (<Stack><Box><Text>hi</Text></Box></Stack>) }
`

describe('a kinetic preset chain lowers to a real mount animation', () => {
  it('lowers with no warnings at all', () => {
    expect(transform(WITH_PRESET, { target: 'swift' }).warnings).toEqual([])
    expect(transform(WITH_PRESET, { target: 'kotlin' }).warnings).toEqual([])
  })

  it('Swift animates off a flag that FLIPS, never a constant', () => {
    const { code } = transform(WITH_PRESET, { target: 'swift' })
    expect(code).toContain('@State private var __kineticIn: Bool = false')
    expect(code).toContain('.transition(.opacity)')
    // The load-bearing pair: a constant here compiles and never animates.
    expect(code).toContain('.animation(.default, value: __kineticIn)')
    expect(code).toContain('__kineticIn = true')
  })

  it('Kotlin drives the enter from a LaunchedEffect', () => {
    const { code } = transform(WITH_PRESET, { target: 'kotlin' })
    expect(code).toContain('var __kineticIn by remember { mutableStateOf(false) }')
    expect(code).toContain('AnimatedVisibility(visible = __kineticIn')
    expect(code).toContain('fadeIn(')
    expect(code).toContain('__kineticIn = true')
  })

  it('never emits the verbatim factory call', () => {
    // The bug this whole area started from: an unrecognised chain printed
    // `kinetic("div")` into Swift, where no such function exists.
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(WITH_PRESET, { target }).code).not.toContain('kinetic(')
    }
  })

  it('a chain with NO preset still declines by name', () => {
    // No preset means no animation vocabulary to carry across, so this
    // degrades to a plain container — layout and children survive — and says
    // so rather than pretending to animate.
    const w = transform(NO_PRESET, { target: 'swift' }).warnings
    expect(w.some((x) => x.includes('`Box`') && x.includes('plain container'))).toBe(true)
    expect(transform(NO_PRESET, { target: 'swift' }).code).not.toContain('__kineticIn')
  })

  it.runIf(isSwiftcAvailable())('the Swift emit typechecks', () => {
    const v = validateSwiftWithStubs(transform(WITH_PRESET, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the Kotlin emit compiles', () => {
    const v = validateKotlin(transform(WITH_PRESET, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
