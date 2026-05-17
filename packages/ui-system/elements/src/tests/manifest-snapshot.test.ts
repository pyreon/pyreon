import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — elements snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/elements —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/elements —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'elements/Element',
      'elements/Iterator',
      'elements/List',
      'elements/Overlay',
      'elements/OverlayProvider',
      'elements/Portal',
      'elements/Provider',
      'elements/Text',
      'elements/Util',
      'elements/useOverlay',
    ])
  })

  it('carries the layout-in-attrs foot-gun on the Element entry', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(record['elements/Element']?.mistakes).toContain('Using `direction="row"` — invalid')
  })

  it('flags the Portal per-instance-wrapper assertion trap', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(record['elements/Portal']?.mistakes).toContain('document.body.firstChild')
  })
})
