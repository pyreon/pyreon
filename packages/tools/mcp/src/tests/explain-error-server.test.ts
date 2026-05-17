import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `explain_error` tool.
// The heuristics + dossier assembly are unit-tested in
// `explain-error.test.ts`; this pins the JSON-RPC wiring, the report
// parsing at the transport boundary, and the anti-pattern catalogue
// loading (which only works when the server runs inside the monorepo).

describe('MCP server — explain_error tool', () => {
  it('assembles a dossier from a full report incl. reactiveTrace', async () => {
    const { client, close } = await newClient()
    try {
      const report = JSON.stringify({
        error: {
          message: "Cannot read properties of null (reading 'name') in user",
          name: 'TypeError',
        },
        phase: 'render',
        component: 'UserCard',
        reactiveTrace: [
          { name: 'count', prev: '0', next: '1', timestamp: 1 },
          { name: 'user', prev: 'User {id, name}', next: 'null', timestamp: 2 },
        ],
      })
      const text = await callTool(client, 'explain_error', { report })
      expect(text).toContain('## Failure summary')
      expect(text).toContain('UserCard')
      expect(text).toContain('## Reactive run-up (2 writes')
      expect(text).toContain('user: User {id, name} → null')
      expect(text).toContain('## Suspected cause')
      // 'user' is in the message + is the last write → last-write-correlation.
      expect(text).toContain('last-write-correlation')
      expect(text).toContain('## How to use this')
    } finally {
      await close()
    }
  })

  it('runs static detection when componentSource is passed', async () => {
    const { client, close } = await newClient()
    try {
      const report = JSON.stringify({ error: 'boom', component: 'C' })
      const text = await callTool(client, 'explain_error', {
        report,
        componentSource: `const C = ({ user }: { user: object }) => <div>{user}</div>`,
      })
      expect(text).toContain('## Static issues')
      expect(text).toContain('props-destructured')
    } finally {
      await close()
    }
  })

  it('empty trace → high-confidence "not a reactive bug" steer', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'explain_error', {
        report: JSON.stringify({ error: 'boom at setup', reactiveTrace: [] }),
      })
      expect(text).toContain('empty-trace')
      expect(text).toContain('NOT state-driven')
    } finally {
      await close()
    }
  })

  it('returns an actionable message on an unparseable report', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'explain_error', { report: '{not json' })
      expect(text).toContain('Could not parse the error report')
      expect(text).toContain('registerErrorHandler')
    } finally {
      await close()
    }
  })

  it('rejects missing `report` arg via zod', async () => {
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'explain_error',
        arguments: {},
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      expect(result.isError).toBe(true)
    } finally {
      await close()
    }
  })
})
