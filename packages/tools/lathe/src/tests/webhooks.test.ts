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
