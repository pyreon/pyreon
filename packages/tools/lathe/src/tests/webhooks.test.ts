/**
 * Webhooks and callbacks: requests the API SENDS.
 *
 * They were ignored without a word (GitHub's 3.1 spec declares 272). They are
 * not operations -- a client never makes them -- so they reach the IR as
 * `IrWebhook`s and the output as `webhooks.ts`: one schema per payload, to
 * validate an untrusted body, and `WebhookHandler<name>` typed from it.
 */
import { loadOpenApi } from '../input/openapi'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { typecheckSpec } from './helpers/typecheck'

const PET = { type: 'object', required: ['id', 'name'], properties: { id: { type: 'integer', readOnly: true }, name: { type: 'string' } } }

const SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Hooks', version: '1' },
  servers: [{ url: 'https://api.test' }],
  webhooks: {
    newPet: {
      post: {
        summary: 'A pet was added.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { 200: { description: 'ack' } },
      },
    },
    ping: { post: { responses: { 204: { description: 'ok' } } } },
    audit: {
      post: { requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['at'], properties: { at: { type: 'string' } } } } } }, responses: {} },
      put: { requestBody: { content: { 'text/plain': { schema: { type: 'string' } } } }, responses: {} },
    },
  },
  paths: {
    '/subscriptions': {
      post: {
        operationId: 'subscribe',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { callbackUrl: { type: 'string' } } } } } },
        responses: { 201: { description: 'ok' } },
        callbacks: {
          onEvent: {
            '{$request.body#/callbackUrl}': {
              post: {
                requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['created', 'deleted'] } } } } } },
                responses: { 200: { description: 'ok' } },
              },
            },
          },
        },
      },
    },
  },
  components: { schemas: { Pet: PET } },
})

describe('the IR', () => {
  const doc = loadOpenApi(SPEC).doc

  it('models 3.1 webhooks and operation callbacks, with their payloads', () => {
    expect(doc.webhooks?.map((w) => [w.kind, w.name, w.method])).toEqual([
      ['webhook', 'audit.post', 'POST'],
      ['webhook', 'audit.put', 'PUT'],
      ['webhook', 'newPet', 'POST'],
      ['webhook', 'ping', 'POST'],
      ['callback', 'subscribe.onEvent', 'POST'],
    ])
    const newPet = doc.webhooks?.find((w) => w.name === 'newPet')
    expect(newPet).toMatchObject({ summary: 'A pet was added.', payload: { kind: 'ref', name: 'Pet' }, mediaType: 'application/json' })
    expect(doc.webhooks?.find((w) => w.name === 'ping')?.payload).toBeUndefined()
    expect(doc.webhooks?.find((w) => w.kind === 'callback')?.expression).toBe('{$request.body#/callbackUrl}')
  })

  it('says they exist, rather than dropping them silently', () => {
    expect(doc.notes.find((n) => n.code === 'webhooks')?.message).toContain('5 webhook/callback')
  })

  it('is not an operation: the client gets no endpoint for them', () => {
    expect(doc.operations.map((o) => o.id)).toEqual(['subscribe'])
  })
})

