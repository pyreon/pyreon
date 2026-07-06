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

  it('get_anti_patterns({}) index stays DENSE — entry-count-relative budget', async () => {
    await withServer(async (client) => {
      const text = await callText(client, 'get_anti_patterns', {})
      // HISTORY / WHY THIS SHAPE. This used to be an absolute ceiling
      // (5,000 → 5,500). An absolute number couples the gate to ENTRY
      // COUNT, so every legitimate anti-patterns.md addition tripped CI
      // and forced a manual bump — on 2026-07-06 THREE parallel PRs each
      // hit it and each carried an identical ratchet commit. The absolute
      // form also guarded nothing the ratio test below doesn't already
      // guard (a full-dump regression fails ≥60%-smaller immediately).
      //
      // The redesigned budget gates what a PR actually controls — the
      // DENSITY of the index — and scales freely with legitimate catalog
      // growth:
      //   • average tokens/entry — catches systematic verbosity creep
      //     (measured 42.9 at 116 entries; cap 55 ≈ 28% headroom)
      //   • max single index line — catches one bloated title (measured
      //     max 75, p95 62; cap 100; hooks are already clamped to
      //     INDEX_HOOK_MAX=100 chars ≈ 25 tokens in anti-patterns.ts)
      // Adding a normally-dense entry can NEVER trip these. If one DOES
      // fire, tighten the entry's title/hook — do not raise the caps.
      const entryCount = Number(text.match(/\((\d+) total/)?.[1] ?? NaN)
      expect(entryCount).toBeGreaterThan(0) // header shape is load-bearing
      const lines = text.split('\n').filter((l) => l.startsWith('- '))
      expect(lines.length).toBe(entryCount) // one index line per entry
      expect(tok(text) / entryCount).toBeLessThan(55)
      const maxLine = Math.max(...lines.map((l) => tok(l)))
      expect(maxLine).toBeLessThan(100)
    })
  })

  it('get_anti_patterns({}) index has not outgrown the single-response form', async () => {
    await withServer(async (client) => {
      const text = await callText(client, 'get_anti_patterns', {})
      // DESIGN-BOUNDARY tripwire, not a ratchet. Density can be perfect
      // and the index still become huge through sheer entry count (e.g.
      // 300 entries × 43 ≈ 12.9K tokens). At that scale the fix is a
      // STRUCTURAL one — paginate get_anti_patterns / return category
      // indexes by default — NOT a bigger number here. Do not bump this.
      expect(tok(text)).toBeLessThan(12000)
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
