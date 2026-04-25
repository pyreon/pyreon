import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — mcp snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/mcp —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/mcp —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'mcp/audit_test_environment',
      'mcp/diagnose',
      'mcp/get_anti_patterns',
      'mcp/get_api',
      'mcp/get_browser_smoke_status',
      'mcp/get_changelog',
      'mcp/get_components',
      'mcp/get_pattern',
      'mcp/get_routes',
      'mcp/migrate_react',
      'mcp/validate',
    ])
  })
})
