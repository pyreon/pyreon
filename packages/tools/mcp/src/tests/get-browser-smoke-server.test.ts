import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

// Real MCP server <-> client round-trip for the `get_browser_smoke_status`
// tool. The tool walks `<cwd>/packages` looking for browser-categorised
// packages from `.claude/rules/browser-packages.json` and checks each
// for `*.browser.test.{ts,tsx}` files. CI script `check-browser-smoke.ts`
// covers the same shape from a script entrypoint; this test pins the
// JSON-RPC handler + formatter output.
//
// vitest runs from `packages/tools/mcp` by default — walking
// `packages/tools/mcp/packages` would find nothing, exercising the
// "unknown package" branch. To exercise the COVERED + MISSING paths
// against real package directories, we `chdir` to the monorepo root
// inside one of the specs (then restore). The repo-walk-from-cwd
// pattern matches how the tool is intended to be used by an MCP
// client (CLI invocation from project root).

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)
// .../packages/tools/mcp/src/tests → walk up 4 levels to the repo root.
const REPO_ROOT = path.resolve(_dirname, '..', '..', '..', '..', '..')

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

describe('MCP server — get_browser_smoke_status tool', () => {
  it('emits the coverage header (covered / total)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_browser_smoke_status', {})
      // Header format: `**Browser smoke coverage** (N / M):`.
      expect(text).toMatch(/^\*\*Browser smoke coverage\*\* \(\d+ \/ \d+\):/)
    } finally {
      await close()
    }
  })

  it('flags packages as Covered / Missing / Unknown when run from repo root', async () => {
    // chdir to the monorepo root so the walker finds real package
    // directories instead of the default cwd's empty `packages/`.
    // Restore in finally so adjacent tests aren't affected.
    const originalCwd = process.cwd()
    try {
      process.chdir(REPO_ROOT)
      const { client, close } = await newClient()
      try {
        const text = await callTool(client, 'get_browser_smoke_status', {})
        // From the repo root, real browser packages are present and
        // have shipped `*.browser.test.*` files (lint rule enforces
        // this). So `Covered (N):` should appear with N > 0.
        expect(text).toMatch(/✓ Covered \(\d+\):/)
        // At least one canonical browser-package name in the body.
        expect(text).toMatch(/- @pyreon\/(runtime-dom|router|styler)/)
      } finally {
        await close()
      }
    } finally {
      process.chdir(originalCwd)
    }
  })

  it('reports "not found in this repo" packages from outside the monorepo', async () => {
    // Default cwd (`packages/tools/mcp`) means `<cwd>/packages` is
    // missing — every browser-package becomes "unknown" (listed in
    // the JSON catalog but absent from this directory). Exercises
    // the unknown-package branch of the formatter.
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_browser_smoke_status', {})
      expect(text).toContain('Listed in browser-packages.json but not found')
      expect(text).toMatch(/- @pyreon\/runtime-dom/)
    } finally {
      await close()
    }
  })
})
