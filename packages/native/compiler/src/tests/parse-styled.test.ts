// Tests for the styled() parser — TS source → StyleIR.

import { describe, expect, it } from 'vitest'
import { emitKotlinStyleModifier, emitSwiftStyleModifier } from '../emit-style'
import { parseStyled } from '../parse-styled'

describe('parse-styled — static CSS body', () => {
  it('parses a single styled() with all-static declarations', () => {
    const { styles, warnings } = parseStyled(`
      const Card = styled('div')\`
        background: red;
        padding: 16px;
        color: white;
      \`
    `)
    expect(warnings).toHaveLength(0)
    expect(styles).toHaveLength(1)
    expect(styles[0]).toEqual({
      name: 'Card',
      properties: [
        { name: 'background', value: { kind: 'string', value: 'red' } },
        { name: 'padding', value: { kind: 'string', value: '16px' } },
        { name: 'color', value: { kind: 'string', value: 'white' } },
      ],
    })
  })

  it('parses an exported styled()', () => {
    const { styles } = parseStyled(`
      export const Card = styled('div')\`
        background: red;
      \`
    `)
    expect(styles).toHaveLength(1)
    expect(styles[0]?.name).toBe('Card')
  })

  it('parses multiple styled() declarations in source order', () => {
    const { styles } = parseStyled(`
      const Card = styled('div')\`background: red;\`
      export const Shell = styled('section')\`padding: 8px;\`
    `)
    expect(styles.map((s) => s.name)).toEqual(['Card', 'Shell'])
  })

  it('emits number kind for unitless numeric values', () => {
    const { styles } = parseStyled(`
      const Faded = styled('div')\`
        opacity: 0.5;
        z-index: 10;
      \`
    `)
    expect(styles[0]?.properties).toEqual([
      { name: 'opacity', value: { kind: 'number', value: 0.5 } },
      { name: 'z-index', value: { kind: 'number', value: 10 } },
    ])
  })

  it('emits string kind for unit-bearing values (16px, 100%, 1rem)', () => {
    const { styles } = parseStyled(`
      const Box = styled('div')\`
        width: 100%;
        padding: 16px;
        line-height: 1.5rem;
      \`
    `)
    expect(styles[0]?.properties.map((p) => p.value)).toEqual([
      { kind: 'string', value: '100%' },
      { kind: 'string', value: '16px' },
      { kind: 'string', value: '1.5rem' },
    ])
  })

  it('accepts kebab-case property names', () => {
    const { styles } = parseStyled(`
      const X = styled('div')\`
        background-color: red;
        border-radius: 8px;
      \`
    `)
    expect(styles[0]?.properties.map((p) => p.name)).toEqual(['background-color', 'border-radius'])
  })
})

describe('parse-styled — TypeScript wrapper layers', () => {
  it('handles styled("div")<Props>`...` (generic type-param form)', () => {
    const { styles } = parseStyled(`
      type Props = { theme?: { bg: string } }
      const Shell = styled('div')<Props>\`
        background: blue;
      \`
    `)
    expect(styles).toHaveLength(1)
    expect(styles[0]?.name).toBe('Shell')
  })

  it('handles styled identifier arg (warns)', () => {
    const { styles, warnings } = parseStyled(`
      const Wrapper = styled(InnerComponent)\`
        padding: 8px;
      \`
    `)
    expect(styles).toHaveLength(1)
    expect(warnings.some((w) => w.includes('inner-component is opaque'))).toBe(true)
  })
})

