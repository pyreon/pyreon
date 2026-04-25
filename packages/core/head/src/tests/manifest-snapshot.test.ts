import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

// Structural snapshot — locks in the manifest's contract with the
// gen-docs pipeline without inline-snapshotting the full prose
// (which rots on every wording change). Pairs with the en-masse
// `gen-docs --check` CI gate and the api-reference region marker.

describe('gen-docs — head snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/head —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/head —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'head/HeadProvider',
      'head/createHeadContext',
      'head/renderWithHead',
      'head/useHead',
    ])
  })
})
