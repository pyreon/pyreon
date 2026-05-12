import { callTool, newClient } from './helpers'

// MCP server <-> client round-trip for the PR C `audit_islands` tool.
// Same InMemoryTransport shape as `test-audit-server.test.ts`, so we
// exercise the registration, JSON-RPC framing, formatter, and zod
// validation in one pass. Pairs with the unit-level test in the
// compiler package (`island-audit.test.ts`) — those test the
// underlying `auditIslands()` function directly; this one proves the
// MCP wiring.

// `audit_islands` walks the real repo (packages/ + examples/) — under CI's
// parallel test load that can exceed vitest's 5s default. 30s per call is
// well above empirical worst case (~2s locally) but safe headroom for
// concurrent runs.
const AUDIT_TIMEOUT_MS = 30_000

describe('MCP server — audit_islands tool', () => {
  it(
    'renders the audit header + summary line',
    async () => {
      const { client, close } = await newClient()
      try {
        const text = await callTool(client, 'audit_islands', {})
        // The header always renders the file/decl/registry counts.
        expect(text).toMatch(/^# Islands audit — \d+ files scanned/)
        expect(text).toMatch(/`island\(\)` declarations?/)
        expect(text).toMatch(/`hydrateIslands` registry entr/)
      } finally {
        await close()
      }
    },
    AUDIT_TIMEOUT_MS,
  )

  it(
    'returns the green-light message when the audit is clean',
    async () => {
      const { client, close } = await newClient()
      try {
        const text = await callTool(client, 'audit_islands', {})
        // Real-repo baseline: examples/islands-showcase has 6 islands
        // and uses hydrateIslandsAuto() — no manual registry, so audit
        // is clean. The bisect verification (planted typo + never-with-
        // registry) lives in the unit suite. If THIS assertion fails,
        // somebody added a real island defect to main, OR the audit
        // started false-positive-ing.
        expect(text).toContain('No island findings')
      } finally {
        await close()
      }
    },
    AUDIT_TIMEOUT_MS,
  )

  it(
    'emits machine-readable JSON when json=true',
    async () => {
      const { client, close } = await newClient()
      try {
        const text = await callTool(client, 'audit_islands', { json: true })
        // Should be valid JSON with the expected shape.
        const parsed = JSON.parse(text)
        expect(parsed).toHaveProperty('root')
        expect(parsed).toHaveProperty('findings')
        expect(parsed).toHaveProperty('summary')
        expect(parsed.summary).toHaveProperty('filesScanned')
        expect(parsed.summary).toHaveProperty('islandsDeclared')
        expect(parsed.summary).toHaveProperty('registryEntries')
        expect(parsed.summary).toHaveProperty('findingsByCode')
        // The 5 finding codes always appear in the summary, with 0 counts
        // when no findings — useful for CI gates that map code → exit
        // status.
        const codes = Object.keys(parsed.summary.findingsByCode).sort()
        expect(codes).toEqual([
          'dead-island',
          'duplicate-name',
          'nested-island',
          'never-with-registry-entry',
          'registry-mismatch',
        ])
      } finally {
        await close()
      }
    },
    AUDIT_TIMEOUT_MS,
  )

  it('rejects a non-boolean json arg via zod', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'audit_islands',
        arguments: { json: 'yes' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })
})
