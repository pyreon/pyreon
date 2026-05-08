import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'
import manifest from '../manifest'

// Real MCP server <-> client round-trip via InMemoryTransport, mirroring
// `server-integration.test.ts`. Locks the discoverability contract end-to-end:
// `tools/list` exposes `mcp_overview`, calling it returns a row per
// registered tool with summary-derived "when to use" + example-first-line.

async function newConnectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  const server = createServer()
  await server.connect(serverTransport)

  const client = new Client({ name: 'test', version: '0.0.0' })
  await client.connect(clientTransport)

  return {
    client,
    close: async () => {
      await client.close()
      await server.close()
    },
  }
}

describe('MCP server — mcp_overview tool over real JSON-RPC transport', () => {
  it('lists mcp_overview alongside every other registered tool', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const list = await client.listTools()
      const names = list.tools.map((t) => t.name).sort()
      expect(names).toContain('mcp_overview')
      // The manifest is the source of truth for the tool catalog. Every tool
      // entry there ('tool: ' signature prefix) must be reachable via tools/list.
      const expected = manifest.api
        .filter((e) => e.signature.startsWith('tool: '))
        .map((e) => e.name)
      for (const tool of expected) {
        expect(names).toContain(tool)
      }
    } finally {
      await close()
    }
  })

  it('returns a markdown table with one row per registered tool', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const result = (await client.callTool({
        name: 'mcp_overview',
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> }

      expect(result.content).toHaveLength(1)
      expect(result.content[0]!.type).toBe('text')
      const text = result.content[0]!.text

      // Header line carries the count.
      const expectedTools = manifest.api
        .filter((e) => e.signature.startsWith('tool: '))
        .map((e) => e.name)
      expect(text).toMatch(new RegExp(`MCP Tools \\(${expectedTools.length}\\):`))

      // Markdown table delimiter + header row.
      expect(text).toContain('| Tool | When to use | Example |')
      expect(text).toContain('|---|---|---|')

      // Every manifest tool name appears as a backticked cell.
      for (const tool of expectedTools) {
        expect(text).toContain('`' + tool + '`')
      }
    } finally {
      await close()
    }
  })

  it('derives `when to use` from the manifest summary first sentence', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const result = (await client.callTool({
        name: 'mcp_overview',
        arguments: {},
      })) as { content: Array<{ type: string; text: string }> }
      const text = result.content[0]!.text

      // Split into the data rows (skip header + delimiter).
      const lines = text.split('\n').filter((l) => l.startsWith('| `'))
      expect(lines.length).toBeGreaterThanOrEqual(13) // current count, grows over time

      // Every row has exactly 3 pipe-delimited columns (4 pipes including the
      // outer two). Empty cells are still cells — table shape must be uniform.
      for (const line of lines) {
        const columnCount = (line.match(/\|/g) ?? []).length
        expect(columnCount).toBe(4)
      }

      // mcp_overview row's "when to use" is the first sentence of its own
      // manifest summary — locks in the derivation contract.
      const ownEntry = manifest.api.find((e) => e.name === 'mcp_overview')!
      const firstSentence = ownEntry.summary.split(/(?<=[.!?])\s+/)[0]!.trim()
      const ownRow = lines.find((l) => l.startsWith('| `mcp_overview` |'))!
      expect(ownRow).toContain(firstSentence)
    } finally {
      await close()
    }
  })
})
