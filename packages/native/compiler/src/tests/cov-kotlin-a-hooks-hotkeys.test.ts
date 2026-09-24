// Coverage: the Kotlin member-surface rewrites for the pure-state hooks
// (emit-kotlin.ts ~4542-4566) and the hotkey key/modifier mapping
// (~1800-1870).
//
// Both are "the web spelling is a CALL, the native shape is a FIELD"
// rewrites: an un-rewritten `t.toggle()` is an unresolved reference, and a
// modifier predicate that only asserts the modifiers PRESENT fires
// 'ctrl+s' on 'ctrl+shift+s' too. So each spec pins the emitted arithmetic
// / predicate, not just that something was emitted.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Kotlin: useToggle / useCounter member surface', () => {
  const SRC = (body: string, opts = `{ min: 0, max: 10 }`) =>
    `import { Stack, Text, Press } from '@pyreon/primitives'
import { useToggle, useCounter } from '@pyreon/hooks'
function App() {
  const t = useToggle(false)
  const c = useCounter(1, ${opts})
  const run = () => { ${body} }
  return (<Stack><Press onPress={run}><Text>{t.value() ? 'on' : String(c.count())}</Text></Press></Stack>)
}`
  const kt = (body: string, opts?: string) =>
    transform(SRC(body, opts), { target: 'kotlin' }).code

  it('useToggle: value is the field itself; each mutator is the assignment it stands for', () => {
    const out = kt(`t.toggle(); t.setTrue(); t.setFalse()`)
    expect(out).toContain('t = !t')
    expect(out).toContain('t = true')
    expect(out).toContain('t = false')
    // the READ drops its parens — `t.value()` would be an unresolved reference
    expect(out).toContain('if (t) "on"')
    expect(out).not.toContain('t.toggle()')
  })

  it('useCounter: inc/dec default to 1, and the literal clamp is baked into every mutation', () => {
    const out = kt(`c.inc(); c.inc(2); c.dec(); c.dec(3); c.set(5); c.reset()`)
    expect(out).toContain('c = minOf(maxOf(c + 1, 0), 10)')
    expect(out).toContain('c = minOf(maxOf(c + 2, 0), 10)')
    expect(out).toContain('c = minOf(maxOf(c - 1, 0), 10)')
    expect(out).toContain('c = minOf(maxOf(c - 3, 0), 10)')
    expect(out).toContain('c = minOf(maxOf(5, 0), 10)')
    // reset goes back to the INITIAL value the hook was created with
    expect(out).toContain('c = minOf(maxOf(1, 0), 10)')
    // the read drops its parens too
    expect(out).toContain('(c).toString()')
  })

  it('with NO bounds the clamp disappears entirely (it is emitted, not held in a runtime)', () => {
    const out = kt(`c.inc(2); c.set(5)`, '{}')
    expect(out).toContain('c = c + 2')
    expect(out).toContain('c = 5')
    expect(out).not.toContain('minOf(')
  })

  it('a MIN-only bound emits maxOf and no minOf', () => {
    const out = kt(`c.dec()`, '{ min: 0 }')
    expect(out).toContain('c = maxOf(c - 1, 0)')
    expect(out).not.toContain('minOf(')
  })
})

describe('Kotlin: useHotkey key + modifier mapping', () => {
  const SRC = (combo: string) => `import { useHotkey } from '@pyreon/hotkeys'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const n = signal(0)
  useHotkey('${combo}', () => { n.set(n() + 1) })
  return (<Stack><Text>{n()}</Text></Stack>)
}`
  const kt = (combo: string) => transform(SRC(combo), { target: 'kotlin' })

  it('a single LETTER maps to Key.<UPPER>; a DIGIT maps to its spelled-out name', () => {
    expect(kt('mod+s').code).toContain('Key.S')
    expect(kt('mod+1').code).toContain('Key.One')
    expect(kt('mod+0').code).toContain('Key.Zero')
    expect(kt('mod+9').code).toContain('Key.Nine')
  })

  it('a NAMED key comes from the table rather than the single-char path', () => {
    expect(kt('escape').code).toContain('Key.Escape')
    expect(kt('mod+pagedown').code).toContain('Key.PageDown')
  })

  it('an UNMAPPABLE key is reported rather than emitting a bogus Key constant', () => {
    const r = kt('mod+§')
    expect(r.code).not.toContain('Key.§')
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('the modifier predicate asserts the absent modifiers too (else ctrl+s fires on ctrl+shift+s)', () => {
    // `mod` resolves to Ctrl on Android
    expect(kt('mod+s').code).toContain('e.isCtrlPressed && !e.isShiftPressed && !e.isAltPressed')
    expect(kt('shift+s').code).toContain('!e.isCtrlPressed && e.isShiftPressed && !e.isAltPressed')
    expect(kt('alt+s').code).toContain('!e.isCtrlPressed && !e.isShiftPressed && e.isAltPressed')
    expect(kt('mod+shift+alt+s').code).toContain(
      'e.isCtrlPressed && e.isShiftPressed && e.isAltPressed',
    )
    // `meta` and `control` both fold onto Ctrl on Android
    expect(kt('meta+s').code).toContain('e.isCtrlPressed && !e.isShiftPressed && !e.isAltPressed')
    expect(kt('control+s').code).toContain('e.isCtrlPressed && !e.isShiftPressed && !e.isAltPressed')
  })
})
