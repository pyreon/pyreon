/**
 * The `mcp` plugin — every operation as an MCP tool definition.
 *
 * What matters is that a MODEL can use the result: each input schema must be
 * self-contained (a client resolves `$ref` only within the schema it was
 * handed), mirror the generated endpoint's argument shape exactly (so `call`
 * can pass it straight through), and terminate on a recursive model. And the
 * `call` must really run the generated client — proven here through the
 * generated mocks, with no network.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveConfig, type ClientName } from '../core/config'
import { generate } from '../core/generate'
import { loadOpenApi } from '../input/openapi'
import { toJsonSchema, toolInputSchema } from '../emit/mcp'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Ops', version: '1' },
  servers: [{ url: 'https://ops.test' }],
  paths: {
    '/jobs/{id}': {
      get: {
        operationId: 'getJob',
        summary: 'One job',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'verbose', in: 'query', schema: { type: 'boolean' }, description: 'include logs' },
        ],
        responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } } },
      },
      delete: {
        operationId: 'deleteJob',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'gone' } },
      },
    },
    '/jobs': {
      post: {
        operationId: 'createJob',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } },
        responses: { 201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } } },
      },
    },
    '/jobs/{id}/log': {
      get: {
        operationId: 'tailJob',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { content: { 'text/event-stream': { schema: { type: 'string' } } } } },
      },
    },
    '/upload': {
      post: {
        operationId: 'upload',
        requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 204: { description: 'ok' } },
      },
    },
  },
  components: {
    schemas: {
      Job: {
        type: 'object',
        required: ['name', 'state'],
        properties: {
          name: { type: 'string', minLength: 1, description: 'human name' },
          state: { type: 'string', enum: ['queued', 'done'] },
          retries: { type: 'integer', minimum: 0, maximum: 5 },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 3, uniqueItems: true },
          parent: { $ref: '#/components/schemas/Job' },
          note: { type: ['string', 'null'] },
          meta: { type: 'object', additionalProperties: { type: 'number' } },
          owner: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
        },
      },
    },
  },
})

const mcpFile = (client: ClientName = 'pyreon'): string =>
  generate(SPEC, resolveConfig({ input: 'x', client, plugins: ['mcp'] })).files.find((f) => f.path === 'mcp.ts')?.contents ?? ''

describe('input schemas', () => {
  const { doc } = loadOpenApi(SPEC)
  const models = new Map(doc.models.map((m) => [m.name, m.type]))
  const op = (id: string) => doc.operations.find((o) => o.id === id)!

  it('mirrors the endpoint argument shape, with required exactly where the call requires it', () => {
    const s = toolInputSchema(op('getJob'), models)
    expect(s).toMatchObject({
      type: 'object',
      required: ['params'],
      additionalProperties: false,
      properties: {
        params: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } }, required: ['id'] },
        query: { type: 'object', properties: { verbose: { type: 'boolean', description: 'include logs' } } },
      },
    })
    expect((s.properties as Record<string, Record<string, unknown>>).query?.required).toBeUndefined()
    expect(toolInputSchema(op('createJob'), models)).toMatchObject({ required: ['json'], properties: { json: { $ref: '#/$defs/Job' } } })
  })

  it('is self-contained: every $ref resolves in its own $defs, and a recursive model terminates', () => {
    const s = toolInputSchema(op('createJob'), models)
    const defs = s.$defs as Record<string, Record<string, unknown>>
    const job = defs.Job as { properties: Record<string, unknown>; required: string[] }
    expect(job.required).toEqual(['name', 'state'])
    expect(job.properties.parent).toEqual({ $ref: '#/$defs/Job' })
    const refs = JSON.stringify(s).match(/#\/\$defs\/(\w+)/g) ?? []
    for (const r of refs) expect(defs[r.slice('#/$defs/'.length)]).toBeDefined()
  })

  it('translates every IR kind', () => {
    const defs = new Map()
    const job = toJsonSchema({ kind: 'ref', name: 'Job' }, models, defs)
    expect(job).toEqual({ $ref: '#/$defs/Job' })
    const props = (defs.get('Job') as { properties: Record<string, unknown> }).properties
    expect(props.name).toEqual({ type: 'string', minLength: 1, description: 'human name' })
    expect(props.state).toEqual({ enum: ['queued', 'done'] })
    expect(props.retries).toEqual({ type: 'integer', minimum: 0, maximum: 5 })
    expect(props.tags).toEqual({ type: 'array', items: { type: 'string' }, maxItems: 3, uniqueItems: true })
    expect(props.note).toEqual({ anyOf: [{ type: 'string' }, { type: 'null' }] })
    expect(props.meta).toEqual({ type: 'object', properties: {}, additionalProperties: { type: 'number' } })
    expect(props.owner).toEqual({ anyOf: [{ type: 'string' }, { type: 'integer' }] })
    expect(toJsonSchema({ kind: 'unknown', reason: 'x' }, models, defs)).toEqual({})
    expect(toJsonSchema({ kind: 'null' }, models, defs)).toEqual({ type: 'null' })
    expect(toJsonSchema({ kind: 'number', integer: false, exclusiveMinimum: 0, exclusiveMaximum: 1, multipleOf: 0.5 }, models, defs)).toEqual({
      type: 'number',
      exclusiveMinimum: 0,
      exclusiveMaximum: 1,
      multipleOf: 0.5,
    })
    expect(toJsonSchema({ kind: 'string', format: 'binary', maxLength: 9, pattern: '^a' }, models, defs)).toEqual({ type: 'string', maxLength: 9, pattern: '^a' })
    expect(toJsonSchema({ kind: 'array', items: { kind: 'boolean' }, minItems: 1 }, models, defs)).toEqual({ type: 'array', items: { type: 'boolean' }, minItems: 1 })
    expect(toJsonSchema({ kind: 'ref', name: 'Missing' }, models, new Map())).toEqual({ $ref: '#/$defs/Missing' })
  })
})

describe('the emitted module', () => {
  it('lists every exclusion with its reason, and annotates from the method', () => {
    const out = mcpFile()
    expect(out).toContain('- `tailJob` — streams its response — a tool call is request/response')
    expect(out).toContain('- `upload` — its multipart body cannot be written as JSON by a model')
    expect(out).not.toContain('name: "tailJob"')
    expect(out).toMatch(/name: "getJob",[\s\S]*?readOnlyHint: true, destructiveHint: false, idempotentHint: true/)
    expect(out).toMatch(/name: "deleteJob",[\s\S]*?readOnlyHint: false, destructiveHint: true, idempotentHint: true/)
    expect(out).toMatch(/name: "createJob",[\s\S]*?readOnlyHint: false, destructiveHint: false, idempotentHint: false/)
    expect(out).toContain('description: "One job — `GET /jobs/:id`"')
  })

  it('refuses a name MCP would reject', () => {
    const long = JSON.parse(SPEC) as { paths: Record<string, Record<string, { operationId: string }>> }
    ;(long.paths['/jobs/{id}'] as Record<string, { operationId: string }>).get!.operationId = `g${'x'.repeat(70)}`
    const out = generate(JSON.stringify(long), resolveConfig({ input: 'x', plugins: ['mcp'] })).files.find((f) => f.path === 'mcp.ts')?.contents
    expect(out).toContain('its name is longer than the 64 characters MCP allows')
  })

  afterAll(() => {
    for (const c of ['pyreon', 'fetch', 'axios', 'ky']) cleanTypecheck(`mcp-${c}`)
  })
  for (const client of ['pyreon', 'fetch', 'axios', 'ky'] as const) {
    it(`typechecks against the generated ${client} client`, () => {
      const { errors } = typecheckSpec(`mcp-${client}`, SPEC, { client, plugins: ['mcp'] }, { noUnused: true })
      expect(errors).toEqual([])
    }, 60_000)
  }
})

describe('a tool call runs the generated client', () => {
  const dir = join(__dirname, '.generated', 'mcp-runtime')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('through the generated mocks — no network, same pipeline', async () => {
    rmSync(dir, { recursive: true, force: true })
    for (const f of generate(SPEC, resolveConfig({ input: 'x', plugins: ['mcp', 'mocks'] })).files) {
      const p = join(dir, f.path)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, f.contents)
    }
    const { findTool, tools } = (await import(join(dir, 'mcp.ts'))) as {
      findTool(n: string): { call(i: unknown): Promise<unknown>; inputSchema: unknown } | undefined
      tools: { name: string }[]
    }
    const { installMocks } = (await import(join(dir, 'mocks.ts'))) as { installMocks(): void }
    installMocks()
    expect(tools.map((t) => t.name)).toEqual(['createJob', 'deleteJob', 'getJob'])
    const job = (await findTool('getJob')?.call({ params: { id: '00000000-0000-4000-8000-000000000000' } })) as { state: string }
    expect(job.state).toBe('queued')
    expect(findTool('nope')).toBeUndefined()
    // The schema a model reads is the one committed to disk.
    expect(readFileSync(join(dir, 'mcp.ts'), 'utf8')).toContain('"$defs"')
  })
})
