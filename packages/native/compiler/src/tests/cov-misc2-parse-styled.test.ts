// Branch-coverage matrix for `parse-styled.ts` — the standalone
// `styled('tag')\`css\`` → StyleIR frontend.
//
// Every spec pairs the source shape that TAKES an arm with the neighbouring
// shape that must not: a recognised tag against a rejected one, a resolved
// token interpolation against each way the recogniser bails, a valid
// declaration against each malformed one (which must WARN by name rather than
// silently vanish).

import { describe, expect, it } from 'vitest'
import { parseStyled } from '../parse-styled'

const names = (src: string) => parseStyled(src).styles.map((s) => s.name)
const props = (src: string) => parseStyled(src).styles[0]?.properties ?? []
const warns = (src: string) => parseStyled(src).warnings.join('\n')
/** Backtick / backslash by code point — writing either inline in this file's own
 *  template literals would be an escape the TS parser resolves before oxc sees it. */
const BT = String.fromCharCode(96)
const BS = String.fromCharCode(92)

describe('parse-styled — declaration shapes the walker accepts or skips', () => {
  it('collects a bare const AND an `export const`; an exported FUNCTION is walked past', () => {
    const src = `
      const A = styled('div')\`color: red;\`
      export const B = styled('div')\`color: blue;\`
      export function notAStyle() { return 1 }
      export class AlsoNot {}
    `
    expect(names(src)).toEqual(['A', 'B'])
  })

  it('skips a DESTRUCTURED declarator (no Identifier id) but keeps its sibling', () => {
    const src = `
      const { a } = styled('div')\`color: red;\`
      const [b] = styled('div')\`color: red;\`
      const Ok = styled('div')\`color: green;\`
    `
    expect(names(src)).toEqual(['Ok'])
  })

  it('skips a declarator with NO init, and one whose init is not a tagged template', () => {
    const src = `
      let noInit
      const plain = 5
      const call = styled('div')
      const Ok = styled('div')\`color: green;\`
    `
    expect(names(src)).toEqual(['Ok'])
  })

  it('unwraps TS-only layers on the init (`as unknown as X`) and still parses', () => {
    const src = `const A = (styled('div')\`color: red;\` as unknown) as never`
    expect(names(src)).toEqual(['A'])
  })
})

describe('parse-styled — the styled() tag argument', () => {
  it('accepts a string tag', () => {
    expect(names(`const A = styled('header')\`color: red;\``)).toEqual(['A'])
  })

  it('accepts an IDENTIFIER tag with an opaque-inner-component warning', () => {
    const src = `const A = styled(Base)\`color: red;\``
    expect(names(src)).toEqual(['A'])
    expect(warns(src)).toContain('inner-component is opaque')
  })

  it('rejects the member-call form (`x.styled(...)`), a non-styled callee, and a bare member tag', () => {
    const src = `
      const A = mod.styled('div')\`color: red;\`
      const B = other('div')\`color: red;\`
      const C = styled.div\`color: red;\`
      const Ok = styled('div')\`color: green;\`
    `
    expect(names(src)).toEqual(['Ok'])
    expect(warns(src)).not.toContain('opaque')
  })

  it('rejects styled() with NO argument, a numeric argument, and an object argument', () => {
    const src = `
      const A = styled()\`color: red;\`
      const B = styled(123)\`color: red;\`
      const C = styled({ x: 1 })\`color: red;\`
      const Ok = styled('div')\`color: green;\`
    `
    expect(names(src)).toEqual(['Ok'])
  })
})

