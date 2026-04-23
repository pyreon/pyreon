import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

// Real MCP server <-> client round-trip for the T2.5.3 (`get_pattern`)
// and T2.5.4 (`get_anti_patterns`) tools. Same setup as the validate
// integration test — linked in-memory transports + the SDK's Client —
// so we exercise tool registration, JSON-RPC framing, and the formatter
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

describe('MCP server — get_pattern tool', () => {
  it('lists available patterns when called with no arg', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_pattern', {})
      expect(text).toMatch(/^# Pyreon Patterns \(\d+\)/)
      expect(text).toContain('**dev-warnings**')
      expect(text).toContain('**controllable-state**')
      expect(text).toContain('**form-fields**')
    } finally {
      await close()
    }
  })

  it('returns the full body when called with a valid slug', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_pattern', { name: 'dev-warnings' })
      expect(text).toContain('# Dev-mode warnings')
      expect(text).toContain('import.meta.env?.DEV')
      expect(text).toContain('typeof process')
      // Seealso footer is rendered.
      expect(text).toContain('**See also:**')
      expect(text).toContain('ssr-safe-hooks')
    } finally {
      await close()
    }
  })

  it('returns suggestions when called with a misspelled name', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_pattern', { name: 'dev-warn' })
      expect(text).toContain('not found')
      expect(text).toContain('Did you mean')
      expect(text).toContain('dev-warnings')
    } finally {
      await close()
    }
  })

  it('returns a helpful miss message when no match exists at all', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_pattern', { name: 'totally-unrelated-xxx' })
      expect(text).toContain('not found')
      expect(text).toContain('get_pattern()')
    } finally {
      await close()
    }
  })
})

describe('MCP server — get_anti_patterns tool', () => {
  it('returns all categories when called with no arg', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_anti_patterns', {})
      expect(text).toMatch(/^# Pyreon Anti-Patterns \(\d+ total, \d+ categor(y|ies)\)/)
      // Multiple categories rendered.
      expect(text).toContain('## Reactivity Mistakes')
      expect(text).toContain('## JSX Mistakes')
      expect(text).toContain('## Architecture Mistakes')
    } finally {
      await close()
    }
  })

  it('filters to a single category', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_anti_patterns', { category: 'reactivity' })
      expect(text).toMatch(/^# Pyreon Anti-Patterns — reactivity \(\d+\)/)
      expect(text).toContain('## Reactivity Mistakes')
      // Other categories must NOT be present.
      expect(text).not.toContain('## JSX Mistakes')
      expect(text).not.toContain('## Architecture Mistakes')
    } finally {
      await close()
    }
  })

  it('surfaces detector tags inline on tagged entries', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_anti_patterns', { category: 'jsx' })
      expect(text).toContain('[detector: for-missing-by]')
      expect(text).toContain('[detector: for-with-key]')
    } finally {
      await close()
    }
  })

  it('accepts "all" explicitly (same output as no arg)', async () => {
    const { client, close } = await newClient()
    try {
      const withArg = await callTool(client, 'get_anti_patterns', { category: 'all' })
      const noArg = await callTool(client, 'get_anti_patterns', {})
      expect(withArg).toBe(noArg)
    } finally {
      await close()
    }
  })

  it('returns an error response for an unknown category (zod validation)', async () => {
    const { client, close } = await newClient()
    try {
      // The SDK returns { isError: true, content: [...] } for zod
      // validation failures rather than rejecting the promise —
      // a structured error response surfaces the same detail to
      // consumers without the throw unwinding their request loop.
      const result = (await client.callTool({
        name: 'get_anti_patterns',
        arguments: { category: 'bogus' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
      expect(result.content[0]!.text).toMatch(/Invalid (option|arguments)/i)
      expect(result.content[0]!.text).toContain('reactivity')
    } finally {
      await close()
    }
  })
})
