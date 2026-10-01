// `styled(<Prim>)`css`` recognition and its CSS-template reader.
//
// Two layers, both silent by default and both easy to get wrong:
//
//  1. The TAG has to be a call to the bare identifier `styled` with a first
//     argument naming a CANONICAL primitive. Every other tagged template —
//     `css`…``, `obj.f(x)`…``, `styled()`…``, `styled(42)`…`` — must fall
//     through UNRECOGNISED rather than half-lower, and only the shape that got
//     as far as naming a primitive (`styled('div')`) earns the "no native
//     primitive" warning.
//
//  2. The TEMPLATE is split into declarations on `;` and on the first `:` of
//     each one. A declaration whose property side is empty, malformed, or
//     built out of an interpolation is DROPPED; a value built out of an
//     interpolation is dropped WITH a warning naming the property, because a
//     silently missing style is indistinguishable from one that never applied.
//
// Each spec pairs the shape that produces a style modifier with the one that
// must not, so the assertion reads the emit rather than the parser.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

const mod = (decls: string, tag = 'Boxy'): string =>
  `import { Stack, Text } from '${P}'
import { styled } from '@pyreon/styler'
${decls}
export function S() { return (<${tag}><Text>hi</Text></${tag}>) }`

const styledCss = (css: string): string => mod(`const Boxy = styled(Stack)\`${css}\``)

const swift = (src: string): string => transform(src, { target: 'swift' }).code
const kotlin = (src: string): string => transform(src, { target: 'kotlin' }).code
const warnings = (src: string): string[] => transform(src, { target: 'swift' }).warnings
const styledWarnings = (src: string): string[] =>
  warnings(src).filter((w) => w.startsWith('styled('))