describe('parse-styled — declaration splitting', () => {
  it('reads a static string value and a bare-numeric one as different StyleValue kinds', () => {
    expect(props(`const A = styled('div')\`padding: 16px; opacity: 0.5; z-index: -2;\``)).toEqual([
      { name: 'padding', value: { kind: 'string', value: '16px' } },
      { name: 'opacity', value: { kind: 'number', value: 0.5 } },
      { name: 'z-index', value: { kind: 'number', value: -2 } },
    ])
  })

  it('warns by name when a declaration has NO colon at all', () => {
    const src = `const A = styled('div')\`\${x}\``
    expect(props(src)).toEqual([])
    expect(warns(src)).toContain("no '<prop>: <value>' split found")
  })

  it('finds the colon in a LATER text part when an interpolation precedes it', () => {
    // parts = [text '', expr, text '\ncolor: red'] — the walker must skip the
    // expr part and keep scanning rather than giving up at part 0.
    const src = `const A = styled('div')\`\${x}
      color: red;\``
    expect(props(src)).toEqual([{ name: 'color', value: { kind: 'string', value: 'red' } }])
  })

  it('accumulates pre-colon parts, so an interpolation before the property name is ignored', () => {
    const src = `const A = styled('div')\`\${x} color: red;\``
    expect(props(src)).toEqual([{ name: 'color', value: { kind: 'string', value: 'red' } }])
  })

  it('warns on an invalid property name and on an EMPTY one', () => {
    const src = `const A = styled('div')\`1bad: red; : orphan; color: green;\``
    expect(props(src)).toEqual([{ name: 'color', value: { kind: 'string', value: 'green' } }])
    expect(warns(src)).toContain("invalid property name '1bad'")
    expect(warns(src)).toContain("invalid property name ''")
  })

  it('drops a declaration whose static value is blank, without a warning', () => {
    const src = `const A = styled('div')\`color: ; padding: 4px;\``
    expect(props(src)).toEqual([{ name: 'padding', value: { kind: 'string', value: '4px' } }])
    expect(warns(src)).toBe('')
  })

  it('ignores trailing separators and an all-whitespace body', () => {
    expect(props(`const A = styled('div')\`color: red;;;\n\n\``)).toEqual([
      { name: 'color', value: { kind: 'string', value: 'red' } },
    ])
    expect(props(`const A = styled('div')\`   \n  \``)).toEqual([])
  })

  it('survives a cooked-less quasi (an invalid escape in a tagged template)', () => {
    // A TAGGED template is allowed to carry an invalid escape sequence; oxc
    // reports `cooked: undefined` for that quasi, and the `?? ''` fallback is
    // what keeps the parse from throwing. The declaration still lands.
    const src = `const A = styled('div')${BT}color: red;${BS}unicode${BT}`
    expect(() => parseStyled(src)).not.toThrow()
    expect(names(src)).toEqual(['A'])
  })

  it('an ordinary CSS unicode escape (content: "\\2014") no longer drops the other declarations', () => {
    // `content: "\\2014"` is the ordinary CSS em-dash escape. A template
    // literal is split into quasis only at INTERPOLATIONS, so one invalid
    // escape used to make the whole body cooked-less (`cooked: null`, not
    // `undefined` — the code's `?? ''` fallback masked the distinction) and
    // every property beside it disappeared with no warning at all. Fixed:
    // parseCssTemplate falls back to the quasi's `raw` (its literal source
    // text, already in the type annotation and never consulted before) and
    // warns.
    const src = `const A = styled('div')${BT}color: red; padding: 4px; content: "${BS}2014";${BT}`
    const { styles, warnings } = parseStyled(src)
    const names = styles[0]?.properties.map((p) => p.name) ?? []
    expect(names).toContain('color')
    expect(names).toContain('padding')
    expect(warnings.length).toBeGreaterThan(0)
  })
})

describe('parse-styled — theme-token interpolations', () => {
  const tok = (expr: string) => props(`const A = styled('div')\`color: \${${expr}};\``)

  it('resolves the concise-arrow form and the block-return form identically', () => {
    const expected = [{ name: 'color', value: { kind: 'token', group: 'color', entry: 'primary' } }]
    expect(tok('(p) => p.theme.color.primary')).toEqual(expected)
    expect(tok('(p) => { return p.theme.color.primary }')).toEqual(expected)
  })

  it('leaves NO tail text part when the colon ends its quasi', () => {
    const src = `const A = styled('div')\`color:\${(p) => p.theme.color.primary};\``
    expect(props(src)).toEqual([
      { name: 'color', value: { kind: 'token', group: 'color', entry: 'primary' } },
    ])
  })

  it('bails on every non-token arrow shape, each with the unrecognised-interpolation warning', () => {
    const bad = [
      '() => 1', // no params
      '({ theme }) => theme.color.primary', // destructured param
      '(p) => { const x = 1; return x }', // block with >1 statement
      '(p) => { p.theme.color.primary }', // block with no return
      '(p) => { return }', // return with no argument
      "(p) => p.theme.color['primary']", // computed member
      '(p) => fn().theme.color.primary', // non-identifier chain root
      '(p) => q.theme.color.primary', // root is not the param
      '(p) => p.color.primary', // chain is not <p>.theme.<g>.<e>
      '(p) => p.theme.color.primary.base', // chain too long
      'someValue', // not an arrow at all
    ]
    for (const expr of bad) {
      const src = `const A = styled('div')\`color: \${${expr}};\``
      expect(props(src), expr).toEqual([])
      expect(warns(src), expr).toContain('unrecognised interpolation')
    }
  })

  it('bails when the value mixes an interpolation with non-blank text, or carries two', () => {
    const one = `const A = styled('div')\`padding: 4px \${(p) => p.theme.spacing.md};\``
    const two = `const A = styled('div')\`color: \${(p) => p.theme.color.primary}\${(p) => p.theme.color.danger};\``
    expect(props(one)).toEqual([])
    expect(warns(one)).toContain('unrecognised interpolation')
    expect(props(two)).toEqual([])
    expect(warns(two)).toContain('unrecognised interpolation')
  })
})

describe('parse-styled — parse failure', () => {
  it('throws a [Pyreon]-prefixed error naming the file', () => {
    expect(() => parseStyled('const = = =', 'broken.tsx')).toThrow(
      /\[Pyreon\] \[parse-styled\] failed to parse broken\.tsx/,
    )
  })
})

describe('parse-styled — residual split shapes', () => {
  it('keeps scanning past a NON-EMPTY text part that has no colon', () => {
    // The leading `  ` is its own text part with no `:`; the walker must move
    // on to the part after the interpolation rather than give up.
    const src = `const A = styled('div')\`  \${x}
      color: red;\``
    expect(props(src)).toEqual([{ name: 'color', value: { kind: 'string', value: 'red' } }])
  })
})
