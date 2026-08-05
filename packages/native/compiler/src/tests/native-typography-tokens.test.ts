// Typography theme tokens in styled() templates — the styling row's named
// absent ("typography has no native example") turned out to sit on TWO
// compiler gaps, not a missing example:
//
//   1. GROUP_ALIAS knew only color/spacing/radius — a `fontSize`/`fontWeight`
//      group in defineTheme was structurally unresolvable, so
//      `font-size: ${(t) => t.fontSize.body}` warn-DROPPED while the padding
//      token beside it resolved.
//   2. collectTheme (parse.ts) hand-enumerated the three old groups
//      (`Object.assign(acc.color/spacing/radius)`), so even with the groups
//      added to ThemeTable the app's parsed fontSize entries were silently
//      discarded before merge — app-declared sizes dropped while
//      fontWeight.bold "worked" only because DEFAULT_THEME carries bold:700
//      (masked-by-default, the exact reason the fix accumulates GENERICALLY
//      over whatever parseThemeDefinition returns).
//
// The canonical group names mirror @pyreon/ui-theme (fontSize/fontWeight);
// plural aliases match the market convention (fontSizes/fontWeights).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
import { Stack, Text } from '@pyreon/primitives'
import { defineTheme, styled } from '@pyreon/styler'
const _theme = defineTheme({
  fontSize: { body: 16, display: 34 },
  fontWeight: { bold: 700 },
  color: { accent: '#ff3b30' },
})
const BodyLine = styled(Text)\`
  font-size: \${(t) => t.fontSize.body};
\`
const DisplayLine = styled(Text)\`
  font-size: \${(t) => t.fontSize.display};
  font-weight: \${(t) => t.fontWeight.bold};
\`
const AccentChip = styled(Text)\`
  color: #ffffff;
  background-color: \${(t) => t.color.accent};
  padding: 8;
\`
export function TypoPage() {
  return (
    <Stack gap={3}>
      <BodyLine data-testid="typo-body">Aa</BodyLine>
      <DisplayLine data-testid="typo-display">Aa</DisplayLine>
      <AccentChip data-testid="accent-chip">chip</AccentChip>
    </Stack>
  )
}
`

describe('typography theme tokens (fontSize/fontWeight groups)', () => {
  it('Swift: app-declared fontSize tokens bake into .font(.system(...)) — zero warnings', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // `body: 16` and `display: 34` are APP values absent from DEFAULT_THEME —
    // they can only appear via the app theme surviving collectTheme's merge.
    expect(r.code).toContain('.font(.system(size: 16))')
    expect(r.code).toContain('.font(.system(size: 34, weight: .bold))')
  })

  it('Kotlin: the same tokens bake into fontSize = N.sp / FontWeight', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('fontSize = 16.sp')
    expect(r.code).toContain('fontSize = 34.sp, fontWeight = FontWeight.Bold')
  })

  it('colour token from the same theme still resolves beside typography (both targets)', () => {
    const swift = transform(SRC, { target: 'swift' }).code
    const kotlin = transform(SRC, { target: 'kotlin' }).code
    expect(swift).toContain('red: 1.000, green: 0.231, blue: 0.188')
    expect(kotlin).toContain('Color(0xFFFF3B30)')
  })

  it('plural aliases fontSizes/fontWeights resolve to the same groups', () => {
    const alias = SRC.replace('fontSize: {', 'fontSizes: {').replace('fontWeight: {', 'fontWeights: {')
    const r = transform(alias, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.font(.system(size: 34, weight: .bold))')
  })

  it('an unknown group still warn-drops (the guard did not become accept-anything)', () => {
    const bogus = SRC.replace('t.fontSize.display', 't.mystery.display')
    const r = transform(bogus, { target: 'swift' })
    expect(r.warnings.some((w) => String(w).includes("isn't a resolvable theme token"))).toBe(true)
  })
})
