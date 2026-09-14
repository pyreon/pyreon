/**
 * `parseCssTemplate` reads each quasi's `cooked` text and fell back to `''`
 * when it was `undefined` — which oxc produces for a WHOLE quasi segment the
 * moment it contains ANY escape it cannot interpret (a legacy octal-style
 * `\2014`, an invalid `\u`), not just for the offending character. A
 * `TemplateLiteral` splits into quasis only at `${...}` boundaries, so one
 * bad escape anywhere in a segment silently dropped EVERY property
 * declaration sharing that segment, with zero warnings.
 */
import { describe, expect, it } from 'vitest'
import { parseStyled } from '../parse-styled'

describe('a CSS template segment with an unparseable escape', () => {
  it('does not drop the OTHER declarations sharing its segment', () => {
    const { styles, warnings } = parseStyled(`
      const Card = styled('div')\`
        content: "\\2014";
        color: red;
        padding: 4px;
      \`
    `)
    const names = styles[0]?.properties.map((p) => p.name) ?? []
    expect(names).toContain('color')
    expect(names).toContain('padding')
    expect(warnings.join('\n')).toMatch(/could not (be )?interpret|escape/)
  })

  it('still parses a segment with no bad escape, unaffected (the control)', () => {
    const { styles, warnings } = parseStyled(`
      const Card = styled('div')\`
        color: red;
        padding: 4px;
      \`
    `)
    const names = styles[0]?.properties.map((p) => p.name) ?? []
    expect(names).toEqual(['color', 'padding'])
    expect(warnings).toHaveLength(0)
  })
})
