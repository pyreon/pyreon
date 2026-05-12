import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `get_api` tool. The
// unit-level coverage of `API_REFERENCE` itself lives in
// `api-reference.test.ts` (manifest-generation contract + structural
// shape). This test proves the JSON-RPC wiring: zod validates the
// `package` + `symbol` args, the handler looks up `API_REFERENCE[key]`
// against the merged manifest output, and the formatter assembles the
// markdown response. Pairs with the manifest-driven docs pipeline
// (T2.5.1) — every entry in `api-reference.ts` flows through this tool.

describe('MCP server — get_api tool', () => {
  it('returns signature + usage for a known symbol', async () => {
    const { client, close } = await newClient()
    try {
      // `signal` is one of the foundational reactivity APIs — every
      // manifest in the pipeline must publish it, so this is a stable
      // assertion for the JSON-RPC contract.
      const text = await callTool(client, 'get_api', {
        package: 'reactivity',
        symbol: 'signal',
      })
      expect(text).toContain('## @pyreon/reactivity — signal')
      expect(text).toContain('**Signature:**')
      expect(text).toContain('```typescript')
      expect(text).toContain('**Usage:**')
    } finally {
      await close()
    }
  })

  it('returns a not-found message with suggestions for an unknown symbol', async () => {
    const { client, close } = await newClient()
    try {
      // `sig` is intentionally a substring of real entries (`signal`,
      // `Signal`, ...) so the substring-match suggestion path fires —
      // the handler does `allKeys.filter(k => k.includes(symbol))`.
      const text = await callTool(client, 'get_api', {
        package: 'reactivity',
        symbol: 'sig',
      })
      expect(text).toContain("Symbol 'sig' not found")
      expect(text).toContain('Did you mean')
      // The matcher should surface real signal-related entries.
      expect(text).toMatch(/reactivity\/\w*[Ss]ig/)
    } finally {
      await close()
    }
  })

  it('rejects missing required args via zod', async () => {
    // Both `package` and `symbol` are required; omitting one must
    // produce a JSON-RPC error rather than silently returning an
    // empty response.
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'get_api',
        arguments: { package: 'reactivity' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })
})
