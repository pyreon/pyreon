// `useHotkey('mod+s', fn)` lowers to a REAL keyboard shortcut on both targets.
//
// The package's manifest used to claim "touch platforms have no hardware-
// shortcut surface". That was false: iPads with keyboards, Chromebooks, DeX and
// keyboard-equipped tablets all reach one, and both toolkits expose it. What
// was missing was the lowering, not the platform.
//
// The two targets need STRUCTURALLY different emits, which is the whole reason
// this is not one shared code path:
//
//   iOS      `.keyboardShortcut` attaches to a CONTROL and fires its action, so
//            the handler becomes a hidden zero-size Button's action, injected
//            through `.background`. (`.onKeyPress` attaches anywhere but is
//            iOS 17+ and has NO modifier overload, so it cannot express mod+s.)
//   Android  Compose delivers key events only to a FOCUSED node, so the root is
//            wrapped focusable with a FocusRequester that actually requests
//            focus. A Modifier alone compiles and never fires.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const src = (body: string) => `
import { useHotkey } from '@pyreon/hotkeys'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const n = signal(0)
  ${body}
  return (<Stack><Text>{n()}</Text></Stack>)
}
`
const SAVE = src(`useHotkey('mod+s', () => { n.set(n() + 1) })`)

describe('useHotkey lowers to a real shortcut on both targets', () => {
  it('Swift binds the handler to a hidden shortcut Button', () => {
    const { code, warnings } = transform(SAVE, { target: 'swift' })
    expect(warnings).toEqual([])
    expect(code).toContain('.keyboardShortcut(KeyEquivalent("s"), modifiers: [.command])')
    // Hidden and zero-size, or it would occupy layout in the user's UI.
    expect(code).toContain('.frame(width: 0, height: 0)')
    expect(code).toContain('.opacity(0)')
  })

  it('Kotlin wraps the root in a FOCUSED key handler', () => {
    const { code, warnings } = transform(SAVE, { target: 'kotlin' })
    expect(warnings).toEqual([])
    expect(code).toContain('FocusRequester()')
    // Requesting focus is the load-bearing half: without it the modifier is
    // attached and no key event ever arrives.
    expect(code).toContain('__hkFocus.requestFocus()')
    expect(code).toContain('.onPreviewKeyEvent')
    expect(code).toContain('e.key == Key.S')
  })

  it('`mod` resolves per platform — Command on iOS, Ctrl on Android', () => {
    // The one place the two emits deliberately DISAGREE, and the reason the IR
    // keeps `mod` symbolic instead of resolving it at parse time.
    expect(transform(SAVE, { target: 'swift' }).code).toContain('modifiers: [.command]')
    expect(transform(SAVE, { target: 'kotlin' }).code).toContain('e.isCtrlPressed')
  })

  it('asserts absent modifiers, so ctrl+s does not also fire on ctrl+shift+s', () => {
    // Without the negative half, two shortcuts differing only by Shift would
    // both trigger — which reads like a duplicated handler, not a match bug.
    const { code } = transform(src(`useHotkey('ctrl+s', () => {})`), { target: 'kotlin' })
    expect(code).toContain('!e.isShiftPressed')
    expect(code).toContain('!e.isAltPressed')
  })

  it('ignores key-UP, so a handler fires once per keystroke', () => {
    expect(transform(SAVE, { target: 'kotlin' }).code).toContain('e.type != KeyEventType.KeyDown')
  })

  it('maps a named key to each toolkit’s own constant', () => {
    const esc = src(`useHotkey('Escape', () => { n.set(0) })`)
    expect(transform(esc, { target: 'swift' }).code).toContain('.keyboardShortcut(.escape')
    expect(transform(esc, { target: 'kotlin' }).code).toContain('Key.Escape')
  })

  it('refuses a computed shortcut BY NAME', () => {
    // SwiftUI takes a KeyEquivalent at view construction and Compose compares
    // against a constant, so a runtime string cannot be baked in either.
    const dyn = src(`useHotkey(combo, () => {})`)
    const w = transform(dyn, { target: 'swift' }).warnings
    expect(w.some((x) => x.includes('LITERAL shortcut'))).toBe(true)
  })

  it('refuses a handler that takes the KeyboardEvent BY NAME', () => {
    // Native has no KeyboardEvent. Emitting a binding that silently ignores the
    // parameter would be worse than refusing: the handler would run with its
    // event-dependent logic quietly wrong.
    const evt = src(`useHotkey('mod+s', (e) => { e.preventDefault() })`)
    const w = transform(evt, { target: 'swift' }).warnings
    expect(w.some((x) => x.includes('KeyboardEvent parameter'))).toBe(true)
  })

  it('refuses a comma-separated combo LIST BY NAME', () => {
    // `@pyreon/hotkeys` accepts 'ctrl+s, mod+p'. One native binding cannot carry
    // two combos, and silently taking the first would drop a registered
    // shortcut.
    const list = src(`useHotkey('ctrl+s, mod+p', () => {})`)
    const w = transform(list, { target: 'swift' }).warnings
    expect(w.some((x) => x.includes('comma-separated'))).toBe(true)
  })

  it.runIf(isSwiftcAvailable())('the Swift emit typechecks', () => {
    const v = validateSwiftWithStubs(transform(SAVE, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('the Kotlin emit compiles', () => {
    const v = validateKotlin(transform(SAVE, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
