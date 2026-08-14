// Three documented props on the canonical primitives lowered to NOTHING on
// either target, with no diagnostic:
//
//   <Text truncate>            → plain Text, so a label that should ellipsize
//                                wrapped instead, reflowing the layout around it
//   <Stack justify="between">  → bare VStack / Column
//   <Inline wrap>              → plain HStack / Row
//
// `align`, `gap`, `fit` and `axis` all lower correctly, which is what made
// these invisible: the props around them work, so an author has no reason to
// suspect the one that doesn't. Nothing surfaced them until the emitted output
// was read side by side with the web build.
//
// `truncate` is IMPLEMENTED here (both targets express it exactly). `justify`
// and `wrap` are DECLARED — see unlowered-layout-props.ts for why shipping the
// Compose half of `justify` alone would be worse than warning.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (jsx: string) => `
  import { Stack, Inline, Text } from '@pyreon/primitives'
  export function C() { return (${jsx}) }
`

const warnings = (jsx: string, target: 'swift' | 'kotlin') =>
  transform(app(jsx), { target }).warnings ?? []

const code = (jsx: string, target: 'swift' | 'kotlin') =>
  transform(app(jsx), { target }).code

describe('<Text truncate> lowers on both targets', () => {
  it('Swift bounds the line count AND sets the truncation mode', () => {
    // `.lineLimit(1)` alone CLIPS mid-glyph; the mode is what produces the
    // ellipsis, so both are part of the contract.
    const out = code(`<Text truncate>a long label</Text>`, 'swift')
    expect(out).toContain('.lineLimit(1)')
    expect(out).toContain('.truncationMode(.tail)')
  })

  it('Kotlin sets maxLines AND overflow', () => {
    // Symmetrically: `maxLines` alone clips, `overflow` alone has no line
    // bound to overflow past.
    const out = code(`<Text truncate>a long label</Text>`, 'kotlin')
    expect(out).toContain('maxLines = 1')
    expect(out).toContain('overflow = TextOverflow.Ellipsis')
  })

  it('a Text WITHOUT truncate is byte-unchanged', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = code(`<Text>plain</Text>`, target)
      expect(out, target).not.toContain('lineLimit')
      expect(out, target).not.toContain('maxLines')
    }
  })

  it('truncate does not warn — it is implemented, not declared', () => {
    expect(warnings(`<Text truncate>x</Text>`, 'swift')).toHaveLength(0)
    expect(warnings(`<Text truncate>x</Text>`, 'kotlin')).toHaveLength(0)
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift compiles', () => {
    const r = validateSwiftWithStubs(code(`<Text truncate>a long label</Text>`, 'swift'))
    expect(r.ok, r.error).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles', () => {
    // Guards the TextOverflow stub too: it mirrors the real
    // androidx.compose.ui.text.style surface, so a wrong constant would fail
    // here rather than on a device.
    const r = validateKotlin(code(`<Text truncate>a long label</Text>`, 'kotlin'))
    expect(r.ok, r.error).toBe(true)
  })
})

describe('layout props with no native lowering say so', () => {
  it.each(['start', 'center', 'between', 'around', 'evenly'])(
    'justify=%s warns on BOTH targets',
    (v) => {
      for (const target of ['swift', 'kotlin'] as const) {
        const w = warnings(`<Stack justify="${v}"><Text>x</Text></Stack>`, target)
        expect(w, `${v} on ${target}`).toHaveLength(1)
        expect(w[0]).toContain('justify')
        expect(w[0]).toContain('IGNORED')
      }
    },
  )

  it('wrap warns on BOTH targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = warnings(`<Inline wrap><Text>x</Text></Inline>`, target)
      expect(w, target).toHaveLength(1)
      expect(w[0]).toContain('wrap')
    }
  })

  it('names the tag the author actually wrote', () => {
    // Inline and Stack share one emitter; reporting `<Stack wrap>` for an
    // `<Inline>` would send the reader to the wrong line.
    expect(warnings(`<Inline wrap><Text>x</Text></Inline>`, 'swift')[0]).toContain('<Inline wrap>')
    expect(
      warnings(`<Stack justify="between"><Text>x</Text></Stack>`, 'swift')[0],
    ).toContain('<Stack justify>')
  })

  it('the props that DO lower stay silent', () => {
    // These are the contrast that made the gap invisible — and a regression
    // here would mean the warning had started over-firing.
    for (const jsx of [
      `<Stack gap={2}><Text>x</Text></Stack>`,
      `<Stack align="center"><Text>x</Text></Stack>`,
      `<Stack direction="row"><Text>x</Text></Stack>`,
    ]) {
      expect(warnings(jsx, 'swift'), jsx).toHaveLength(0)
      expect(warnings(jsx, 'kotlin'), jsx).toHaveLength(0)
    }
  })

  it('still emits a working stack — this warns, it does not refuse', () => {
    expect(code(`<Stack justify="between"><Text>x</Text></Stack>`, 'swift')).toContain('VStack')
    expect(code(`<Inline wrap><Text>x</Text></Inline>`, 'kotlin')).toContain('Row')
  })
})
