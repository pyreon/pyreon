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
