import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `diagnose` tool. The
// `ERROR_PATTERNS` catalog itself is unit-tested in the compiler's
// `react-intercept.test.ts`; this test pins the JSON-RPC wiring +
// the formatter that splits cause / fix / fixCode / related into
// markdown sections.

describe('MCP server — diagnose tool', () => {
  it('matches a known pattern and emits cause + fix + code sections', async () => {
    const { client, close } = await newClient()
    try {
      // The signal-not-callable pattern is one of the foundational
      // entries in ERROR_PATTERNS — captures the `(name) is not a
      // function` shape that almost every React refugee hits when they
      // forget signals are callable.
      const text = await callTool(client, 'diagnose', {
        error: 'count is not a function',
      })
      expect(text).toContain('**Cause:**')
      expect(text).toContain('**Fix:**')
      // The fix-code section appears for patterns that produce one.
      expect(text).toContain('**Code:**')
      expect(text).toContain('count')
    } finally {
      await close()
    }
  })

  it('includes the Related section when the pattern provides one', async () => {
    const { client, close } = await newClient()
    try {
      // Hydration-mismatch is the canonical pattern that carries a
      // `related` hint (typeof window guard / onMount). Verifies the
      // formatter actually wires the `related` field through.
      const text = await callTool(client, 'diagnose', {
        error: 'Hydration mismatch at /about',
      })
      expect(text).toContain('**Cause:**')
      expect(text).toContain('**Fix:**')
      expect(text).toContain('**Related:**')
    } finally {
      await close()
    }
  })

  it('returns the generic fallback when no pattern matches', async () => {
    const { client, close } = await newClient()
    try {
      // Arbitrary text that doesn't match any ERROR_PATTERNS regex —
      // exercises the fallback branch (no diagnosis → suggestions
      // list).
      const text = await callTool(client, 'diagnose', {
        error: 'something completely unfamiliar that no pattern would match',
      })
      expect(text).toContain('Could not identify a Pyreon-specific pattern')
      expect(text).toContain('pyreon doctor')
      expect(text).toContain('bun run typecheck')
    } finally {
      await close()
    }
  })

  it('rejects missing `error` arg via zod', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'diagnose',
        arguments: {},
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })

  // ── v2 structured-context enrichment (backward-compatible additions) ──

  it('string-only call is byte-identical to v1 (no enrichment sections)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'diagnose', {
        error: 'count is not a function',
      })
      // v1 base present, NO v2 sections / separators leaked in.
      expect(text).toContain('**Cause:**')
      expect(text).not.toContain('### Reactive run-up')
      expect(text).not.toContain('### Static detector findings')
      expect(text).not.toContain('---')
    } finally {
      await close()
    }
  })

  it('componentSource enriches with static detector findings over JSON-RPC', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'diagnose', {
        error: 'name is stale after parent update',
        componentSource:
          'function Greeting({ name }: { name: string }) { return <div>{name}</div> }',
      })
      expect(text).toContain('### Static detector findings')
      expect(text).toContain('props-destructured')
    } finally {
      await close()
    }
  })

  it('reactiveTrace enriches with the causal run-up over JSON-RPC', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'diagnose', {
        error: 'cannot read property of null',
        reactiveTrace: [
          { name: 'user', prev: 'null', next: 'null', timestamp: 1 },
          { name: 'status', prev: '"loading"', next: '"ready"', timestamp: 2 },
        ],
      })
      expect(text).toContain('### Reactive run-up')
      expect(text).toContain('user: null → null')
      expect(text).toContain('status: "loading" → "ready"')
    } finally {
      await close()
    }
  })
})