describe('styled() tag recognition', () => {
  it('styled(<canonical primitive>) lowers the declarations on BOTH targets', () => {
    const src = styledCss('padding: 4px;')
    expect(swift(src)).toContain('.padding(4)')
    expect(kotlin(src)).toContain('padding')
    expect(warnings(src)).toEqual([])
  })

  it("styled('<html tag>') names the primitive it could not resolve", () => {
    // The string-literal argument IS read — that is what lets the warning quote
    // `styled('div')` back rather than printing a generic "unsupported tag".
    const w = warnings(mod("const Boxy = styled('div')`padding: 4px;`"))
    expect(w.some((m) => m.includes("styled('div') on 'Boxy'") && m.includes("'div' has no native"))).toBe(true)
    expect(swift(mod("const Boxy = styled('div')`padding: 4px;`"))).not.toContain('.padding(4)')
  })

  it('a non-canonical IDENTIFIER argument is named the same way', () => {
    const w = warnings(mod('const Boxy = styled(MyThing)`padding: 4px;`'))
    expect(w.some((m) => m.includes("styled(MyThing) on 'Boxy'"))).toBe(true)
  })

  it('a tagged template whose tag is NOT a call is not a styled() declaration', () => {
    // `css`…`` is the shape most likely to sit beside a styled() one.
    const src = mod('const Boxy = css`padding: 4px;`')
    expect(swift(src)).not.toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('a tagged template whose tag calls something OTHER than `styled` is ignored', () => {
    const member = mod('const Boxy = theme.make(Stack)`padding: 4px;`')
    expect(swift(member)).not.toContain('.padding(4)')
    expect(styledWarnings(member)).toEqual([])

    const otherFn = mod('const Boxy = styledish(Stack)`padding: 4px;`')
    expect(swift(otherFn)).not.toContain('.padding(4)')
    expect(styledWarnings(otherFn)).toEqual([])
  })

  it('styled() with NO argument is ignored — there is no primitive to name', () => {
    const src = mod('const Boxy = styled()`padding: 4px;`')
    expect(swift(src)).not.toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('styled(<non-name literal>) is ignored rather than warned about', () => {
    // A numeric argument names no primitive at all, so quoting it back in the
    // "has no native primitive" line would be misleading.
    const src = mod('const Boxy = styled(42)`padding: 4px;`')
    expect(swift(src)).not.toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('a styled() declaration that is not a tagged template at all is ignored', () => {
    const src = mod('const Boxy = styled(Stack)')
    expect(styledWarnings(src)).toEqual([])
  })
})

describe('styled() CSS template — declaration splitting', () => {
  it('several declarations on one line each lower', () => {
    const code = swift(styledCss('padding: 4px; opacity: 0.5;'))
    expect(code).toContain('.padding(4)')
    expect(code).toContain('.opacity(0.5)')
  })

  it('a numeric value becomes a number, not the string spelling of one', () => {
    // `.opacity("0.5")` would not compile; the value has to be read as a number.
    expect(swift(styledCss('opacity: 0.5;'))).toContain('.opacity(0.5)')
  })

  it('a declaration with NO colon is dropped, and does not disturb its neighbour', () => {
    const code = swift(styledCss('notadeclaration; padding: 4px;'))
    expect(code).toContain('.padding(4)')
  })

  it('an EMPTY property name is dropped silently', () => {
    const src = styledCss(': red; padding: 4px;')
    expect(swift(src)).toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('a property name that is not a CSS identifier is dropped silently', () => {
    const src = styledCss('1bad: red; padding: 4px;')
    expect(swift(src)).toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('an EMPTY value is dropped silently', () => {
    const src = styledCss('padding:; opacity: 0.5;')
    expect(swift(src)).not.toContain('.padding(')
    expect(swift(src)).toContain('.opacity(0.5)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('a kebab-case property is read under its camelCase key', () => {
    // The connector reads camelCase, so `border-radius` has to arrive as
    // `borderRadius` or the declaration is dropped on the floor.
    expect(swift(styledCss('border-radius: 6px;'))).toContain('cornerRadius(6)')
  })
})

describe('styled() CSS template — interpolations', () => {
  it('an interpolation in the PROPERTY position drops the declaration silently', () => {
    // The warning names a property; a declaration whose property is itself an
    // interpolation has no name to print, so it is dropped without one.
    const src = styledCss('${prop}: red; padding: 4px;')
    expect(swift(src)).toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('an interpolation BEFORE the colon is part of the property name, so the declaration is dropped', () => {
    const src = styledCss('${prefix}color: red; padding: 4px;')
    expect(swift(src)).toContain('.padding(4)')
    expect(styledWarnings(src)).toEqual([])
  })

  it('a SINGLE interpolation as the whole value warns by property name', () => {
    // No text between the colon and the interpolation — the "resolvable theme
    // token?" question, answered no here because `runtime` is not one.
    const w = styledWarnings(styledCss('color:${runtime}'))
    expect(w.some((m) => m.includes("'Boxy'") && m.includes('[color]'))).toBe(true)
  })

  it('an interpolation MIXED with literal text warns by property name', () => {
    const w = styledWarnings(styledCss('color: red ${runtime};'))
    expect(w.some((m) => m.includes('[color]'))).toBe(true)
  })

  it('TWO interpolations in one value warn by property name', () => {
    const w = styledWarnings(styledCss('color: ${a} ${b};'))
    expect(w.some((m) => m.includes('[color]'))).toBe(true)
  })

  it('every dropped property is named in ONE warning', () => {
    const w = styledWarnings(styledCss('color: ${a}; background: ${b}; padding: 4px;'))
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('[color, background]')
    // The static neighbour still lowers.
    expect(swift(styledCss('color: ${a}; padding: 4px;'))).toContain('.padding(4)')
  })

  it('a fully static template warns about nothing', () => {
    expect(styledWarnings(styledCss('padding: 4px; opacity: 0.5;'))).toEqual([])
  })
})

describe('styled() CSS template — an interpolation INSIDE the property name', () => {
  it('the literal fragments around it concatenate and the interpolation is dropped', () => {
    // `pad${x}ding` reads as `padding`: the property side keeps every TEXT part
    // and contributes '' for each interpolation. Pinned as observed behaviour —
    // the same rule that drops a whole-property interpolation, seen from the
    // side where literal text survives on both sides of one.
    const src = styledCss('pad${x}ding: 4px; opacity: 0.5;')
    expect(swift(src)).toContain('.padding(4)')
    expect(swift(src)).toContain('.opacity(0.5)')
    expect(styledWarnings(src)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// KNOWN BUG — locked with `it.fails`, self-retiring when the product is fixed.
// ---------------------------------------------------------------------------

describe('CSS escapes preserve sibling declarations', () => {
  it.each(['\\2014', '\\f101', '\\000041'])(
    '%s keeps static declarations when a tagged template has no cooked value', (escape) => {
      const source = styledCss(`padding: 4px; content: "${escape}"; opacity: 0.5;`)
      expect(swift(source)).toContain('.padding(4)')
      expect(swift(source)).toContain('.opacity(0.5)')
      expect(kotlin(source)).toContain('padding')
    },
  )

  it('retains declarations in separate quasis around a theme interpolation', () => {
    const source = mod('const Boxy = styled(Stack)`padding: 4px; content: "\\2014"; color: ${() => "red"}; opacity: 0.5;`')
    expect(swift(source)).toContain('.padding(4)')
    expect(swift(source)).toContain('.opacity(0.5)')
    expect(styledWarnings(source).join(' ')).toContain('color')
  })
})
