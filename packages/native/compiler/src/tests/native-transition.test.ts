// Phase 5 — `<Transition>` native emit. In its own test file (not
// canonical-primitives.test.ts) so it doesn't append-conflict with the
// in-flight router/data emit PRs that also extend that file.
//
// `<Transition show={cond}>children</Transition>` animates the children's
// visibility: SwiftUI `.transition(.opacity)` on a show-gate driven by an
// `.animation(.default, value:)` ZStack; Compose `AnimatedVisibility`. The
// web-only CSS-class enter/leave props are ignored on native (the platforms
// animate through their own systems, not CSS classes). The reactive `show`
// is written as a bare accessor (`show={visible}`), like `<Show when>`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
  export function Banner() {
    const visible = signal(true)
    return <Transition show={visible}><Text>Hi</Text></Transition>
  }
`

describe('Phase 5 — <Transition> native emit', () => {
  it('Swift: show-gate with .transition(.opacity) + .animation on a ZStack', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('ZStack {')
    expect(out).toContain('if visible {')
    expect(out).toContain('.transition(.opacity)')
    expect(out).toContain('.animation(.default, value: visible)')
    // Children render inside the gate.
    expect(out).toContain('Text("Hi")')
  })

  it('Kotlin: AnimatedVisibility(visible = …) wraps the children', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('AnimatedVisibility(visible = visible) {')
    expect(out).toContain('Text(text = "Hi")')
  })

  it('Swift: no `show` prop defaults the gate to `true`', () => {
    const out = transform(
      `export function Always() { return <Transition><Text>X</Text></Transition> }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('if true {')
    expect(out).toContain('.transition(.opacity)')
  })

  it('Kotlin: no `show` prop defaults to AnimatedVisibility(visible = true)', () => {
    const out = transform(
      `export function Always() { return <Transition><Text>X</Text></Transition> }`,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('AnimatedVisibility(visible = true) {')
  })
})
