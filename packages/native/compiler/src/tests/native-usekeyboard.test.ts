// `useKeyboard(key, handler, options?)` native emit. It lowers to exactly what `useHotkey` does — SwiftUI
// `.keyboardShortcut` on a hidden zero-size Button, a Compose `onPreviewKeyEvent` root — through the key maps and emit
// the compiler shares between @pyreon/hotkeys and @pyreon/hooks.
//
// What this file holds beyond "it compiles":
//   1. the key token maps onto the SAME constants `useHotkey` uses (`Escape` -> `.escape` / `Key.Escape`), so the two
//      hooks cannot disagree about a key;
//   2. everything native cannot honour is a NAMED warning that drops the binding, never a verbatim call or a silently
//      different behaviour (keyup, a custom target, an uppercase letter that means Shift+letter, a handler that reads the
//      KeyboardEvent);
//   3. a native shortcut is modifier-exact — SwiftUI `modifiers: []`, Compose asserts every modifier absent — so both
//      targets agree.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const src = (call: string, extra = '') => `
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { useKeyboard } from '@pyreon/hooks'
${extra}
export function Panel() {
  const shown = signal(false)
  const count = signal(0)
  ${call}
  return (<Stack><Text>{() => (shown() ? 'open ' : 'closed ') + count()}</Text></Stack>)
}
`

const ESCAPE = src(`useKeyboard('Escape', () => { shown.set(false) })`)

describe('useKeyboard() native emit', () => {
  it('Swift: a hidden zero-size Button with a modifier-exact keyboardShortcut', () => {
    const r = transform(ESCAPE, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.keyboardShortcut(.escape, modifiers: [])')
    expect(r.code).toContain('shown = false')
    expect(r.code).toContain('.frame(width: 0, height: 0)')
    expect(r.code).not.toContain('useKeyboard')
  })

  it('Kotlin: one onPreviewKeyEvent root matching the key with every modifier absent', () => {
    const r = transform(ESCAPE, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('if (e.key == Key.Escape && !e.isCtrlPressed && !e.isShiftPressed && !e.isAltPressed) {')
    expect(r.code).toContain('shown = false')
    expect(r.code).toContain('.focusRequester(__kbFocus)')
    expect(r.code).not.toContain('useKeyboard')
  })

  it('maps web KeyboardEvent.key names onto the shared tokens, and a printable character through', () => {
    const named = src(`useKeyboard('ArrowUp', () => { count.set(count() + 1) })`)
    expect(transform(named, { target: 'swift' }).code).toContain('.keyboardShortcut(.upArrow, modifiers: [])')
    expect(transform(named, { target: 'kotlin' }).code).toContain('e.key == Key.DirectionUp')
    const char = src(`useKeyboard('s', () => { count.set(0) })`)
    expect(transform(char, { target: 'swift' }).code).toContain('.keyboardShortcut(KeyEquivalent("s"), modifiers: [])')
    expect(transform(char, { target: 'kotlin' }).code).toContain('e.key == Key.S')
  })

  it('several bindings share ONE Compose wrapper and one focus requester', () => {
    const two = src(`useKeyboard('Escape', () => { shown.set(false) })\n  useKeyboard('Enter', () => { shown.set(true) })`)
    const r = transform(two, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Key.Escape')
    expect(r.code).toContain('Key.Enter')
    expect(r.code.match(/val __kbFocus = remember/g)).toHaveLength(1)
    expect(r.code.match(/\.onPreviewKeyEvent \{ e ->/g)).toHaveLength(1)
  })

  it('agrees with useHotkey on the key constants it shares', () => {
    const hot = `
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { useHotkey } from '@pyreon/hotkeys'
export function Panel() {
  const shown = signal(false)
  useHotkey('escape', () => { shown.set(false) })
  return (<Stack><Text>{() => String(shown())}</Text></Stack>)
}
`
    const kb = ESCAPE
    // Same SwiftUI key token and the same Compose constant from two different libraries.
    expect(transform(hot, { target: 'swift' }).code).toContain('.keyboardShortcut(.escape,')
    expect(transform(kb, { target: 'swift' }).code).toContain('.keyboardShortcut(.escape,')
    expect(transform(hot, { target: 'kotlin' }).code).toContain('e.key == Key.Escape')
    expect(transform(kb, { target: 'kotlin' }).code).toContain('e.key == Key.Escape')
  })

  it('accepts ignoreInputs and event: keydown (a native text field consumes its own keys first)', () => {
    const r = transform(src(`useKeyboard('Escape', () => { shown.set(false) }, { ignoreInputs: true, event: 'keydown' })`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.keyboardShortcut(.escape, modifiers: [])')
  })

  it('strips the browser-only e.preventDefault(), a no-op natively', () => {
    const r = transform(src(`useKeyboard('Escape', (e) => { e.preventDefault(); shown.set(false) })`), { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('shown = false')
    expect(r.code).not.toContain('preventDefault')
  })

  describe('what native cannot honour is a named warning that drops the binding', () => {
    const refused: ReadonlyArray<readonly [string, string, string]> = [
      ['keyup', `useKeyboard('Escape', () => { shown.set(false) }, { event: 'keyup' })`, "only event: 'keydown' lowers"],
      ['a custom target', `useKeyboard('Escape', () => { shown.set(false) }, { target: window })`, '`target` option has no native meaning'],
      ['an uppercase letter', `useKeyboard('S', () => { count.set(0) })`, 'Shift+s'],
      ['a handler reading the event', `useKeyboard('Escape', (e) => { count.set(e.keyCode) })`, 'takes a KeyboardEvent parameter'],
      ['a handler reference', `const go = () => { shown.set(false) }\n  useKeyboard('Escape', go)`, 'needs an inline handler function'],
      ['a computed key', `const k = String(count())\n  useKeyboard(k, () => { shown.set(false) })`, 'statically-known key'],
    ]
    for (const [name, call, message] of refused) {
      it(name, () => {
        for (const target of ['swift', 'kotlin'] as const) {
          const r = transform(src(call), { target })
          expect(r.warnings.join('\n')).toContain(message)
          expect(r.warnings.join('\n')).toContain('useKeyboard()')
          // Dropped, not copied through: the native build would fail on an unknown symbol.
          expect(r.code).not.toContain('useKeyboard')
          expect(r.code).not.toContain('keyboardShortcut')
          expect(r.code).not.toContain('onPreviewKeyEvent')
        }
      })
    }

    it('a key with no native constant is named per platform', () => {
      const r = transform(src(`useKeyboard('F13', () => { shown.set(false) })`), { target: 'swift' })
      expect(r.warnings.join('\n')).toContain("useKeyboard: 'f13' has no SwiftUI KeyEquivalent")
      expect(r.warnings.join('\n')).toContain('key binding is DROPPED on iOS')
    })
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(ESCAPE, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(ESCAPE, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
