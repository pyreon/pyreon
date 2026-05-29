import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — runtime-server snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/runtime-server —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/runtime-server —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'runtime-server/configureStoreIsolation',
      'runtime-server/decodeKeyFromMarker',
      'runtime-server/renderToStream',
      'runtime-server/renderToString',
      'runtime-server/runWithRequestContext',
    ])
  })

  it('carries the SSR foot-gun catalog into MCP mistakes for the flagship APIs', () => {
    const r = renderApiReferenceEntries(manifest)
    expect(r['runtime-server/renderToString']?.mistakes).toContain('one-shot')
    expect(r['runtime-server/renderToStream']?.mistakes).toContain('Suspense')
    expect(r['runtime-server/configureStoreIsolation']?.mistakes).toContain('global registry')
  })
})