describe('webhooks.ts', () => {
  afterAll(() => cleanEmitted('webhooks'))

  it('validates an incoming payload with the emitted schema', async () => {
    const e = emitToDisk('webhooks', SPEC, { plugins: ['schemas'] })
    const mod = await e.load<{
      webhookSchemas: Record<string, { '~standard': { validate(v: unknown): Promise<{ issues?: unknown[] }> | { issues?: unknown[] } } }>
    }>('webhooks.ts')
    const check = async (name: string, body: unknown): Promise<boolean> =>
      !(await mod.webhookSchemas[name]?.['~standard'].validate(body))?.issues
    expect(await check('newPet', { id: 1, name: 'Rex' })).toBe(true)
    expect(await check('newPet', { id: 1 })).toBe(false)
    expect(await check('subscribe.onEvent', { kind: 'created' })).toBe(true)
    expect(await check('subscribe.onEvent', { kind: 'nope' })).toBe(false)
    expect(e.file('index.ts')).toContain("export * from './webhooks'")
  })

  it.each(['pyreon', 'zod'] as const)('types a handler from the payload schema (validator=%s)', (validator) => {
    const usage = `
import type { WebhookHandler, WebhookPayloads } from './webhooks'
export const onNewPet: WebhookHandler<'newPet'> = (pet) => { void pet.name.toUpperCase(); void pet.id.toFixed() }
export const onEvent: WebhookHandler<'subscribe.onEvent'> = (e) => { void e.kind }
export const onPing: WebhookHandler<'ping'> = (p) => { const nothing: undefined = p; void nothing }
// @ts-expect-error -- the payload's type is enforced
export const wrong: WebhookHandler<'newPet'> = (pet) => { void pet.nope }
export type Keys = keyof WebhookPayloads
`
    const { errors } = typecheckSpec(`webhooks-${validator}`, SPEC, { validator, plugins: ['schemas', 'client', 'queries'] }, { extra: { 'usage.ts': usage } })
    expect(errors, errors.join('\n')).toEqual([])
  })
})

