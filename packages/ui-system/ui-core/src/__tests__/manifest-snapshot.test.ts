import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — ui-core snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/ui-core —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/ui-core —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'ui-core/HTML_TAGS / HTML_TEXT_TAGS',
      'ui-core/PyreonUI',
      'ui-core/compose',
      'ui-core/cssVariablesPrePaintScript',
      'ui-core/get / set / merge / pick / omit / isEmpty / isEqual',
      'ui-core/getThemeEngine / setThemeEngine',
      'ui-core/hoistNonReactStatics',
      'ui-core/init',
      'ui-core/isPyreonComponent',
      'ui-core/render',
      'ui-core/resolveCssVariables',
      'ui-core/resolveSlot',
      'ui-core/throttle',
      'ui-core/useMode',
      'ui-core/useRootSize',
      'ui-core/useSpacing',
      'ui-core/useStableValue',
      'ui-core/useThemeValue',
    ])
  })
})
