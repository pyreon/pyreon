import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createServer } from '../index'

// Real MCP server <-> client round-trip for the `migrate_react` tool.
// Unit-level coverage of the migration engine itself lives in the
// compiler package (`migrate.test.ts`); this test pins the JSON-RPC
// wiring: zod accepts the `code` arg, the handler calls
// `migrateReactCode`, and the formatter assembles the
// transformed-code-plus-changelog response.

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

describe('MCP server — migrate_react tool', () => {
  it('rewrites className → class and reports the change', async () => {
    const { client, close } = await newClient()
    try {
      // `className` is the canonical auto-fixable React-ism — the
      // migrator drops the n and reports it in the changes list.
      const text = await callTool(client, 'migrate_react', {
        code: 'const X = () => <div className="x" />',
      })
      expect(text).toContain('## Migrated Code')
      // The migrated code body uses `class=`, not `className=`. We
      // can't assert text.not.toContain('className') because the
      // change description echoes the original name ("className → class").
      expect(text).toMatch(/<div class="x"\s*\/>/)
      expect(text).toContain('**Changes applied')
      // Each change is rendered as a `- Line N: ...` bullet.
      expect(text).toMatch(/- Line \d+: className/)
    } finally {
      await close()
    }
  })

  it('reports "No changes needed" for already-Pyreon code', async () => {
    const { client, close } = await newClient()
    try {
      // Idiomatic Pyreon snippet — the migrator should find nothing
      // to auto-fix, and the formatter must still emit the section
      // headers + the no-changes message.
      const text = await callTool(client, 'migrate_react', {
        code: `
          import { signal } from '@pyreon/reactivity'
          const X = () => <div class="x" />
        `,
      })
      expect(text).toContain('## Migrated Code')
      expect(text).toContain('**Changes applied (0):**')
      expect(text).toContain('No changes needed.')
    } finally {
      await close()
    }
  })

  it('surfaces non-fixable diagnostics under "Remaining issues"', async () => {
    const { client, close } = await newClient()
    try {
      // `useReducer` is detected but NOT auto-fixable — the migrator
      // can't synthesize the reducer's `signal().update()` shape from
      // arbitrary user reducer logic. The handler must surface it
      // under "Remaining issues (manual fix needed)" rather than
      // silently dropping it. (Other unfixable codes: `dot-value-signal`,
      // `array-map-jsx`.)
      const text = await callTool(client, 'migrate_react', {
        code: `
          import { useReducer } from 'react'
          const X = () => {
            const [s, dispatch] = useReducer(reducer, 0)
            return <div>{s}</div>
          }
        `,
      })
      expect(text).toContain('## Migrated Code')
      expect(text).toContain('**Remaining issues (manual fix needed):**')
      expect(text).toMatch(/Line \d+: useReducer/)
    } finally {
      await close()
    }
  })
})
