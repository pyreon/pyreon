import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — styler snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/styler —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/styler —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'styler/StyleSheet',
      'styler/ThemeContext',
      'styler/ThemeProvider',
      'styler/buildProps',
      'styler/clearNormCache',
      'styler/createGlobalStyle',
      'styler/createSheet',
      'styler/css',
      'styler/filterProps',
      'styler/isDynamic',
      'styler/keyframes',
      'styler/normalizeCSS',
      'styler/resolve',
      'styler/resolveValue',
      'styler/sheet',
      'styler/styled',
      'styler/useCSS',
      'styler/useTheme',
      'styler/useThemeAccessor',
    ])
  })

  it('carries the CSS-in-JS foot-gun catalog into MCP mistakes for flagship APIs', () => {
    const r = renderApiReferenceEntries(manifest)
    expect(r['styler/styled']?.mistakes).toContain('transient')
    expect(r['styler/css']?.mistakes).toContain('lazy')
    expect(r['styler/useTheme']?.mistakes).toContain('snapshot')
  })
})
