// The REFUSAL arms of `lowerObject` / `emitPadding` / `emitFrameConstraints` /
// `emitDynamic` in `style-to-native.ts` — one per property, each proving that
// an unusable value is DROPPED WITH A NAMED DIAGNOSTIC rather than silently.
//
// This is the half of the connector that has no visible output, which is
// exactly why it needs asserting: a property whose value cannot resolve emits
// nothing on both targets, so "the modifier is missing" and "the property was
// never written" look identical in the generated code. The warning is the only
// observable difference, and each property has its OWN `break`/guard.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

function app(style: string): string {
  return `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function App() {
  const on = signal(true)
  const v = signal(1)
  return (<Stack style={${style}}><Text>x</Text></Stack>)
}`
}

const code = (style: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(style), { target }).code
const warns = (style: string, target: 'swift' | 'kotlin' = 'swift'): string =>
  transform(app(style), { target }).warnings.join('\n')

describe('a DYNAMIC value is refused per property, by name, on both targets', () => {
  it.each([
    'padding',
    'paddingTop',
    'paddingX',
    'paddingY',
    'borderRadius',
    'borderWidth',
    'borderColor',
    'borderStyle',
    'border',
    'background',
    'opacity',
    'width',
    'height',
    'minWidth',
    'maxHeight',
    'aspectRatio',
    'color',
  ])('`%s` with a signal-read value warns and emits nothing', (prop) => {
    const style = `{ ${prop}: v() }`
    const w = warns(style)
    expect(w).toContain(`[${prop}] are not literal`)
    // Nothing was emitted from it — the drop is total, not partial.
    expect(code(style)).not.toContain('.padding(v')
    expect(code(style)).not.toContain('.frame(width: v')
    // Kotlin refuses identically (one shared `lit()` guard).
    expect(warns(style, 'kotlin')).toContain(`[${prop}] are not literal`)
  })
})

describe('an UNPARSEABLE literal is refused per property, by its own guard', () => {
  it.each([
    ['paddingX', `'1em'`],
    ['paddingY', `'1em'`],
    ['paddingTop', `'1em'`],
    ['borderRadius', `'1em'`],
    ['borderWidth', `'1em'`],
    ['width', `'1em'`],
    ['minWidth', `'1em'`],
    ['background', `'papayawhip'`],
    ['borderColor', `'papayawhip'`],
    ['opacity', `'opaque'`],
    ['aspectRatio', `'wide'`],
  ])('`%s: %s` is reported as unparseable', (prop, val) => {
    expect(warns(`{ ${prop}: ${val} }`)).toContain(`[${prop}] could not be parsed`)
  })

  it('a BOOLEAN literal value is not a dimension or a colour — it resolves to nothing', () => {
    // `lit()` returns undefined for a non string/number literal, so the
    // property is skipped before any parser sees it.
    expect(code(`{ padding: true }`)).not.toContain('.padding(')
    expect(code(`{ padding: true }`, 'kotlin')).not.toContain('.padding(')
  })

  it('a border shorthand naming ONLY a style token resolves neither width nor colour', () => {
    // `matched` is true (the `solid` token matched), so it is not "unparseable"
    // — but width and colour both stay undefined, so no border is emitted and
    // the incomplete-border diagnostic is what fires.
    expect(code(`{ border: 'solid' }`)).not.toContain('.overlay(')
    expect(warns(`{ border: 'solid' }`)).toBe('')
  })

  it('a border shorthand with ONLY a width gets the incomplete-border diagnostic', () => {
    expect(warns(`{ border: '1px' }`)).toContain('only borderWidth was given')
  })

  it('a border shorthand with ONLY a colour gets the mirrored diagnostic', () => {
    expect(warns(`{ border: '#ff0000' }`)).toContain('only borderColor was given')
  })
})

describe('emitPadding / emitFrameConstraints — the remaining per-target arms', () => {
  it('LEFT and RIGHT differing, with no vertical, falls to the per-side form', () => {
    // Not hOnly (left !== right) and not vOnly (both undefined), so neither
    // collapse fires and the Kotlin branch emits with NO `top`.
    expect(code(`{ paddingLeft: 1, paddingRight: 2 }`)).toContain(
      '.padding(.leading, 1).padding(.trailing, 2)',
    )
    expect(code(`{ paddingLeft: 1, paddingRight: 2 }`, 'kotlin')).toContain(
      '.padding(start = 1.dp, end = 2.dp)',
    )
  })

  it('TOP and BOTTOM differing emits the vertical pair with no horizontal', () => {
    expect(code(`{ paddingTop: 1, paddingBottom: 2 }`, 'kotlin')).toContain(
      '.padding(top = 1.dp, bottom = 2.dp)',
    )
  })

  it('a MAX-only width constraint emits `widthIn(max = …)` with no `min`', () => {
    expect(code(`{ maxWidth: 10 }`, 'kotlin')).toContain('.widthIn(max = 10.dp)')
    expect(code(`{ maxWidth: 10 }`, 'kotlin')).not.toContain('min =')
  })

  it('a MIN-only height constraint emits `heightIn(min = …)` with no `max`', () => {
    expect(code(`{ minHeight: 10 }`, 'kotlin')).toContain('.heightIn(min = 10.dp)')
    expect(code(`{ minHeight: 10 }`, 'kotlin')).not.toContain('max =')
  })
})

describe('emitDynamic — a composite slot present ONLY in the `otherwise` branch', () => {
  const NONE = `{ cursor: 'pointer' }`

  it('a border only in `otherwise`: nothing is emitted (the THEN branch has none), and it warns', () => {
    const style = `on() ? ${NONE} : { borderWidth: 1, borderColor: '#ff0000' }`
    // `emitBorder` is called on the THEN branch, which has no border, so it
    // returns undefined and nothing is pushed — the warning is the only signal.
    expect(code(style)).not.toContain('.overlay(')
    expect(warns(style)).toContain('property [border] differ in shape')
  })

  it('frame constraints only in `otherwise` behave the same way', () => {
    const style = `on() ? ${NONE} : { minWidth: 5 }`
    expect(code(style)).not.toContain('.frame(minWidth')
    expect(warns(style)).toContain('[minWidth/minHeight] differ in shape')
  })

  it('the MIRROR (present only in `then`) DOES emit — so the asymmetry is real', () => {
    const style = `on() ? { borderWidth: 1, borderColor: '#ff0000' } : ${NONE}`
    expect(code(style)).toContain('.overlay(')
  })
})

describe('extractTextTypography — a ternary branch that is NOT an object literal', () => {
  it('declines the Kotlin conditional-colour lift and falls through to the generic refusal', () => {
    const style = `on() ? { color: '#00aa00' } : v()`
    expect(code(style, 'kotlin')).not.toContain('color = if (')
    expect(warns(style, 'kotlin')).toContain('only a static inline-style object literal')
  })

  it('a ternary with an object THEN and a non-object OTHERWISE is refused on Swift too', () => {
    expect(warns(`on() ? { padding: 4 } : v()`)).toContain(
      'only a static inline-style object literal',
    )
  })
})