describe('the receiving side, executed', () => {
  type Handler = (input: Request | { request: Request }) => Promise<Response>
  interface Mod {
    webhookHandler(handlers: Record<string, (payload: unknown, ctx: { name: string; rawBody: string; bytes: Uint8Array }) => unknown>, options?: {
      verify?: (ctx: { request: Request; bytes: Uint8Array; rawBody: string }) => boolean | Promise<boolean>
      event?: (request: Request, body: unknown) => string | undefined
    }): Handler
    validateWebhook(name: string, body: unknown): Promise<{ ok: boolean; value?: unknown; issues?: unknown[] }>
    callbackUrl(name: string, ctx: Record<string, unknown>): string
    evaluateRuntimeExpression(expression: string, ctx: Record<string, unknown>): unknown
    expandCallbackUrl(template: string, ctx: Record<string, unknown>): string
  }
  let mod: Mod
  beforeAll(async () => {
    mod = await emitToDisk('webhooks-runtime', SPEC, { plugins: ['schemas'] }).load<Mod>('webhooks.ts')
  })
  afterAll(() => cleanEmitted('webhooks-runtime'))

  const post = (body: string, headers: Record<string, string> = { 'content-type': 'application/json' }, method = 'POST') =>
    new Request('https://app.test/hooks', method === 'GET' ? { method, headers } : { method, body, headers })

  it('validates, then dispatches a valid payload to its handler (204)', async () => {
    const seen: unknown[] = []
    const handle = mod.webhookHandler({ newPet: (pet) => void seen.push(pet) })
    const ok = await handle(post('{"id":1,"name":"Rex"}'))
    expect(ok.status).toBe(204)
    expect(seen).toEqual([{ id: 1, name: 'Rex' }])
  })

  it('refuses an invalid payload with its issues (422), a bad body (400) and a wrong method (405)', async () => {
    const handle = mod.webhookHandler({ newPet: () => undefined })
    const invalid = await handle(post('{"id":1}'))
    expect(invalid.status).toBe(422)
    expect(((await invalid.json()) as { issues: unknown[] }).issues.length).toBeGreaterThan(0)
    expect((await handle(post('{not json'))).status).toBe(400)
    const wrong = await handle(post('', {}, 'GET'))
    expect(wrong.status).toBe(405)
    expect(wrong.headers.get('allow')).toBe('POST')
  })

  it('verify sees the exact bytes before anything is parsed; refusing (or throwing) is 401', async () => {
    const calls: string[] = []
    const accept = mod.webhookHandler(
      { newPet: () => void calls.push('handled') },
      { verify: ({ bytes, rawBody }) => (calls.push(`verify ${bytes.length} ${rawBody}`), true) },
    )
    expect((await accept(post('{"id":1,"name":"Rex"}'))).status).toBe(204)
    expect(calls).toEqual(['verify 21 {"id":1,"name":"Rex"}', 'handled'])
    const refuse = mod.webhookHandler({ newPet: () => void calls.push('never') }, { verify: () => false })
    expect((await refuse(post('{not json'))).status).toBe(401)
    const throws = mod.webhookHandler({ newPet: () => void calls.push('never') }, {
      verify: () => {
        throw new Error('bad signature')
      },
    })
    expect((await throws(post('{"id":1,"name":"Rex"}'))).status).toBe(401)
    expect(calls).not.toContain('never')
  })

  it('routes several webhooks by `event`, parsing each by ITS media type', async () => {
    const seen: Array<[string, unknown]> = []
    const handle = mod.webhookHandler(
      {
        newPet: (p, ctx) => void seen.push([ctx.name, p]),
        'audit.put': (p, ctx) => void seen.push([ctx.name, p]),
        ping: (p, ctx) => void seen.push([ctx.name, p]),
      },
      { event: (req) => req.headers.get('x-event') ?? undefined },
    )
    // `newPet` (JSON) is the first candidate, so this text body does not parse
    // as JSON -- it must still reach `audit.put`, which declares text/plain.
    expect((await handle(post('hello', { 'content-type': 'text/plain', 'x-event': 'audit.put' }, 'PUT'))).status).toBe(204)
    expect((await handle(post('', { 'x-event': 'ping' }))).status).toBe(204)
    expect((await handle(post('{}', { 'x-event': 'nope' }))).status).toBe(404)
    expect((await handle(post('{}', {}))).status).toBe(404)
    expect(seen).toEqual([
      ['audit.put', 'hello'],
      ['ping', undefined],
    ])
  })

  it('takes zero\'s `{ request }` context, and passes a handler\'s own Response through', async () => {
    const handle = mod.webhookHandler({ newPet: () => new Response('queued', { status: 202 }) })
    const res = await handle({ request: post('{"id":1,"name":"Rex"}') })
    expect(res.status).toBe(202)
    expect(await res.text()).toBe('queued')
  })

  it('refuses a registration it cannot honour, at construction', () => {
    expect(() => mod.webhookHandler({})).toThrow('register at least one handler')
    expect(() => mod.webhookHandler({ newPet: () => undefined, ping: () => undefined })).toThrow('need an `event` option')
    expect(() => mod.webhookHandler({ nope: () => undefined })).toThrow('`nope` is not a webhook or callback this API declares')
  })

  it('validateWebhook runs the schema, and a body-less webhook validates to undefined', async () => {
    expect(await mod.validateWebhook('subscribe.onEvent', { kind: 'created' })).toEqual({ ok: true, value: { kind: 'created' } })
    expect((await mod.validateWebhook('subscribe.onEvent', { kind: 'x' })).ok).toBe(false)
    expect(await mod.validateWebhook('ping', 'anything')).toEqual({ ok: true, value: undefined })
  })
})

