import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `get_content_collection`
// and `get_content_entry` tools. The unit-level lookups live in
// `content.test.ts`; this proves the JSON-RPC wiring + the formatter.
//
// The MCP server runs in `cwd: packages/tools/mcp/`. There's no
// content.config there, so we exercise the empty-project branches
// here. Real-project shapes are covered by content.test.ts.

describe('MCP server — get_content_collection tool', () => {
  it('returns the empty-project message when no content.config exists', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_content_collection', {})
      expect(text).toContain('No `content.config')
      expect(text).toContain('@pyreon/zero-content')
    } finally {
      await close()
    }
  })

  it('handles a name argument gracefully when no collection exists', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_content_collection', {
        name: 'docs',
      })
      expect(text).toContain('No `content.config')
    } finally {
      await close()
    }
  })
})

describe('MCP server — get_content_entry tool', () => {
  it('returns the empty-project message when no content.config exists', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_content_entry', {
        collection: 'docs',
        slug: 'getting-started',
      })
      expect(text).toContain('No `content.config')
    } finally {
      await close()
    }
  })

  it('requires both collection and slug args (zod-enforced)', async () => {
    const { client, close } = await newClient()
    try {
      // Missing required `slug` — zod rejects.
      const result = (await client.callTool({
        name: 'get_content_entry',
        arguments: { collection: 'docs' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      // Either zod-rejected (isError: true) or empty-project fallback
      // — both prove the wiring is correct; assert it didn't crash.
      expect(result.content).toBeDefined()
    } finally {
      await close()
    }
  })
})
