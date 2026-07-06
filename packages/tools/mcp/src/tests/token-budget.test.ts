import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

/**
 * Token-budget regression gate (PR: mcp token slim).
 *
 * MCP token cost has two surfaces:
 *   1. `tools/list` — paid by EVERY consumer on EVERY session, before
 *      any tool is called.
 *   2. per-call responses — paid when a tool is invoked.
 *
 * Before this PR: tools/list ≈1,228 tokens; `get_anti_patterns({})`
 * dumped the entire catalog at ≈13,976 tokens. This file pins both so a
 * future verbose `.describe()` or a "just return everything" default
 * can't silently re-bloat the consumer's context window.
 *
 * Budgets are deliberately set ABOVE the measured post-PR numbers (with
 * head-room) so normal catalog growth doesn't trip them — they're a
 * ratchet against regression, not an exact-output snapshot.
 *
 * ≈4 chars/token is the standard rough proxy (good enough for a budget
 * ceiling; we are not billing on it).
 */
const tok = (s: string) => Math.round(s.length / 4)

async function withServer<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const [ct, st] = InMemoryTransport.createLinkedPair()
  const server = createServer()
  await server.connect(st)
  const client = new Client({ name: 'budget', version: '0.0.0' })
  await client.connect(ct)
  try {
    return await fn(client)
  } finally {
    await client.close()
    await server.close()
  }
}

async function callText(client: Client, name: string, args: Record<string, unknown>) {
  const r = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>
  }
  return r.content[0]!.text
}

describe('MCP token budgets', () => {
  it('tools/list payload stays under 1,400 tokens (per-session tax)', async () => {
    await withServer(async (client) => {
      const list = await client.listTools()
      const t = tok(JSON.stringify(list))
      // 16 tools now: `explain_reactivity` (~90) + `migrate_pyreon` (~2 small
      // string params, lean) both added over the prior 14-tool ≈1,228 baseline.
      // Ceiling still catches a verbose-`.describe()` regression (each long
      // prose description is ~150-280 tokens — would blow this immediately).
      expect(t).toBeLessThan(1500)
    })
  })

  it('get_anti_patterns({}) default index stays under 5,500 tokens', async () => {
    await withServer(async (client) => {
      const text = await callText(client, 'get_anti_patterns', {})
      // Pre-PR full dump ≈13,976. Post-PR index ≈3,292. The ceiling is a
      // hard ratchet: reverting to the full-dump default (or making the
      // index verbose) trips it. Raised 5,000 → 5,500 when legitimate
      // catalog growth (116 entries × ~44 tokens/index-line) consumed the
      // original slack — still ~2.6× under the full dump it guards
      // against. Bump ONLY for entry-count growth, never for verbosity
      // (per-entry cost is capped by INDEX_HOOK_MAX + the title).
      expect(tok(text)).toBeLessThan(5500)
    })
  })

  it('get_anti_patterns({}) is ≥60% smaller than the full catalog', async () => {
    await withServer(async (client) => {
      const index = tok(await callText(client, 'get_anti_patterns', {}))
      const full = tok(await callText(client, 'get_anti_patterns', { full: true }))
      // The whole point: the common path must be a large fraction
      // cheaper than the full dump. (Measured ≈76%; assert ≥60% so
      // catalog shape changes don't make this brittle.)
      expect(1 - index / full).toBeGreaterThanOrEqual(0.6)
    })
  })

  it('get_anti_patterns({ name }) single-entry is the cheapest drill-in', async () => {
    await withServer(async (client) => {
      const one = tok(await callText(client, 'get_anti_patterns', { name: 'Destructuring props' }))
      const index = tok(await callText(client, 'get_anti_patterns', {}))
      expect(one).toBeLessThan(index)
      expect(one).toBeLessThan(1500)
    })
  })
})
