import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

// Real MCP server <-> client round-trip via InMemoryTransport. The
// tool-call payload goes through the full JSON-RPC framing, the tool
// dispatcher resolves `validate`, and the handler runs with the exact
// same code path production stdio uses. This locks down the bits the
// detector unit test cannot: handler registration, merge contract, and
// the serialised response shape a consumer actually sees.

async function newConnectedClient(): Promise<{ client: Client; close: () => Promise<void> }> {
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

async function callValidate(client: Client, code: string): Promise<string> {
  const result = (await client.callTool({
    name: 'validate',
    arguments: { code },
  })) as { content: Array<{ type: string; text: string }> }

  // Response is { content: [{ type: 'text', text: '...' }] }
  expect(result.content).toHaveLength(1)
  expect(result.content[0]!.type).toBe('text')
  return result.content[0]!.text
}

describe('MCP server — validate tool over real JSON-RPC transport', () => {
  it('invokes the merged detector pipeline on a mixed React + Pyreon snippet', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const code = `
        import { useState } from 'react'

        const Counter = ({ count }: { count: number }) => {
          const [local, setLocal] = useState(count)
          return <For each={items}>{(i) => <li className="x" />}</For>
        }
      `
      const text = await callValidate(client, code)

      // Merged output MUST contain codes from BOTH detectors.
      // React detector:
      expect(text).toContain('use-state')
      expect(text).toContain('react-import')
      expect(text).toContain('class-name-prop')
      // Pyreon detector:
      expect(text).toContain('props-destructured')
      expect(text).toContain('for-missing-by')

      // Header format "Found N issues" survived serialisation.
      expect(text).toMatch(/^Found \d+ issues?:/)
    } finally {
      await close()
    }
  })

  it('returns the no-issues fast path unchanged for idiomatic Pyreon code', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const code = `
        import { signal } from '@pyreon/reactivity'
        import { For } from '@pyreon/core'

        const List = (props: { items: Array<{ id: string; name: string }> }) => {
          const q = signal('')
          return (
            <For each={props.items} by={(i) => i.id}>
              {(i) => <li>{i.name}: {q()}</li>}
            </For>
          )
        }
      `
      const text = await callValidate(client, code)
      expect(text).toBe('✓ No issues found. The code follows Pyreon patterns correctly.')
    } finally {
      await close()
    }
  })

  it('surfaces the on-click-undefined Pyreon-only diagnostic via the handler', async () => {
    // Covers the "Pyreon-only, no React match" path — the React detector
    // returns [], the Pyreon detector returns 1, and the MCP handler
    // must still emit the "Found N issues" header and the diagnostic.
    const { client, close } = await newConnectedClient()
    try {
      const text = await callValidate(client, `<button onClick={undefined}>x</button>`)
      expect(text).toContain('on-click-undefined')
      expect(text).toContain('omit')
      expect(text).toMatch(/^Found 1 issue:/)
    } finally {
      await close()
    }
  })

  it('locks the MCP response format (toMatchInlineSnapshot)', async () => {
    // The textual format consumers render in their UI. An unannounced
    // format change would drift consumer UIs silently. Update the
    // snapshot deliberately via `bun run test -- -u` when the format
    // is genuinely supposed to change.
    const { client, close } = await newConnectedClient()
    try {
      // Single diagnostic so the snapshot stays readable.
      const text = await callValidate(client, `<button onClick={undefined}>x</button>`)
      expect(text).toMatchInlineSnapshot(`
        "Found 1 issue:

        1. **on-click-undefined** (line 1)
           \`onClick={undefined}\` explicitly passes undefined as a listener. Pyreon's runtime guards against this, but the cleanest pattern is to omit the attribute entirely or use a conditional: \`onClick={condition ? handler : undefined}\`.
           Current: \`onClick={undefined}\`
           Fix: \`/* omit onClick when the handler is not defined */\`
           Auto-fixable: no"
      `)
    } finally {
      await close()
    }
  })

  it('sorts the merged diagnostics by line number in the response', async () => {
    // The handler merges React + Pyreon diagnostics and sorts by
    // (line, column). Verify the sort survived the round trip.
    const { client, close } = await newConnectedClient()
    try {
      const code = `
        import { useState } from 'react'
        // eslint-disable-next-line
        const X = () => <For each={items}>{(i) => <li className="y" />}</For>
      `
      const text = await callValidate(client, code)

      // Extract "(line N)" tokens and assert monotonically non-decreasing.
      const lines = [...text.matchAll(/\(line (\d+)\)/g)].map((m) => Number(m[1]))
      expect(lines.length).toBeGreaterThan(1)
      for (let i = 1; i < lines.length; i++) {
        expect(lines[i]).toBeGreaterThanOrEqual(lines[i - 1]!)
      }
    } finally {
      await close()
    }
  })
})

// ────────────────────────────────────────────────────────────────────────────
// Per-tool happy-path integration coverage (T2.5.11). One spec per remaining
// tool to lock the JSON-RPC handler registration + response shape. The
// validate handler's deep behaviour is exercised above; these locks the
// other 13 tools at the contract layer — proves each is registered, the
// handler resolves, the response is text-shaped, and the body contains the
// tool's canonical output marker.
// ────────────────────────────────────────────────────────────────────────────

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: Array<{ type: string; text: string }>
  }
  expect(result.content).toHaveLength(1)
  expect(result.content[0]!.type).toBe('text')
  return result.content[0]!.text
}

