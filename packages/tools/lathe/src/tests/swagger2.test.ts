/**
 * Swagger 2.0 is read by up-converting it to OpenAPI 3.0 in process.
 *
 * Each spec pins one row of the mapping in `input/swagger2.ts`, asserted on
 * the IR the generator actually consumes -- not on the intermediate 3.0 tree,
 * which could be "right" and still be read wrong. The real documents
 * (Kubernetes, Swagger Petstore v2) are in the corpus gate, which imports
 * their generated schemas; the heavy `tsc` run over the full Kubernetes spec
 * is `scripts/typecheck-real-specs.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { IrDocument, IrOperation } from '../core/ir'
import { loadOpenApi } from '../input/openapi'
import { upgradeSwagger2 } from '../input/swagger2'

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'corpus')

function load(spec: Record<string, unknown>, sourceUrl?: string): IrDocument {
  return loadOpenApi(
    JSON.stringify({ swagger: '2.0', info: { title: 'S', version: '1' }, host: 'api.test', schemes: ['https'], paths: {}, ...spec }),
    sourceUrl ? { sourceUrl } : {},
  ).doc
}

function op(doc: IrDocument, id: string): IrOperation {
  const found = doc.operations.find((o) => o.id === id)
  if (!found) throw new Error(`no operation ${id}`)
  return found
}

const ok = { 200: { description: 'ok' } }

describe('servers from host / basePath / schemes', () => {
  it('prefers https when several schemes are declared', () => {
    expect(load({ basePath: '/v2', schemes: ['http', 'https'] }).baseUrl).toBe('https://api.test/v2')
  })

  it('takes a missing scheme from where the spec was fetched', () => {
    const doc = load({ basePath: '/v2', schemes: undefined }, 'http://docs.test/swagger.json')
    expect(doc.baseUrl).toBe('http://api.test/v2')
    expect(doc.notes.some((n) => n.code === 'swagger2-lossy')).toBe(false)
  })

  it('assumes https, and says so, when neither schemes nor a source URL say', () => {
    const doc = load({ basePath: '/v2', schemes: undefined })
    expect(doc.baseUrl).toBe('https://api.test/v2')
    expect(doc.notes.find((n) => n.code === 'swagger2-lossy')?.at).toBe('#/schemes')
  })

  it('with no host, resolves the basePath against the spec URL', () => {
    const doc = load({ host: undefined, basePath: '/api' }, 'https://docs.test/swagger.json')
    expect(doc.baseUrl).toBe('https://docs.test/api')
  })
})

describe('models', () => {
  it('reads `definitions` and rewrites `#/definitions` refs', () => {
    const doc = load({
      definitions: {
        Pet: { type: 'object', required: ['id'], properties: { id: { type: 'integer' }, owner: { $ref: '#/definitions/User' } } },
        User: { type: 'object', properties: { name: { type: 'string' } } },
      },
    })
    expect(doc.models.map((m) => m.name)).toEqual(['Pet', 'User'])
    const pet = doc.models[0]?.type
    expect(pet?.kind === 'object' && pet.fields.find((f) => f.name === 'owner')?.type).toEqual({ kind: 'ref', name: 'User' })
  })

  it('translates `x-nullable`, `type: file` and a string `discriminator`', () => {
    const doc = load({
      definitions: {
        N: { type: 'string', 'x-nullable': true },
        F: { type: 'file' },
        Base: { type: 'object', discriminator: 'kind', required: ['kind'], properties: { kind: { type: 'string' } } },
      },
    })
    const byName = Object.fromEntries(doc.models.map((m) => [m.name, m.type]))
    expect(byName.N).toEqual({ kind: 'nullable', inner: { kind: 'string' } })
    expect(byName.F).toMatchObject({ kind: 'string', format: 'binary' })
    const upgraded = upgradeSwagger2({ swagger: '2.0', definitions: { B: { discriminator: 'kind' } } }).doc
    expect(upgraded).toMatchObject({ components: { schemas: { B: { discriminator: { propertyName: 'kind' } } } } })
  })
})

describe('request bodies', () => {
  it('turns an `in: body` parameter into a requestBody per `consumes`', () => {
    const doc = load({
      consumes: ['application/json'],
      paths: {
        '/pets': {
          post: {
            operationId: 'addPet',
            parameters: [{ in: 'body', name: 'body', required: true, schema: { type: 'object', properties: { a: { type: 'string' } } } }],
            responses: ok,
          },
        },
      },
    })
    expect(op(doc, 'addPet').body).toMatchObject({ mediaType: 'application/json', encoding: 'json', required: true })
  })

  it('resolves a GLOBAL body parameter through components.requestBodies', () => {
    const doc = load({
      parameters: { PetBody: { in: 'body', name: 'body', required: true, schema: { $ref: '#/definitions/Pet' } } },
      definitions: { Pet: { type: 'object', properties: { id: { type: 'integer' } } } },
      paths: { '/pets': { post: { operationId: 'addPet', parameters: [{ $ref: '#/parameters/PetBody' }], responses: ok } } },
    })
    expect(op(doc, 'addPet').body).toMatchObject({ encoding: 'json', type: { kind: 'ref', name: 'Pet' }, required: true })
  })

  it('collects `in: formData` fields into a url-encoded object body', () => {
    const doc = load({
      paths: {
        '/login': {
          post: {
            operationId: 'login',
            parameters: [
              { in: 'formData', name: 'user', type: 'string', required: true },
              { in: 'formData', name: 'remember', type: 'boolean' },
            ],
            responses: ok,
          },
        },
      },
    })
    const body = op(doc, 'login').body
    expect(body?.mediaType).toBe('application/x-www-form-urlencoded')
    expect(body?.type).toMatchObject({
      kind: 'object',
      fields: [
        { name: 'user', required: true, type: { kind: 'string' } },
        { name: 'remember', required: false, type: { kind: 'boolean' } },
      ],
    })
  })

  it('uses multipart when a form field is a file, and types it as binary', () => {
    const doc = load({
      paths: {
        '/up': {
          post: { operationId: 'up', parameters: [{ in: 'formData', name: 'file', type: 'file', required: true }], responses: ok },
        },
      },
    })
    const body = op(doc, 'up').body
    expect(body?.encoding).toBe('multipart')
    expect(body?.type).toMatchObject({ kind: 'object', fields: [{ name: 'file', type: { kind: 'string', format: 'binary' } }] })
  })

  it('moves a PATH-LEVEL body parameter into each operation, and an operation one overrides it', () => {
    const doc = load({
      paths: {
        '/x': {
          parameters: [{ in: 'body', name: 'body', schema: { type: 'string' } }],
          put: { operationId: 'shared', responses: ok },
          post: { operationId: 'own', parameters: [{ in: 'body', name: 'body', schema: { type: 'integer' } }], responses: ok },
        },
      },
    })
    expect(op(doc, 'shared').body?.type).toEqual({ kind: 'string' })
    expect(op(doc, 'own').body?.type).toMatchObject({ kind: 'number', integer: true })
  })
})

describe('parameters', () => {
  const withArray = (collectionFormat: string | undefined) =>
    load({
      paths: {
        '/x': {
          get: {
            operationId: 'x',
            parameters: [
              { in: 'query', name: 'a', type: 'array', items: { type: 'string' }, ...(collectionFormat ? { collectionFormat } : {}) },
            ],
            responses: ok,
          },
        },
      },
    })

  it.each([
    ['multi', 'form', true],
    ['csv', 'form', false],
    ['ssv', 'spaceDelimited', false],
    ['pipes', 'pipeDelimited', false],
  ])('collectionFormat %s -> style %s, explode %s', (fmt, style, explode) => {
    expect(op(withArray(fmt), 'x').queryParams[0]).toMatchObject({ style, explode })
  })

  it('an array with NO collectionFormat is csv (Swagger 2 default), not 3.0-exploded', () => {
    expect(op(withArray(undefined), 'x').queryParams[0]).toMatchObject({ style: 'form', explode: false })
  })

  it('reports `tsv`, which OpenAPI 3 cannot spell', () => {
    const doc = withArray('tsv')
    expect(doc.notes.find((n) => n.code === 'swagger2-lossy')?.message).toContain('tsv')
  })

  it('moves type / format / enum / bounds into `schema`', () => {
    const doc = load({
      paths: {
        '/x': {
          get: {
            operationId: 'x',
            parameters: [{ in: 'query', name: 'n', type: 'integer', minimum: 1, maximum: 5, required: true }],
            responses: ok,
          },
        },
      },
    })
    expect(op(doc, 'x').queryParams[0]).toMatchObject({ required: true, type: { kind: 'number', integer: true, minimum: 1, maximum: 5 } })
  })
})

describe('responses and security', () => {
  it('reads `responses.<code>.schema` under the `produces` media type', () => {
    const doc = load({
      produces: ['application/json'],
      definitions: { Pet: { type: 'object', properties: { id: { type: 'integer' } } } },
      paths: { '/p': { get: { operationId: 'p', responses: { 200: { description: 'ok', schema: { $ref: '#/definitions/Pet' } } } } } },
    })
    expect(op(doc, 'p').response).toEqual({ kind: 'ref', name: 'Pet' })
  })

  it('maps basic / apiKey / oauth2 security definitions', () => {
    const doc = load({
      securityDefinitions: {
        b: { type: 'basic' },
        k: { type: 'apiKey', in: 'header', name: 'X-Key' },
        o: { type: 'oauth2', flow: 'accessCode', authorizationUrl: 'https://a', tokenUrl: 'https://t', scopes: {} },
      },
    })
    expect(doc.securitySchemes).toEqual([
      { name: 'b', kind: 'basic', doc: undefined },
      { name: 'k', kind: 'apiKey', in: 'header', param: 'X-Key', doc: undefined },
      { name: 'o', kind: 'bearer', doc: undefined },
    ])
  })

  it('per-operation schemes are a loss ONLY when they exclude the scheme the client uses', () => {
    const spec = (schemes: string[]) => ({
      schemes: ['https'],
      paths: { '/x': { get: { operationId: 'x', schemes, responses: ok } } },
    })
    expect(load(spec(['https'])).notes.some((n) => n.code === 'swagger2-lossy')).toBe(false)
    expect(load(spec(['http'])).notes.some((n) => n.code === 'swagger2-lossy')).toBe(true)
  })
})

describe('conversion hygiene', () => {
  it('does not mutate the input document', () => {
    const input = {
      swagger: '2.0',
      definitions: { A: { type: 'string', 'x-nullable': true } },
      paths: { '/x': { get: { parameters: [{ in: 'query', name: 'q', type: 'string' }], responses: ok } } },
    }
    const before = JSON.stringify(input)
    upgradeSwagger2(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('says the document was converted, so note pointers are read against the right tree', () => {
    expect(load({}).notes[0]?.code).toBe('swagger2-converted')
  })
})

describe('real Swagger 2 documents', () => {
  it('Swagger Petstore v2: every model, a typed response, form and multipart bodies', () => {
    const doc = loadOpenApi(readFileSync(join(CORPUS, 'swagger2-petstore.json'), 'utf8')).doc
    expect(doc.models.map((m) => m.name)).toEqual(['ApiResponse', 'Category', 'Order', 'Pet', 'Tag', 'User'])
    expect(doc.baseUrl).toBe('https://petstore.swagger.io/v2')
    expect(op(doc, 'getPetById').response).toEqual({ kind: 'ref', name: 'Pet' })
    expect(op(doc, 'updatePetWithForm').body?.encoding).toBe('form')
    expect(op(doc, 'uploadFile').body?.encoding).toBe('multipart')
    expect(op(doc, 'findPetsByStatus').queryParams[0]).toMatchObject({ style: 'form', explode: true })
  })

  it('Kubernetes excerpt: global body parameters, path-level params, typed list responses', () => {
    const doc = loadOpenApi(readFileSync(join(CORPUS, 'k8s-swagger2.excerpt.json'), 'utf8')).doc
    const list = op(doc, 'listCoreV1NamespacedConfigMap')
    expect(list.response).toEqual({ kind: 'ref', name: 'IoK8sApiCoreV1ConfigMapList' })
    expect(list.pathParams.map((p) => p.name)).toEqual(['namespace'])
    expect(op(doc, 'createCoreV1NamespacedConfigMap').body).toMatchObject({ required: true, type: { kind: 'ref', name: 'IoK8sApiCoreV1ConfigMap' } })
    expect(doc.operations.every((o) => o.response !== undefined)).toBe(true)
  })
})
