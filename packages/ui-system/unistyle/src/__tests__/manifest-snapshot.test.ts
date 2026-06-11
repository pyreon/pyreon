import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — unistyle snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/unistyle —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/unistyle —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'unistyle/alignContent',
      'unistyle/breakpoints',
      'unistyle/createMediaQueries',
      'unistyle/enrichTheme',
      'unistyle/extendCss',
      'unistyle/makeItResponsive',
      'unistyle/resolveCssVarReferences',
      'unistyle/stripUnit',
      'unistyle/styles',
      'unistyle/themeToCssVars',
      'unistyle/value',
    ])
  })

  it('themeToCssVars entry carries the unit-baking contract + foot-gun catalog', () => {
    const record = renderApiReferenceEntries(manifest)
    const entry = record['unistyle/themeToCssVars']!
    expect(entry.signature).toContain('themeToCssVars(theme')
    expect(entry.notes).toContain('--px-spacing-small: 0.5rem')
    expect(entry.mistakes).toContain('calc(')
    expect(entry.mistakes).toContain('breakpoints')
  })
})