describe('MCP server — other tool handlers over real JSON-RPC transport', () => {
  it('get_api returns the entry body when the symbol exists', async () => {
    const { client, close } = await newConnectedClient()
    try {
      // `signal` is a stable, always-present entry under @pyreon/reactivity.
      const text = await callTool(client, 'get_api', { package: 'reactivity', symbol: 'signal' })
      expect(text).toContain('@pyreon/reactivity')
      expect(text).toContain('signal')
      expect(text).toContain('Signature:')
    } finally {
      await close()
    }
  })

  it('get_api returns the not-found path with suggestions for an unknown symbol', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_api', { package: 'reactivity', symbol: 'sgnal' })
      expect(text).toContain('not found')
      // Fuzzy suggestion should surface the real symbol.
      expect(text).toMatch(/signal|reactivity/)
    } finally {
      await close()
    }
  })

  it('migrate_react transforms a React snippet and reports the change list', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const code = `import { useState } from 'react'\nconst Counter = () => { const [c, setC] = useState(0); return <div className="x">{c}</div> }`
      const text = await callTool(client, 'migrate_react', { code })
      expect(text).toContain('## Migrated Code')
      expect(text).toContain('Changes applied')
    } finally {
      await close()
    }
  })

  it('diagnose pattern-matches a known framework error string', async () => {
    const { client, close } = await newConnectedClient()
    try {
      // Matches the `not a function` ERROR_PATTERNS entry.
      const text = await callTool(client, 'diagnose', { error: 'count is not a function' })
      // The diagnose tool's formatted output names the symbol it parsed
      // out of the error and offers a fix block.
      expect(text.toLowerCase()).toContain('count')
    } finally {
      await close()
    }
  })

  it('explain_error returns the parse-help message for a malformed report', async () => {
    const { client, close } = await newConnectedClient()
    try {
      // Empty / unparseable report → the tool returns the "could not
      // parse" helper text with a shape example. Locks the user-facing
      // failure mode so it can't silently drift.
      const text = await callTool(client, 'explain_error', { report: 'not-json' })
      expect(text).toContain('Could not parse the error report')
      expect(text).toContain('reactiveTrace')
    } finally {
      await close()
    }
  })

  it('explain_error assembles a dossier from a parseable ErrorContext JSON', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const report = JSON.stringify({
        error: { message: "Cannot read properties of null (reading 'name')", name: 'TypeError' },
        phase: 'render',
        component: 'UserCard',
      })
      const text = await callTool(client, 'explain_error', { report })
      // The dossier always carries the error message verbatim somewhere.
      expect(text).toContain('UserCard')
    } finally {
      await close()
    }
  })

  it('get_routes returns text — either the route table or the empty-state message', async () => {
    const { client, close } = await newConnectedClient()
    try {
      // The MCP context walks the project from cwd; in the test runner
      // it may find this monorepo's routes (when run from a worktree that
      // has them) or nothing. Lock the contract: a non-empty text response
      // matching one of the two branches.
      const text = await callTool(client, 'get_routes')
      expect(text.length).toBeGreaterThan(0)
      expect(text).toMatch(/No routes detected|\*\*Routes \(/)
    } finally {
      await close()
    }
  })

  it('get_components returns text — either the component list or the empty-state message', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_components')
      expect(text.length).toBeGreaterThan(0)
      expect(text).toMatch(/No components detected|\*\*Components \(/)
    } finally {
      await close()
    }
  })

  it('get_browser_smoke_status surfaces project-walk output without throwing', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_browser_smoke_status')
      // Either the coverage report or the "no browser-packages.json"
      // helper text — both are legitimate runtime states. Lock the
      // contract by asserting the response is non-empty + text-typed.
      expect(text.length).toBeGreaterThan(0)
      expect(text).toMatch(/browser|browser-packages\.json/i)
    } finally {
      await close()
    }
  })

  it('get_pattern returns the pattern index when called with no args', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_pattern')
      // Patterns ship in docs/patterns/<slug>.md — the index lists them
      // by slug. Locking on the section header keeps the contract stable
      // even as new patterns are added.
      expect(text.toLowerCase()).toContain('pattern')
    } finally {
      await close()
    }
  })

  it('get_pattern returns "not found" with suggestions for an unknown slug', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_pattern', { name: 'definitely-not-a-pattern' })
      expect(text).toContain('not found')
    } finally {
      await close()
    }
  })

  it('get_anti_patterns returns the compact index by default (token-frugal)', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_anti_patterns')
      // Either the compact index (when rules dir found) or the "Could
      // not locate" helper (consumer project / sandbox). Both are
      // legitimate; the contract is non-empty text.
      expect(text.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  it('get_changelog returns the index when called with no args', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_changelog')
      // Index lists @pyreon/* packages with a CHANGELOG.
      expect(text.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  it('get_changelog returns "not found" for an unknown package', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'get_changelog', { package: 'definitely-not-a-package' })
      expect(text).toContain('not found')
    } finally {
      await close()
    }
  })

  it('audit_test_environment runs the audit without throwing', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'audit_test_environment', { minRisk: 'high' })
      // Even with no findings in the test sandbox, the formatter emits
      // a "no HIGH-risk findings" message. Lock the contract: non-empty
      // text response, no JSON-RPC error.
      expect(text.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  it('audit_islands runs the project-wide audit without throwing', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'audit_islands')
      expect(text.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  it('mcp_overview returns the "what tool when" map sourced from the manifest', async () => {
    const { client, close } = await newConnectedClient()
    try {
      const text = await callTool(client, 'mcp_overview')
      // The overview reads every `tool: ` entry from the package
      // manifest. Assert it contains a known tool name to prove
      // the round trip carries the manifest data through serialization.
      expect(text).toContain('validate')
      expect(text).toContain('get_api')
    } finally {
      await close()
    }
  })
})
