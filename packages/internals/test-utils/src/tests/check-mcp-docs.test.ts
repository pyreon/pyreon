import { compareRegistrations, parseRegisteredTools } from '../../../../../scripts/check-mcp-docs'

describe('check-mcp-docs — server ⇄ manifest', () => {
  it('parses every server.tool registration, single-line and wrapped', () => {
    const src = `
      server.tool('get_routes', {}, async () => {})
      server.tool(
        'get_content_entry',
        { slug: z.string() },
        async () => {},
      )
      server.tool("validate", {}, async () => {})
      // server.tools('not_a_registration')
    `
    expect(parseRegisteredTools(src)).toEqual(['get_routes', 'get_content_entry', 'validate'])
  })

  it('reports a registered tool the manifest does not describe', () => {
    expect(compareRegistrations(['a', 'b', 'c'], ['a', 'b'])).toEqual({
      notInManifest: ['c'],
      notRegistered: [],
    })
  })

  it('reports a manifest tool the server never registers', () => {
    expect(compareRegistrations(['a'], ['a', 'ghost'])).toEqual({
      notInManifest: [],
      notRegistered: ['ghost'],
    })
  })

  it('is clean when the two sets agree regardless of order', () => {
    expect(compareRegistrations(['b', 'a'], ['a', 'b'])).toEqual({ notInManifest: [], notRegistered: [] })
  })
})
