/**
 * `get_api_client` / `get_api_operation` / `explain_api_diff` — serving a
 * generated API client to an agent.
 *
 * The fixtures are REAL generation runs (`@pyreon/lathe`'s `generate`), written
 * to disk with the files the run actually emits, because the whole premise of
 * these tools is reading the artifact rather than a guessed shape: a surface
 * written by hand here would test the renderer against the shape the test
 * author expected, not the one Lathe writes.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generate, resolveConfig } from '@pyreon/lathe/core'
import { afterAll, describe, expect, it } from 'vitest'
import { callTool, newClient } from './helpers'
import { findSurfaces, loadSurfaces, renderClientIndex, renderOperation } from '../lathe'

const roots: string[] = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

const SPEC = (customerRequired: string[]) =>
  JSON.stringify({
    openapi: '3.1.0',
    info: { title: 'Shop', version: '1' },
    servers: [{ url: 'https://shop.test' }],
    paths: {
      '/orders/{id}': {
        get: {
          operationId: 'getOrder',
          summary: 'One order',
          tags: ['orders'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'expand', in: 'query', required: true, schema: { type: 'string', enum: ['customer', 'none'] } },
          ],
          responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
        },
        put: {
          operationId: 'updateOrder',
          tags: ['orders'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
          responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
        },
      },
      '/orders/{id}/events': {
        get: {
          operationId: 'orderEvents',
          tags: ['orders'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { content: { 'text/event-stream': { schema: { $ref: '#/components/schemas/Order' } } } } },
        },
      },
    },
    components: {
      schemas: {
        Order: {
          type: 'object',
          required: ['id', 'customer'],
          properties: { id: { type: 'string' }, customer: { $ref: '#/components/schemas/Customer' } },
        },
        Customer: {
          type: 'object',
          required: customerRequired,
          properties: { name: { type: 'string' }, email: { type: 'string' } },
        },
      },
    },
  })

/** A project dir with a real generated client under `src/gen`. */
function project(customerRequired = ['name', 'email']): { root: string; gen: string } {
  const root = mkdtempSync(join(tmpdir(), 'mcp-lathe-'))
  roots.push(root)
  const gen = join(root, 'src', 'gen')
  const { files } = generate(SPEC(customerRequired), resolveConfig({ input: 'x' }))
  for (const f of files.filter((x) => x.path === 'api-surface.json' || x.path === 'lathe-manifest.json')) {
    mkdirSync(gen, { recursive: true })
    writeFileSync(join(gen, f.path), f.contents)
  }
  return { root, gen }
}

describe('finding and loading the generated client', () => {
  it('finds a surface only beside a lathe manifest, skipping node_modules', () => {
    const { root } = project()
    const stray = join(root, 'node_modules', 'x')
    mkdirSync(stray, { recursive: true })
    writeFileSync(join(stray, 'api-surface.json'), '{}')
    writeFileSync(join(stray, 'lathe-manifest.json'), '{}')
    const lone = join(root, 'docs')
    mkdirSync(lone)
    writeFileSync(join(lone, 'api-surface.json'), '{}')
    expect(findSurfaces(root)).toEqual([join(root, 'src', 'gen', 'api-surface.json')])
  })

  it('loads from a search, an explicit directory, or an explicit file — with the import base relative to cwd', () => {
    const { root, gen } = project()
    const found = loadSurfaces(root)
    expect(found.ok && found.surfaces[0]?.base).toBe('./src/gen')
    expect(loadSurfaces(root, 'src/gen').ok).toBe(true)
    expect(loadSurfaces(root, join(gen, 'api-surface.json')).ok).toBe(true)
  })

  it('reports a missing or a foreign/old surface instead of guessing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'mcp-lathe-empty-'))
    roots.push(empty)
    expect(loadSurfaces(empty)).toEqual({ ok: false, reason: 'missing' })
    expect(loadSurfaces(empty, 'nope')).toMatchObject({ ok: false, reason: 'missing', detail: 'nope does not exist' })
    writeFileSync(join(empty, 'old.json'), JSON.stringify({ version: 1, operations: {} }))
    expect(loadSurfaces(empty, 'old.json')).toMatchObject({ ok: false, reason: 'unreadable' })
    writeFileSync(join(empty, 'bad.json'), '{')
    expect(loadSurfaces(empty, 'bad.json')).toMatchObject({ ok: false, reason: 'unreadable' })
  })
})