describe('callback URLs: the OpenAPI runtime-expression evaluator', () => {
  interface Mod {
    callbackUrl(name: string, ctx: Record<string, unknown>): string
    evaluateRuntimeExpression(expression: string, ctx: Record<string, unknown>): unknown
    expandCallbackUrl(template: string, ctx: Record<string, unknown>): string
    callbackUrls: Record<string, string>
  }
  let mod: Mod
  beforeAll(async () => {
    mod = await emitToDisk('webhooks-callbacks', SPEC, { plugins: ['schemas'] }).load<Mod>('webhooks.ts')
  })
  afterAll(() => cleanEmitted('webhooks-callbacks'))

  it('resolves a callback from the registering request body', () => {
    expect(mod.callbackUrls).toEqual({ 'subscribe.onEvent': '{$request.body#/callbackUrl}' })
    expect(mod.callbackUrl('subscribe.onEvent', { request: { body: { callbackUrl: 'https://client.test/cb' } } })).toBe(
      'https://client.test/cb',
    )
    expect(() => mod.callbackUrl('subscribe.onEvent', { request: { body: {} } })).toThrow(
      'callback URL: `$request.body#/callbackUrl` resolved to nothing',
    )
  })

  it('evaluates every source of the grammar', () => {
    const ctx = {
      url: 'https://api.test/subscribe?queryUrl=https://q.test&n=1',
      method: 'POST',
      statusCode: 201,
      request: {
        headers: new Headers({ 'X-Callback': 'https://h.test' }),
        path: { id: '42' },
        body: { a: { 'b/c': [10, { 'd~e': 'deep' }] } },
      },
      response: { headers: { Location: '/subs/7' }, body: { id: 7 } },
    }
    expect(mod.evaluateRuntimeExpression('$url', ctx)).toBe(ctx.url)
    expect(mod.evaluateRuntimeExpression('$method', ctx)).toBe('POST')
    expect(mod.evaluateRuntimeExpression('$statusCode', ctx)).toBe(201)
    expect(mod.evaluateRuntimeExpression('$request.header.x-callback', ctx)).toBe('https://h.test')
    expect(mod.evaluateRuntimeExpression('$request.query.queryUrl', ctx)).toBe('https://q.test')
    expect(mod.evaluateRuntimeExpression('$request.path.id', ctx)).toBe('42')
    expect(mod.evaluateRuntimeExpression('$request.body#/a/b~1c/1/d~0e', ctx)).toBe('deep')
    expect(mod.evaluateRuntimeExpression('$request.body', ctx)).toBe(ctx.request.body)
    expect(mod.evaluateRuntimeExpression('$response.header.location', ctx)).toBe('/subs/7')
    expect(mod.evaluateRuntimeExpression('$response.body#/id', ctx)).toBe(7)
    expect(mod.evaluateRuntimeExpression('$request.query.q', { request: { query: { q: 'r' } } })).toBe('r')
    expect(
      mod.expandCallbackUrl('https://n.test/cb?tx={$request.body#/a/b~1c/0}&id={$response.body#/id}', ctx),
    ).toBe('https://n.test/cb?tx=10&id=7')
    expect(mod.expandCallbackUrl('$request.header.X-Callback', ctx)).toBe('https://h.test')
  })

  it('refuses what the grammar does not allow', () => {
    expect(() => mod.evaluateRuntimeExpression('$request.cookie.x', {})).toThrow('is not an OpenAPI runtime expression')
    expect(() => mod.evaluateRuntimeExpression('$response.query.x', {})).toThrow('a response has no query')
    expect(() => mod.evaluateRuntimeExpression('$request.bodyx', {})).toThrow('a body reference is')
  })
})

describe('the receiving side typechecks', () => {
  it.each(['pyreon', 'zod'] as const)('with validator=%s', (validator) => {
    const usage = `
import { callbackUrl, validateWebhook, webhookHandler, type WebhookHandlers } from './webhooks'
const handlers: WebhookHandlers = {
  newPet: (pet, ctx) => { void pet.name.toUpperCase(); void ctx.bytes.length },
  'subscribe.onEvent': (e) => { void (e.kind === 'created') },
}
export const POST = webhookHandler(handlers, { event: (req) => (req.headers.get('x-event') === 'pet' ? 'newPet' : 'subscribe.onEvent'), verify: ({ bytes }) => bytes.length > 0 })
export const zeroRoute = (ctx: { request: Request }) => POST(ctx)
export const url: string = callbackUrl('subscribe.onEvent', { request: { body: { callbackUrl: 'x' } } })
export async function check(): Promise<void> {
  const r = await validateWebhook('newPet', {})
  if (r.ok) void r.value.name
}
// @ts-expect-error -- a handler's payload is typed
export const wrong: WebhookHandlers = { newPet: (pet) => { void pet.nope } }
`
    const { errors } = typecheckSpec(`webhooks-runtime-${validator}`, SPEC, { validator, plugins: ['schemas'] }, { extra: { 'usage.ts': usage } })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
