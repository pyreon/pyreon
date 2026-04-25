import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — document-primitives snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/document-primitives —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/document-primitives —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'document-primitives/DocButton',
      'document-primitives/DocCode',
      'document-primitives/DocColumn',
      'document-primitives/DocDivider',
      'document-primitives/DocDocument',
      'document-primitives/DocHeading',
      'document-primitives/DocImage',
      'document-primitives/DocLink',
      'document-primitives/DocList',
      'document-primitives/DocListItem',
      'document-primitives/DocPage',
      'document-primitives/DocPageBreak',
      'document-primitives/DocQuote',
      'document-primitives/DocRow',
      'document-primitives/DocSection',
      'document-primitives/DocSpacer',
      'document-primitives/DocTable',
      'document-primitives/DocText',
      'document-primitives/createDocumentExport',
      'document-primitives/extractDocNode',
    ])
  })
})