describe('rendering', () => {
  const { root } = project()
  const loaded = loadSurfaces(root)
  if (!loaded.ok) throw new Error('fixture did not load')

  it('the index lists every operation with its generated symbols, grouped by module, and the models', () => {
    const index = renderClientIndex(loaded.surfaces)
    expect(index).toContain('# Shop — 3 operation(s), 2 model(s)')
    expect(index).toContain('## orders')
    expect(index).toContain('- `getOrder` GET /orders/:id — One order → `getOrder`, `useGetOrder`')
    expect(index).toContain('`orderEvents` GET /orders/:id/events (streams sse Order)')
    expect(index).toContain('`orderEventsStream`, `useOrderEventsStream`')
    expect(index).toContain('- `Customer` (2 fields, both)')
  })

  it('search narrows operations and says so when nothing matches', () => {
    expect(renderClientIndex(loaded.surfaces, 'update')).toContain('`updateOrder`')
    expect(renderClientIndex(loaded.surfaces, 'update')).not.toContain('`getOrder`')
    expect(renderClientIndex(loaded.surfaces, 'zzz')).toContain('No operation matches `zzz`.')
  })

  it('an operation: typed input with locations, output, the models it uses, and calls that match the types', () => {
    const out = renderOperation(loaded.surfaces, 'getOrder')
    expect(out).toContain('- `id` (path, required): string')
    expect(out).toContain('- `expand` (query, required): enum("customer"|"none")')
    expect(out).toContain('- response: Order')
    expect(out).toContain('- `Order` { customer: Customer; id: string }')
    expect(out).toContain(`import { getOrder } from './src/gen/endpoints/orders'`)
    expect(out).toContain(`const result = await getOrder({ params: { id: '…' }, query: { expand: "customer" } })`)
    expect(out).toContain(`const q = useGetOrder(() => ({ params: { id: '…' }, query: { expand: "customer" } }))`)
  })

  it('a mutation gets `.mutate` with its body, a stream gets `for await`', () => {
    expect(renderOperation(loaded.surfaces, 'updateOrder')).toContain(`m.mutate({ params: { id: '…' }, json: { … } })`)
    const stream = renderOperation(loaded.surfaces, 'orderEvents')
    expect(stream).toContain(`for await (const event of orderEventsStream({ params: { id: '…' } }))`)
    expect(stream).not.toContain('const result = await orderEvents(')
    expect(stream).toContain(`const live = useOrderEventsStream(() => ({ params: { id: '…' } }))`)
  })

  it('an unknown operation suggests near names', () => {
    expect(renderOperation(loaded.surfaces, 'Order')).toMatch(/Did you mean: `getOrder`, `orderEvents`, `updateOrder`/)
    expect(renderOperation(loaded.surfaces, 'qqq')).toContain('Call `get_api_client()` for the list.')
  })
})

describe('shapes the renderer must not assume away', () => {
  it('samples each parameter type, lists aliases, and copes with a surface that recorded no module/symbols', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-lathe-shapes-'))
    roots.push(dir)
    const spec = JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'Shapes', version: '1' },
      paths: {
        '/ping': { get: { operationId: 'ping', responses: { 204: { description: 'ok' } } } },
        '/items': {
          get: {
            operationId: 'listItems',
            parameters: [
              { name: 'n', in: 'query', required: true, schema: { type: 'integer' } },
              { name: 'on', in: 'query', required: true, schema: { type: 'boolean' } },
              { name: 'ids', in: 'query', required: true, schema: { type: 'array', items: { type: 'string' } } },
              { name: 'kind', in: 'query', required: true, schema: { $ref: '#/components/schemas/Kind' } },
              { name: 'item', in: 'query', required: true, schema: { $ref: '#/components/schemas/Item' } },
            ],
            responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Kind' } } } } },
          },
        },
      },
      components: {
        schemas: {
          Kind: { type: 'string', enum: ['a', 'b'] },
          Item: { type: 'object', properties: { x: { type: 'string' } } },
        },
      },
    })
    const surface = JSON.parse(
      generate(spec, resolveConfig({ input: 'x' })).files.find((f) => f.path === 'api-surface.json')?.contents ?? '{}',
    ) as { operations: Record<string, { module?: string; symbols?: string[] }> }
    for (const op of Object.values(surface.operations)) {
      delete op.module
      delete op.symbols
    }
    writeFileSync(join(dir, 'api-surface.json'), JSON.stringify(surface))
    const loaded = loadSurfaces(dir, dir)
    if (!loaded.ok) throw new Error('did not load')
    const index = renderClientIndex(loaded.surfaces)
    expect(index).toContain('## (module not recorded)')
    expect(index).toContain('- `Kind` = enum("a"|"b")')
    const items = renderOperation(loaded.surfaces, 'listItems')
    // `kind` is an enum MODEL: the sample resolves through the alias to a member.
    expect(items).toContain('query: { ids: [], item: { … }, kind: "a", n: 1, on: true }')
    expect(items).toContain('- `Kind` = enum("a"|"b")')
    expect(items).toContain(`from '${loaded.surfaces[0]?.base}/endpoints/<module>'`)
    const ping = renderOperation(loaded.surfaces, 'ping')
    expect(ping).toContain('- none')
    expect(ping).toContain('- response: none (no content)')
  })
})

describe('through the MCP server', () => {
  it('serves all three tools', async () => {
    const before = project(['name', 'email'])
    const after = project(['name'])
    const { client, close } = await newClient()
    try {
      const index = await callTool(client, 'get_api_client', { path: after.gen })
      expect(index).toContain('`getOrder`')
      const op = await callTool(client, 'get_api_operation', { operation: 'getOrder', path: after.gen })
      expect(op).toContain('## Call it')
      const diff = await callTool(client, 'explain_api_diff', {
        before: join(before.gen, 'api-surface.json'),
        after: join(after.gen, 'api-surface.json'),
      })
      expect(diff).toContain('### API contract: 1 breaking, 0 additive')
      expect(diff).toContain('`Customer.email` (`field-now-optional`): the app reads it unconditionally today')
      // Transitive: Order contains Customer, so every Order operation is named.
      expect(diff).toContain('`getOrder`, `useGetOrder` (orders)')
      const missing = await callTool(client, 'get_api_client', { path: join(before.root, 'nope') })
      expect(missing).toContain('does not exist')
      const bad = await callTool(client, 'explain_api_diff', { before: join(before.root, 'nope.json'), after: join(after.gen, 'api-surface.json') })
      expect(bad).toMatch(/Could not compute the diff: .*nope\.json` does not exist/)
    } finally {
      await close()
    }
  })
})
