import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — compiler snapshot', () => {
  it('renders a llms.txt bullet starting with the package prefix', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/compiler —')).toBe(true)
  })

  it('renders a llms-full.txt section with the right header', () => {
    const section = renderLlmsFullSection(manifest)
    expect(section.startsWith('## @pyreon/compiler —')).toBe(true)
    expect(section).toContain('```typescript')
  })

  it('renders MCP api-reference entries for every api[] item', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).sort()).toEqual([
      'compiler/analyzeReactivity',
      'compiler/analyzeValidate',
      'compiler/auditIslands',
      'compiler/auditSsg',
      'compiler/auditTestEnvironment',
      'compiler/detectPyreonPatterns',
      'compiler/detectReactPatterns',
      'compiler/diagnoseError',
      'compiler/emitValidator',
      'compiler/formatIslandAudit',
      'compiler/formatReactivityLens',
      'compiler/formatSsgAudit',
      'compiler/formatTestAudit',
      'compiler/generateContext',
      'compiler/hasPyreonPatterns',
      'compiler/hasReactPatterns',
      'compiler/migrateReactCode',
      'compiler/transformDeferInline',
      'compiler/transformJSX',
      'compiler/transformJSX_JS',
    ])
  })

  it('flags the experimental Reactivity-Lens entries', () => {
    const r = renderApiReferenceEntries(manifest)
    expect(r['compiler/analyzeReactivity']?.notes).toContain('[EXPERIMENTAL]')
    expect(r['compiler/formatReactivityLens']?.notes).toContain('[EXPERIMENTAL]')
  })

  it('carries the foot-gun catalog into MCP mistakes for flagship APIs', () => {
    const r = renderApiReferenceEntries(manifest)
    expect(r['compiler/transformJSX']?.mistakes).toBeTruthy()
    expect(r['compiler/detectPyreonPatterns']?.mistakes).toContain('fixable')
  })
})
