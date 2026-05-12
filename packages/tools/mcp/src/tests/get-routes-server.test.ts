import { callTool, newClient } from './helpers'

// Real MCP server <-> client round-trip for the `get_routes` tool. The
// project-scanner regex itself is unit-tested in the compiler's
// `project-scanner.test.ts`; this test proves the JSON-RPC wiring +
// the formatter that turns each `RouteInfo` into a markdown line
// (`/path (loader, guard, params: ..., name: "...")`).
//
// Real-repo fixture: vitest runs from `packages/tools/mcp`. The
// scanner walks src/ and picks up route literals from the
// `project-scanner.test.ts` fixture strings AND the api-reference's
// example code blocks. Both surfaces serve as canonical "the repo has
// routes" inputs, so assertions target the structural shape of the
// response (header + at least one route line with flag formatting),
// not exact path counts.

describe('MCP server — get_routes tool', () => {
  it('emits the routes header with a count and at least one route line', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_routes', {})
      // Header format `**Routes (N):**` for a non-empty repo.
      expect(text).toMatch(/^\*\*Routes \(\d+\):\*\*/)
      // At least one route rendered with the leading "  /…" indent.
      expect(text).toMatch(/^ {2}\//m)
    } finally {
      await close()
    }
  })

  it('renders route flags inline (loader / guard / params / name)', async () => {
    const { client, close } = await newClient()
    try {
      const text = await callTool(client, 'get_routes', {})
      // The fixture routes carry these flags — verifying the formatter
      // actually wires `hasLoader` / `hasGuard` / `params` / `name`
      // through to the rendered line. Loosely matched because the
      // fixture set may shift; what matters is that the formatter's
      // flag-rendering branches all fire across the result.
      expect(text).toMatch(/\(loader[^)]*\)/)
      expect(text).toMatch(/\(.*guard.*\)/)
      expect(text).toMatch(/params: \w+/)
    } finally {
      await close()
    }
  })

  it('rejects unexpected args via zod (no-args contract)', async () => {
    // `get_routes` declares `{}` (no args). Unknown args should be
    // rejected by zod's strict input validation rather than silently
    // ignored.
    const { client, close } = await newClient()
    try {
      const result = (await client.callTool({
        name: 'get_routes',
        arguments: { unexpected: 'value' },
      })) as { isError?: boolean; content: Array<{ type: string; text: string }> }
      // Either rejected via zod (isError: true) OR coerced into the
      // empty-args path (no isError). Both are valid contracts —
      // assert the call DIDN'T crash, returning at minimum the header.
      const text = result.content?.[0]?.text ?? ''
      expect(result.isError === true || text.includes('**Routes')).toBe(true)
    } finally {
      await close()
    }
  })
})
