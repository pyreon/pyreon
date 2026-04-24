import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

// MCP server <-> client round-trip for the T2.5.7 audit_test_environment
// tool. Same InMemoryTransport shape as the other tool tests so we
// exercise registration, JSON-RPC framing, and the formatter in
// one pass.

async function newClient(): Promise<{ client: Client; close: () => Promise<void> }> {
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

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>
  }
  expect(result.content[0]!.type).toBe('text')
  return result.content[0]!.text
}

describe('MCP server — audit_test_environment tool', () => {
  it('returns a risk-grouped audit with defaults (minRisk=medium)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'audit_test_environment', {})
      expect(text).toMatch(/^# Test environment audit — \d+ test files scanned/)
      // Label is markdown-bolded as `**Mock-vnode exposure**:`, so
      // match the substring rather than the literal label.
      expect(text).toMatch(/Mock-vnode exposure.*\d+ \/ \d+/)
      expect(text).toMatch(/Risk counts.*\d+ high/)
      // At least one risk group surfaces at the default minRisk.
      expect(text).toMatch(/^## (HIGH|MEDIUM)/m)
    } finally {
      await close()
    }
  })

  it('honours minRisk="high" — hides MEDIUM entries', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'audit_test_environment', { minRisk: 'high' })
      expect(text).not.toMatch(/^## MEDIUM/m)
    } finally {
      await close()
    }
  })

  it('honours minRisk="low" — surfaces every risk tier', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'audit_test_environment', { minRisk: 'low', limit: 3 })
      // With minRisk=low, HIGH + MEDIUM + LOW all appear if the repo
      // has entries at each tier (the real repo does).
      expect(text).toMatch(/^## HIGH/m)
      expect(text).toMatch(/^## LOW/m)
    } finally {
      await close()
    }
  })

  it('honours limit per risk group', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'audit_test_environment', { limit: 2 })
      // Any risk group that exceeds 2 entries must show the "showing 2" marker.
      const groups = text.split(/^## /m).slice(1) // drop preamble
      for (const group of groups) {
        const header = group.split('\n')[0]!
        const totalMatch = /—\s+(\d+)\s+files?/.exec(header)
        if (!totalMatch) continue
        const total = Number(totalMatch[1])
        if (total > 2) {
          expect(header).toContain('showing 2')
        }
      }
    } finally {
      await close()
    }
  })

  it('rejects an unknown minRisk via zod', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'audit_test_environment',
        arguments: { minRisk: 'bogus' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })

  it('rejects a negative limit via zod', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'audit_test_environment',
        arguments: { limit: -1 },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })
})
