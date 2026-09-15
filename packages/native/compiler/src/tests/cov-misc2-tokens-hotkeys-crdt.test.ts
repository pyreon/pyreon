// Branch matrices for three small, wholly-shared modules reached through the
// real `transform()`:
//
//   * `hotkey-combo.ts`     — the build-time `useHotkey('mod+s')` parser
//   * `canonical-primitives.ts` — token → per-target literal resolution
//   * `parse-crdt-surface.ts`   — the un-lowered `@pyreon/sync` member scan
//
// Each spec pairs the input that takes the arm with the neighbouring input that
// must not, and asserts the EMITTED code (or the named warning), never just an
// absence.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

// ─── hotkey-combo ────────────────────────────────────────────────────

const hotkey = (shortcut: string) => `
import { useHotkey } from '@pyreon/hotkeys'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const n = signal(0)
  useHotkey('${shortcut}', () => { n.set(n() + 1) })
  return (<Stack><Text>{n()}</Text></Stack>)
}
`
const hotkeyWarn = (shortcut: string) => swift(hotkey(shortcut)).warnings.join('\n')

describe('hotkey-combo — modifier vocabulary', () => {
  it('accepts every modifier spelling and orders them canonically', () => {
    // ORDER is mod, meta, control, alt, shift regardless of how it was written.
    const out = swift(hotkey('shift+alt+ctrl+cmd+k')).code
    expect(out).toContain('.keyboardShortcut(KeyEquivalent("k")')
    expect(out).toMatch(/modifiers: \[[^\]]*\.command[^\]]*\.control[^\]]*\.option[^\]]*\.shift/)
    expect(hotkeyWarn('shift+alt+ctrl+cmd+k')).not.toContain('DROPPED')
  })

  it('treats `control`, `meta`, `command` as aliases of `ctrl`, `cmd`', () => {
    for (const s of ['control+s', 'meta+s', 'command+s', 'cmd+s', 'ctrl+s']) {
      expect(hotkeyWarn(s), s).not.toContain('DROPPED')
      expect(swift(hotkey(s)).code, s).toContain('.keyboardShortcut(KeyEquivalent("s")')
    }
  })

  it('de-duplicates a repeated modifier rather than emitting it twice', () => {
    const out = swift(hotkey('ctrl+ctrl+s')).code
    const mods = /modifiers: \[([^\]]*)\]/.exec(out)?.[1] ?? ''
    expect(mods.match(/\.control/g) ?? []).toHaveLength(1)
  })

  it('skips EMPTY segments produced by a doubled separator', () => {
    expect(hotkeyWarn('ctrl++s')).not.toContain('DROPPED')
    expect(swift(hotkey('ctrl++s')).code).toContain('.keyboardShortcut(KeyEquivalent("s")')
  })

  it('resolves `mod` per target — Command on iOS, Control on Android', () => {
    expect(swift(hotkey('mod+s')).code).toMatch(/modifiers: \[[^\]]*\.command/)
    expect(kotlin(hotkey('mod+s')).code).toMatch(/isCtrlPressed|isMetaPressed/)
  })

  it('applies the key-alias table', () => {
    // The alias resolves in the COMBO; the Swift emitter then maps a named key
    // to its `KeyEquivalent` constant and a printable one to a literal.
    for (const [written, emitted] of [
      ['esc', '.escape'],
      ['return', '.return'],
      ['del', '.delete'],
      ['up', '.upArrow'],
      ['down', '.downArrow'],
      ['left', '.leftArrow'],
      ['right', '.rightArrow'],
      ['space', '.space'],
      ['plus', 'KeyEquivalent("+")'],
      ['comma', 'KeyEquivalent(",")'],
    ] as const) {
      expect(swift(hotkey(`mod+${written}`)).code, written).toContain(
        `.keyboardShortcut(${emitted},`,
      )
    }
  })
})