describe('parse-styled — theme-token interpolations', () => {
  it('recognises p.theme.<group>.<entry> as a token ref', () => {
    const { styles, warnings } = parseStyled(`
      const Card = styled('div')\`
        background: \${(p) => p.theme.color.primary};
        padding: \${(p) => p.theme.spacing.md};
      \`
    `)
    expect(warnings).toHaveLength(0)
    expect(styles[0]?.properties).toEqual([
      { name: 'background', value: { kind: 'token', group: 'color', entry: 'primary' } },
      { name: 'padding', value: { kind: 'token', group: 'spacing', entry: 'md' } },
    ])
  })

  it('accepts any param name (props / p / theme)', () => {
    const { styles } = parseStyled(`
      const A = styled('div')\`color: \${(props) => props.theme.color.fg};\`
      const B = styled('div')\`color: \${(p) => p.theme.color.fg};\`
    `)
    expect(styles[0]?.properties[0]?.value).toEqual({ kind: 'token', group: 'color', entry: 'fg' })
    expect(styles[1]?.properties[0]?.value).toEqual({ kind: 'token', group: 'color', entry: 'fg' })
  })

  it('handles arrow with block body + single return', () => {
    const { styles } = parseStyled(`
      const Card = styled('div')\`
        background: \${(p) => { return p.theme.color.primary }};
      \`
    `)
    expect(styles[0]?.properties[0]?.value).toEqual({
      kind: 'token',
      group: 'color',
      entry: 'primary',
    })
  })

  it('warns + skips deeper-than-3-level chains', () => {
    const { styles, warnings } = parseStyled(`
      const Card = styled('div')\`
        background: \${(p) => p.theme.color.system.light};
      \`
    `)
    expect(styles[0]?.properties).toHaveLength(0)
    expect(warnings.some((w) => w.includes('unrecognised interpolation'))).toBe(true)
  })

  it('warns + skips non-arrow interpolations', () => {
    const { styles, warnings } = parseStyled(`
      const Card = styled('div')\`
        background: \${someValue};
      \`
    `)
    expect(styles[0]?.properties).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('mixes static + token-ref props', () => {
    const { styles } = parseStyled(`
      const Card = styled('div')\`
        padding: 16px;
        background: \${(p) => p.theme.color.primary};
        border-radius: 8px;
      \`
    `)
    expect(styles[0]?.properties).toHaveLength(3)
    expect(styles[0]?.properties[1]).toEqual({
      name: 'background',
      value: { kind: 'token', group: 'color', entry: 'primary' },
    })
  })
})

describe('parse-styled — edge cases', () => {
  it('handles a trailing semicolon', () => {
    const { styles } = parseStyled(`
      const X = styled('div')\`padding: 8px;\`
    `)
    expect(styles[0]?.properties).toHaveLength(1)
  })

  it('handles missing trailing semicolon', () => {
    const { styles } = parseStyled(`
      const X = styled('div')\`padding: 8px\`
    `)
    expect(styles[0]?.properties).toHaveLength(1)
  })

  it('skips empty template body', () => {
    const { styles } = parseStyled(`const X = styled('div')\`\``)
    expect(styles[0]?.properties).toHaveLength(0)
  })

  it('ignores non-styled tagged templates', () => {
    const { styles } = parseStyled(`
      const X = css\`background: red;\`
      const Y = html\`<div>x</div>\`
    `)
    expect(styles).toHaveLength(0)
  })

  it('throws on parse error', () => {
    expect(() => parseStyled('const X = styled(')).toThrow()
  })
})

describe('parse-styled → emit-style end-to-end', () => {
  it('parsed styled() emits canonical Swift ViewModifier', () => {
    const { styles } = parseStyled(`
      const PyreonPrimaryButton = styled('button')\`
        background: \${(p) => p.theme.color.primary};
        padding: \${(p) => p.theme.spacing.md};
        border-radius: \${(p) => p.theme.radius.md};
      \`
    `)
    expect(emitSwiftStyleModifier(styles[0]!)).toMatchInlineSnapshot(`
      "struct PyreonPrimaryButton: ViewModifier, PyreonStylable {
        static let pyreonSource = "PyreonPrimaryButton"
        func body(content: Content) -> some View {
          content
            .background(PyreonTokens.Color.primary)
            .padding(PyreonTokens.Spacing.md)
            .cornerRadius(PyreonTokens.Radius.md)
        }
      }"
    `)
  })

  it('parsed styled() emits canonical Kotlin Modifier', () => {
    const { styles } = parseStyled(`
      const PyreonPrimaryButton = styled('button')\`
        background: \${(p) => p.theme.color.primary};
        padding: \${(p) => p.theme.spacing.md};
      \`
    `)
    expect(emitKotlinStyleModifier(styles[0]!)).toMatchInlineSnapshot(`
      "fun pyreonPrimaryButton(): Modifier =
        Modifier
          .background(PyreonTokens.Color.primary)
          .padding(PyreonTokens.Spacing.md)"
    `)
  })
})
