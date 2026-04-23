import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

// Real MCP server <-> client round-trip for the T2.5.8 get_changelog
// tool. Same InMemoryTransport shape as the patterns-server test —
// exercises tool registration, JSON-RPC framing, and the formatter
// response shape in one pass.

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

describe('MCP server — get_changelog tool', () => {
  it('lists every package when called with no arg', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_changelog', {})
      expect(text).toMatch(/^# Pyreon Changelogs \(\d+ packages\)/)
      expect(text).toContain('**@pyreon/query**')
      expect(text).toContain('**@pyreon/router**')
      expect(text).toContain('**@pyreon/form**')
    } finally {
      await close()
    }
  })

  it('returns recent versions for a package (fully-qualified name)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_changelog', { package: '@pyreon/query' })
      expect(text).toContain('@pyreon/query — changelog')
      // At least one version heading.
      expect(text).toMatch(/^## \d+\.\d+\.\d+/m)
    } finally {
      await close()
    }
  })

  it('accepts the short slug (auto-prefixes @pyreon/)', async () => {
    const { client, close } = await newClient()
    try {
      const short = await callTool(client, 'get_changelog', { package: 'query' })
      const qualified = await callTool(client, 'get_changelog', { package: '@pyreon/query' })
      expect(short).toBe(qualified)
    } finally {
      await close()
    }
  })

  it('respects the limit parameter', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_changelog', { package: 'query', limit: 1 })
      const versionHeadings = text.split('\n').filter((l) => /^## \d+\.\d+/.test(l))
      expect(versionHeadings).toHaveLength(1)
    } finally {
      await close()
    }
  })

  it('omits Updated-dependencies by default, includes when flag is true', async () => {
    const { client, close } = await newClient()
    try {
      const withoutDeps = await callTool(client, 'get_changelog', {
        package: 'query',
        limit: 10,
      })
      const withDeps = await callTool(client, 'get_changelog', {
        package: 'query',
        limit: 10,
        includeDependencyUpdates: true,
      })
      expect(withoutDeps).not.toContain('Updated dependencies')
      expect(withDeps).toContain('Updated dependencies')
    } finally {
      await close()
    }
  })

  it('returns suggestions for a misspelled name', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_changelog', { package: 'quer' })
      expect(text).toContain('not found')
      expect(text).toContain('Did you mean')
      expect(text).toContain('@pyreon/query')
    } finally {
      await close()
    }
  })

  it('returns a helpful miss message when no match exists at all', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_changelog', { package: 'totally-unrelated-xxx' })
      expect(text).toContain('not found')
      expect(text).toContain('get_changelog()')
    } finally {
      await close()
    }
  })

  it('accepts a `since` floor and returns only newer versions', async () => {
    const { client, close } = await newClient()
    try {
      // First get the full index to pick a real floor version.
      const full = await callTool(client, 'get_changelog', { package: 'query', limit: 20 })
      // Extract the 3rd-oldest version heading (needs at least 3 for the test to be meaningful).
      const headings = [...full.matchAll(/^## (\S+)$/gm)].map((m) => m[1]!)
      expect(headings.length).toBeGreaterThanOrEqual(3)
      const floor = headings[headings.length - 2]! // everything newer than the second-oldest
      const filtered = await callTool(client, 'get_changelog', {
        package: 'query',
        limit: 20,
        since: floor,
      })
      expect(filtered).toContain(`since v${floor}`)
      expect(filtered).not.toContain(`## ${floor}\n`) // floor itself excluded (strict)
    } finally {
      await close()
    }
  })

  it('returns the "no changes since" miss message when the floor is the latest', async () => {
    const { client, close } = await newClient()
    try {
      // Find the real latest substantive version from the package.
      const full = await callTool(client, 'get_changelog', { package: 'query', limit: 1 })
      const latest = /^## (\S+)$/m.exec(full)![1]!
      const result = await callTool(client, 'get_changelog', {
        package: 'query',
        since: latest,
      })
      expect(result).toContain(`no changes since v${latest}`)
    } finally {
      await close()
    }
  })

  it('rejects a negative limit via zod', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'get_changelog',
        arguments: { package: 'query', limit: -5 },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })
})