describe('hotkey-combo — refusals, each named', () => {
  it('refuses a comma-separated LIST rather than silently taking the first combo', () => {
    const w = hotkeyWarn('ctrl+s, mod+p')
    expect(w).toContain('comma-separated shortcut LIST is not supported natively')
    expect(w).toContain('DROPPED on iOS/Android')
  })

  it('refuses TWO base keys and names both', () => {
    expect(hotkeyWarn('a+b')).toContain("two base keys ('a' and 'b')")
  })

  it('refuses a bare modifier with no base key', () => {
    for (const s of ['ctrl', 'shift+alt', 'mod']) {
      expect(hotkeyWarn(s), s).toContain('no base key — a bare modifier cannot be a shortcut')
    }
  })

  it('lowers a modifier-less single key (the arm a bare modifier is paired against)', () => {
    expect(hotkeyWarn('k')).not.toContain('DROPPED')
    expect(swift(hotkey('k')).code).toContain('.keyboardShortcut(KeyEquivalent("k"), modifiers: [])')
  })
})

// ─── canonical-primitives token resolution ───────────────────────────

const stack = (attrs: string) => `
import { Stack, Text } from '@pyreon/primitives'
export function C() { return (<Stack ${attrs}><Text>x</Text></Stack>) }
`

describe('canonical-primitives — space tokens', () => {
  it('resolves the indexed scale and the semantic aliases', () => {
    expect(swift(stack('gap={0}')).code).toContain('spacing: 0')
    expect(swift(stack('gap={4}')).code).toContain('spacing: 16')
    expect(swift(stack('gap={9}')).code).toContain('spacing: 48')
    expect(swift(stack("gap='xs'")).code).toContain('spacing: 4')
    expect(swift(stack("gap='xl'")).code).toContain('spacing: 24')
  })

  it('falls back to 0 for an in-range NON-index number and for an out-of-range one', () => {
    // 2.5 is inside [0, 9] but is not a key of the scale — the `?? 0` arm.
    expect(swift(stack('gap={2.5}')).code).toContain('spacing: 0')
    expect(swift(stack('gap={99}')).code).toContain('spacing: 0')
  })

  it('falls back to 0 for an unknown NAMED space token', () => {
    expect(swift(stack("gap='enormous'")).code).toContain('spacing: 0')
  })
})

describe('canonical-primitives — colour tokens', () => {
  const text = (attrs: string) => `
import { Stack, Text } from '@pyreon/primitives'
export function C() { return (<Stack><Text ${attrs}>x</Text></Stack>) }
`
  it('resolves a known token to per-target RGB', () => {
    expect(swift(text("color='primary'")).code).toContain('Color(red: 0.1450980392156863')
    expect(kotlin(text("color='primary'")).code).toContain('Color(0xFF2563EB)')
  })

  it('falls back to the platform grey for an UNKNOWN token, differently per target', () => {
    expect(swift(text("color='chartreuse'")).code).toContain('Color.gray')
    expect(kotlin(text("color='chartreuse'")).code).toContain('Color.Gray')
  })
})

describe('canonical-primitives — radius and alignment', () => {
  // `radius` is a LAYOUT modifier, read off any canonical primitive.
  const box = (attrs: string) => `
import { Stack, Text } from '@pyreon/primitives'
export function C() { return (<Stack ${attrs}><Text>x</Text></Stack>) }
`
  it('resolves the radius scale and falls back to 0 for an unknown token', () => {
    expect(swift(box("radius='sm'")).code).toContain('cornerRadius(4')
    expect(swift(box("radius='full'")).code).toContain('cornerRadius(9999')
    expect(swift(box("radius='squircle'")).code).toContain('cornerRadius(0')
  })

  it('resolves horizontal alignment on Stack and vertical on Inline, per target', () => {
    expect(swift(stack("align='center'")).code).toContain('VStack(alignment: .center')
    expect(swift(stack("align='end'")).code).toContain('VStack(alignment: .trailing')
    expect(kotlin(stack("align='center'")).code).toContain('Alignment.CenterHorizontally')
  })

  it('falls back to the default alignment — per target AND per axis — on an unknown value', () => {
    const inline = (a: string) => `
import { Inline, Text } from '@pyreon/primitives'
export function C() { return (<Inline ${a}><Text>x</Text></Inline>) }
`
    // Swift vertical (Inline → HStack) and Kotlin horizontal (Stack → Column).
    expect(swift(inline("align='sideways'")).code).toContain('HStack(alignment: .top')
    expect(kotlin(stack("align='sideways'")).code).toContain('Alignment.Start')
    expect(swift(stack("align='sideways'")).code).toContain('VStack(alignment: .leading')
    expect(kotlin(inline("align='sideways'")).code).toContain('Alignment.Top')
    // …and the unknown value is NAMED, not silently swallowed.
    expect(swift(stack("align='sideways'")).warnings.join('\n')).toContain(
      'uses an unrecognized align value',
    )
  })
})

