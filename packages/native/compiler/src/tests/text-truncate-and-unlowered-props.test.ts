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
  import { Stack, Inline, Text, Link, Button } from '@pyreon/primitives'
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

describe('interaction props with no native lowering say so', () => {
  it('<Link external> warns — the link would route INTERNALLY instead', () => {
    // The worst of this family: not a layout nicety but a link that silently
    // does the wrong thing. Both PyreonLink runtimes call router.push(to)
    // unconditionally, so an external URL is matched as an in-app route.
    for (const target of ['swift', 'kotlin'] as const) {
      const w = warnings(`<Link to="https://example.com" external>go</Link>`, target)
      expect(w, target).toHaveLength(1)
      expect(w[0]).toContain('external')
      expect(w[0]).toContain('INTERNALLY')
    }
  })

  it('an INTERNAL link stays silent', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(`<Link to="/about">go</Link>`, target), target).toHaveLength(0)
    }
  })

  it('<Button variant> LOWERS on both targets — all four roles', () => {
    // Was inert on both, so a `danger` button was indistinguishable from a
    // confirm button — the case where the visual difference IS the safeguard.
    const sw = (v: string) => code(`<Button variant="${v}" onPress={() => {}}>Delete</Button>`, 'swift')
    expect(sw('secondary')).toContain('.buttonStyle(.bordered)')
    expect(sw('ghost')).toContain('.buttonStyle(.plain)')
    expect(sw('danger')).toContain('.buttonStyle(.borderedProminent).tint(.red)')

    // Compose expresses the role by swapping the COMPOSABLE, not by a
    // modifier — so the callee changes, not the arg list.
    const kt = (v: string) => code(`<Button variant="${v}" onPress={() => {}}>Delete</Button>`, 'kotlin')
    expect(kt('secondary')).toContain('OutlinedButton(')
    expect(kt('ghost')).toContain('TextButton(')
    expect(kt('danger')).toContain('ButtonDefaults.buttonColors(backgroundColor = MaterialTheme.colors.error)')
  })

  it('danger uses the Material 2 spelling, not Material 3', () => {
    // The emit's base is androidx.compose.material.*; `containerColor` and
    // `colorScheme` are M3 names that do not exist there. That exact
    // stub-masking bug shipped once with <Heading> typography, so it is
    // pinned rather than trusted.
    const out = code(`<Button variant="danger" onPress={() => {}}>x</Button>`, 'kotlin')
    expect(out).toContain('backgroundColor')
    expect(out).not.toContain('containerColor')
    expect(out).not.toContain('colorScheme')
  })

  it('primary and absent are BYTE-IDENTICAL to before', () => {
    // The default must not churn every existing app's output.
    for (const target of ['swift', 'kotlin'] as const) {
      const none = code(`<Button onPress={() => {}}>x</Button>`, target)
      const primary = code(`<Button variant="primary" onPress={() => {}}>x</Button>`, target)
      expect(primary, target).toBe(none)
      expect(none, target).not.toContain('buttonStyle')
      expect(none, target).not.toContain('OutlinedButton')
    }
  })

  it('a DYNAMIC variant warns rather than guessing', () => {
    // Swift cannot branch over two different opaque button styles, and
    // Compose cannot pick a composable at runtime — so a runtime value has no
    // faithful lowering on either.
    const src = `
      import { Button } from '@pyreon/primitives'
      export function C({ kind }: { kind: string }) {
        return (<Button variant={kind} onPress={() => {}}>x</Button>)
      }
    `
    for (const target of ['swift', 'kotlin'] as const) {
      const w = (transform(src, { target }).warnings ?? []).filter((x) => x.includes('variant'))
      expect(w, target).toHaveLength(1)
    }
  })

  it('an UNKNOWN variant warns and falls back', () => {
    const jsx = `<Button variant="fancy" onPress={() => {}}>x</Button>`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(warnings(jsx, target), target).toHaveLength(1)
      expect(code(jsx, target), target).not.toContain('buttonStyle')
    }
  })

  it.skipIf(!isSwiftcAvailable())('every variant compiles (Swift)', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger']) {
      const r = validateSwiftWithStubs(
        code(`<Button variant="${v}" onPress={() => {}}>Delete</Button>`, 'swift'),
      )
      expect(r.ok, `${v}: ${r.error}`).toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('every variant compiles (Kotlin)', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger']) {
      const r = validateKotlin(
        code(`<Button variant="${v}" onPress={() => {}}>Delete</Button>`, 'kotlin'),
      )
      expect(r.ok, `${v}: ${r.error}`).toBe(true)
    }
  })

  it('the interaction props that DO lower stay silent', () => {
    // onLongPress and onSwipeLeft genuinely lower (LongPressGesture /
    // combinedClickable, DragGesture / detectHorizontalDragGestures) — a
    // grep for the prop name in the emitters wrongly suggested otherwise, so
    // this pins the distinction.
    for (const jsx of [
      `<Button onPress={() => {}}>x</Button>`,
      `<Link to="/x">go</Link>`,
    ]) {
      expect(warnings(jsx, 'swift'), jsx).toHaveLength(0)
      expect(warnings(jsx, 'kotlin'), jsx).toHaveLength(0)
    }
  })
})
