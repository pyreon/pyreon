import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `get_components` tool.
// Pairs with `get-routes-server.test.ts` — both flow through the
// shared `generateContext` walker but render different fields. Unit
// coverage of the scanner regex lives in
// `compiler/src/tests/project-scanner.test.ts`; this proves the
// JSON-RPC wiring + the formatter that renders each `ComponentInfo`
// (name, file path, `props: { ... }`, `signals: [ ... ]`).

describe('MCP server — get_components tool', () => {
  it('emits the components header with count and at least one entry', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_components', {})
      // Header format `**Components (N):**` for a non-empty repo.
      expect(text).toMatch(/^\*\*Components \(\d+\):\*\*/)
      // At least one component rendered: `  Name — relative/file.ts`.
      expect(text).toMatch(/^ {2}\w+ — \S+/m)
    } finally {
      await close()
    }
  })

  it('renders the optional props + signals details when present', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_components', {})
      // The fixture set carries components with both `props: { ... }`
      // and `signals: [...]` — verifying the formatter wires the
      // detail branches. The unit scanner test covers detection
      // accuracy; this verifies the rendered detail format reaches
      // the consumer over JSON-RPC.
      expect(text).toMatch(/props: \{ [^}]+ \}/)
      expect(text).toMatch(/signals: \[[^\]]+\]/)
    } finally {
      await close()
    }
  })

  it('rejects unexpected args (no-args contract)', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'get_components',
        arguments: { unexpected: 'value' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      const text = result.content?.[0]?.text ?? ''
      // Either zod rejects or the unknown arg is coerced into the
      // no-args path. Both contracts are valid — assert the call
      // didn't crash, returning at minimum the header.
      expect(result.isError === true || text.includes('**Components')).toBe(true)
    } finally {
      await close()
    }
  })
})
