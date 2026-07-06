import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the T2.5.3 (`get_pattern`)
// and T2.5.4 (`get_anti_patterns`) tools. Same setup as the validate
// integration test — linked in-memory transports + the SDK's Client —
// so we exercise tool registration, JSON-RPC framing, and the formatter
// response shape in one pass.

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
  it('returns the COMPACT INDEX (not full bodies) when called with no arg', async () => {
    // Behaviour change (PR: mcp token slim): the default response is now
    // the ~3.3K-token index, not the ~14K full dump. The index keeps the
    // per-category `## <Heading>` markers (so category discovery still
    // works in one call) and the inline detector tags, but elides the
    // prose body in favour of a one-line hook.
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_anti_patterns', {})
      expect(text).toMatch(/^# Pyreon Anti-Patterns — index \(\d+ total, \d+ categor(y|ies)\)/)
      expect(text).toContain('## Reactivity Mistakes')
      expect(text).toContain('## JSX Mistakes')
      expect(text).toContain('## Architecture Mistakes')
      // The index tells the agent how to drill in.
      expect(text).toContain('get_anti_patterns({ name:')
      expect(text).toContain('get_anti_patterns({ full: true })')
      // Token budgets live in ONE place — token-budget.test.ts (density
      // caps + design-boundary tripwire). This spec is structural only.
      // The duplicated absolute ceiling that used to sit here made every
      // catalog addition fail TWO files in lockstep (the 2026-07-06
      // three-PR collision) — never re-add a number here.
    } finally {
      await close()
    }
  })

  it('full:true returns the entire catalog (explicit expensive opt-in)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_anti_patterns', { full: true })
      // The old full-dump header shape, restored only on explicit opt-in.
      expect(text).toMatch(/^# Pyreon Anti-Patterns \(\d+ total, \d+ categor(y|ies)\)/)
      expect(text).toContain('## Reactivity Mistakes')
      // Full bodies are present → materially larger than the index.
      const indexText = await callTool(client, 'get_anti_patterns', {})
      expect(text.length).toBeGreaterThan(indexText.length * 2)
    } finally {
      await close()
    }
  })

  it('name returns one entry full body (token-frugal "I need THIS one")', async () => {
    const { client, close } = await newClient()
    try {
      // 'Destructuring props' is a stable reactivity entry title.
      const text = await callTool(client, 'get_anti_patterns', { name: 'Destructuring props' })
      expect(text).toContain('Destructuring props')
      // It's a full body, not the index line — the index footer hint
      // ("get_anti_patterns({ full: true })") must NOT be present.
      expect(text).not.toContain('get_anti_patterns({ full: true })')
      // Far cheaper than even the index.
      expect(Math.round(text.length / 4)).toBeLessThan(1500)
    } finally {
      await close()
    }
  })

  it('name with no match returns a not-found message + index pointer', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_anti_patterns', { name: 'zzz-nonexistent-zzz' })
      expect(text).toContain('No anti-pattern title matches')
      expect(text).toContain('get_anti_patterns()')
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