// ─── parse-crdt-surface ──────────────────────────────────────────────

const crdt = (body: string) => `
import { PyreonCrdtDoc } from '@pyreon/sync'
import { Text } from '@pyreon/primitives'
export function App() {
  ${body}
  return (<Text>x</Text>)
}
`

describe('parse-crdt-surface — the un-lowered member scan', () => {
  const warn = (body: string) => swift(crdt(body)).warnings.join('\n')

  it('warns ONCE per distinct member even when the call repeats', () => {
    const w = warn(`const doc = new PyreonCrdtDoc('a')
      doc.transact(() => {})
      doc.transact(() => {})`)
    expect(w.match(/CrdtDoc\.transact/g) ?? []).toHaveLength(1)
  })

  it('stays quiet for a member that DOES lower, and for a map member', () => {
    const w = warn(`const doc = new PyreonCrdtDoc('a')
      const m = doc.getMap('m')
      m.set('k', 1)
      m.get('k')
      m.has('k')`)
    expect(w).not.toContain('NO native counterpart')
  })

  it('stays quiet for an UNKNOWN member on a doc binding — not ours to claim', () => {
    expect(warn(`const doc = new PyreonCrdtDoc('a')
      doc.somebodyElsesMethod()`)).not.toContain('NO native counterpart')
  })

  it('ignores a computed member call', () => {
    expect(warn(`const doc = new PyreonCrdtDoc('a')
      const k = 'transact'
      doc[k](() => {})`)).not.toContain('NO native counterpart')
  })

  it('skips a DESTRUCTURED doc declarator, so nothing downstream is claimed', () => {
    const w = warn(`const { doc } = { doc: new PyreonCrdtDoc('a') }
      doc.transact(() => {})`)
    expect(w).not.toContain('NO native counterpart')
  })

  it('does not treat a getMap on a NON-doc receiver as a map handle', () => {
    const w = warn(`const doc = new PyreonCrdtDoc('a')
      const notMap = other.thing.getMap('m')
      const alsoNot = somethingElse.getMap('m')
      notMap.transact(() => {})`)
    expect(w).not.toContain('CrdtMap')
  })

  it('bails before walking when the source merely MENTIONS the constructor', () => {
    const w = swift(`
import { Text } from '@pyreon/primitives'
// PyreonCrdtDoc is referenced only in this comment.
export function App() { return (<Text>x</Text>) }
`).warnings.join('\n')
    expect(w).not.toContain('NO native counterpart')
  })

  it('bails when the constructor is named but never bound to a declarator', () => {
    const w = swift(`
import { PyreonCrdtDoc } from '@pyreon/sync'
import { Text } from '@pyreon/primitives'
export function App() {
  register(PyreonCrdtDoc)
  return (<Text>x</Text>)
}
`).warnings.join('\n')
    expect(w).not.toContain('NO native counterpart')
  })

  it('walks past ARRAY HOLES in the tree it scans', () => {
    // A sparse array literal puts `null` into `elements`; the walker must step
    // over it rather than recurse into it.
    const w = warn(`const doc = new PyreonCrdtDoc('a')
      const sparse = [1, , 3]
      doc.destroy()`)
    expect(w).toContain('CrdtDoc.destroy')
  })
})
