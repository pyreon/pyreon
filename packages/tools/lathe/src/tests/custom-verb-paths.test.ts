/**
 * A literal `:` in a spec path — Google-style custom verbs such as
 * `/v1/{name}:cancel` (audit A11). `@pyreon/http` read `:cancel` as a second
 * parameter, so the typed params demanded `cancel` and the request threw
 * `needs the parameter "cancel"`. Lathe now escapes literal colons (`\:`),
 * which `@pyreon/http`, the generated adapters, the mocks and PMTC all read
 * as a literal colon.
 */
import type { HttpMiddleware } from '@pyreon/http'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { typecheckSpec } from './helpers/typecheck'

const ok = { '200': { description: 'x', content: { 'application/json': { schema: { $ref: '#/components/schemas/Op' } } } } }
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/v1/{name}:cancel': {
      post: { operationId: 'cancelOp', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: ok },
    },
    '/v1/projects:list': { get: { operationId: 'listProjects', responses: ok } },
  },
  components: { schemas: { Op: { type: 'object', required: ['done'], properties: { done: { type: 'boolean' } } } } },
})

afterAll(() => cleanEmitted('a11'))

describe('literal colons in spec paths', () => {
  it('escapes them in the declared path', () => {
    const e = emitToDisk('a11', SPEC, { plugins: ['schemas', 'client', 'mocks'] })
    expect(e.file('endpoints/default.ts')).toContain(String.raw`'POST /v1/:name\\:cancel'`)
  })

  it('sends the literal colon and needs only the real parameter', async () => {
    const e = emitToDisk('a11', SPEC, { plugins: ['schemas', 'client', 'mocks'] })
    const client = await e.load<{ setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
    const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/default.ts')
    const seen: string[] = []
    client.setDevTransport(async (req) => {
      seen.push(`${req.method} ${req.url}`)
      return {
        raw: new Response('{"done":true}'),
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        request: req,
      }
    })
    try {
      await eps.cancelOp?.({ params: { name: 'ops/1' } })
      await eps.listProjects?.()
    } finally {
      client.setDevTransport(null)
    }
    expect(seen).toEqual(['POST https://api.test/v1/ops%2F1:cancel', 'GET https://api.test/v1/projects:list'])
  })

  it('the generated mocks intercept both routes', async () => {
    const e = emitToDisk('a11', SPEC, { plugins: ['schemas', 'client', 'mocks'] })
    const mocks = await e.load<{ installMocks(): void }>('mocks.ts')
    const client = await e.load<{ setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
    const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/default.ts')
    mocks.installMocks()
    try {
      await expect(eps.cancelOp?.({ params: { name: 'x' } })).resolves.toEqual({ done: true })
      await expect(eps.listProjects?.()).resolves.toEqual({ done: true })
    } finally {
      client.setDevTransport(null)
    }
  })

  it('typechecks for every client', () => {
    for (const client of ['pyreon', 'fetch'] as const) {
      const { errors } = typecheckSpec(`a11-${client}`, SPEC, { client, plugins: ['schemas', 'client', 'queries', 'mocks'] })
      expect(errors, errors.join('\n')).toEqual([])
    }
  })
})
