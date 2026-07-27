/**
 * Drift guard for the generated doc surfaces.
 *
 * `bun run gen-docs` renders this manifest into `llms.txt`,
 * `llms-full.txt` and the MCP api-reference. These snapshots fail loudly
 * when the rendered shape changes, so a manifest edit cannot silently
 * rewrite three generated files.
 */
import { renderApiReferenceEntries, renderLlmsTxtLine } from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — http snapshot', () => {
  it('renders a single llms.txt bullet', () => {
    const line = renderLlmsTxtLine(manifest)
    expect(line.startsWith('- @pyreon/http — ')).toBe(true)
    expect(line).toContain('Transport layer under @pyreon/query')
    expect(line.split('\n')).toHaveLength(1)
  })

  it('renders MCP api-reference entries with the foot-gun catalogue intact', () => {
    const record = renderApiReferenceEntries(manifest)

    expect(Object.keys(record).sort()).toEqual([
      'http/HttpClient',
      'http/HttpMiddleware',
      'http/createHttp',
      'http/createMock',
      'http/endpoint',
      'http/retry',
      'http/runWithRequest',
      'http/standardSchema',
    ])

    // The entries an assistant is most likely to get wrong must carry
    // their mistakes list — that is the whole value of the MCP surface.
    expect(record['http/createHttp']!.mistakes?.split('\n').length).toBe(6)
    expect(record['http/createHttp']!.mistakes).toContain('defaults')
    expect(record['http/retry']!.notes).toContain('compound')
    expect(record['http/runWithRequest']!.notes).toContain('AsyncLocalStorage')
    expect(record['http/endpoint']!.notes).toContain('queryKey')
  })

  it('declares itself universal, so no browser smoke is required', () => {
    expect(manifest.category).toBe('universal')
  })
})
