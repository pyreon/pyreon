/**
 * Shared test helpers for the MCP server <-> client round-trip suites.
 *
 * Every `*-server.test.ts` file in this directory needs the same two
 * primitives: spin up an `InMemoryTransport`-wired client + server pair,
 * and call a tool through the client returning the first text block.
 * Keeping them here means a future change to the JSON-RPC handshake
 * (e.g. server name/version, transport flavor) is a one-file edit.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { expect } from 'vitest'
import { createServer } from '../index'

export interface McpTestClient {
  client: Client
  close: () => Promise<void>
}

/**
 * Construct a paired in-memory MCP client + server. The caller is
 * responsible for calling `close()` to dispose both ends.
 */
export async function newClient(): Promise<McpTestClient> {
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

interface ToolCallResult {
  content: Array<{ type: string; text: string }>
}

/**
 * Invoke an MCP tool and return the first text content block's payload.
 * Asserts the block is `type: 'text'` so tool handlers that switch to a
 * different content shape fail loudly at the assertion, not silently in
 * the returned string.
 */
export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as ToolCallResult
  expect(result.content[0]!.type).toBe('text')
  return result.content[0]!.text
}
