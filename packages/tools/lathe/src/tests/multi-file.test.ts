/**
 * Multi-file specs: a `$ref` into another document is resolved and the
 * documents are bundled into one before conversion.
 *
 * Each spec pins one rule of `input/bundle.ts` on the IR the emitters read.
 * The documents live in an in-memory map so each case states its whole
 * layout; the real layout (DigitalOcean's ~3,000 files) is exercised by
 * `scripts/typecheck-real-specs.ts`, where it produces the same models and
 * operations as Redocly's own bundle of it.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import type { IrDocument, IrType } from '../core/ir'
import { resolveDocId } from '../input/bundle'
import { loadOpenApi } from '../input/openapi'
import { run, parseArgv, type Fs } from '../cli/run'

type Files = Record<string, unknown>

function load(files: Files, root = 'spec/openapi.yaml'): { doc: IrDocument; documents: string[] } {
  const read = (id: string): string => {
    const f = files[id]
    if (f === undefined) throw new Error(`ENOENT ${id}`)
    return typeof f === 'string' ? f : stringify(f)
  }
  return loadOpenApi(read(root), { location: root, readDocument: read })
}

const head = { openapi: '3.0.3', info: { title: 'M', version: '1' }, servers: [{ url: 'https://api.test' }] }
const ok = (schema: unknown) => ({ 200: { description: 'ok', content: { 'application/json': { schema } } } })
const model = (doc: IrDocument, name: string): IrType | undefined => doc.models.find((m) => m.name === name)?.type

describe('resolving a reference against its document', () => {
  it.each([
    ['spec/openapi.yaml', 'models/pet.yaml', 'spec/models/pet.yaml'],
    ['spec/paths/pets.yaml', '../models/pet.yaml', 'spec/models/pet.yaml'],
    ['spec/a/b/c.yaml', '../../x.yaml', 'spec/x.yaml'],
    ['/abs/spec.yaml', './m.json', '/abs/m.json'],
    ['https://x.test/api/spec.yaml', 'models/pet.yaml', 'https://x.test/api/models/pet.yaml'],
    ['spec/openapi.yaml', 'https://other.test/m.yaml', 'https://other.test/m.yaml'],
  ])('%s + %s -> %s', (base, rel, want) => {
    expect(resolveDocId(base, rel)).toBe(want)
  })
})

describe('bundling', () => {
  it('hoists a schema in another file into a named model, and reuses it across references', () => {
    const { doc, documents } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: {
          '/pets': { get: { operationId: 'listPets', responses: ok({ type: 'array', items: { $ref: 'models/pet.yaml' } }) } },
          '/pets/{id}': {
            get: {
              operationId: 'getPet',
              parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
              responses: ok({ $ref: './models/pet.yaml' }),
            },
          },
        },
      },
      'spec/models/pet.yaml': { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
    })
    expect(doc.models.map((m) => m.name)).toEqual(['Pet'])
    expect(doc.operations.find((o) => o.id === 'getPet')?.response).toEqual({ kind: 'ref', name: 'Pet' })
    expect(doc.notes.filter((n) => n.code === 'unsupported-ref')).toEqual([])
    expect(documents).toEqual(['spec/openapi.yaml', 'spec/models/pet.yaml'])
  })

  it('closes a CYCLE across files through local references', () => {
    const { doc } = load({
      'spec/openapi.yaml': { ...head, paths: { '/o': { get: { operationId: 'o', responses: ok({ $ref: 'm/owner.yaml' }) } } } },
      'spec/m/owner.yaml': { type: 'object', properties: { pets: { type: 'array', items: { $ref: 'pet.yaml' } } } },
      'spec/m/pet.yaml': { type: 'object', properties: { owner: { $ref: './owner.yaml' } } },
    })
    const pet = model(doc, 'Pet')
    expect(pet?.kind === 'object' && pet.fields[0]?.type).toEqual({ kind: 'ref', name: 'Owner' })
    const owner = model(doc, 'Owner')
    expect(owner?.kind === 'object' && owner.fields[0]?.type).toEqual({ kind: 'array', items: { kind: 'ref', name: 'Pet' } })
  })

  it('a root component that only references a file ADOPTS it under its own name', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: { '/d': { get: { operationId: 'd', responses: ok({ $ref: 'models/droplet.yaml' }) } } },
        components: { schemas: { Droplet: { $ref: 'models/droplet.yaml' } } },
      },
      'spec/models/droplet.yaml': { type: 'object', properties: { id: { type: 'integer' } } },
    })
    expect(doc.models.map((m) => m.name)).toEqual(['Droplet'])
    expect(doc.operations[0]?.response).toEqual({ kind: 'ref', name: 'Droplet' })
  })

  it('names by pointer, then disambiguates by FILE, then by number', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: {
          '/a': { get: { operationId: 'a', responses: ok({ $ref: 'a.yaml#/Problem' }) } },
          '/b': { get: { operationId: 'b', responses: ok({ $ref: 'b.yaml#/Problem' }) } },
          '/c': { get: { operationId: 'c', responses: ok({ $ref: 'c/b.yaml#/Problem' }) } },
        },
      },
      'spec/a.yaml': { Problem: { type: 'string' } },
      'spec/b.yaml': { Problem: { type: 'integer' } },
      'spec/c/b.yaml': { Problem: { type: 'boolean' } },
    })
    expect(doc.models.map((m) => m.name).sort()).toEqual(['BProblem', 'Problem', 'Problem2'])
  })

  it('inlines path items, operations, parameters and responses from other files', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: { '/pets/{id}': { $ref: 'paths/pet.yaml' }, '/ops': { get: { $ref: 'ops/list.yaml' } } },
      },
      'spec/paths/pet.yaml': {
        get: {
          operationId: 'getPet',
          parameters: [{ $ref: '../params.yaml#/id' }],
          responses: { 200: { $ref: '../responses/pet.yaml' }, default: { $ref: '../responses/problem.yaml' } },
        },
      },
      'spec/ops/list.yaml': { operationId: 'listOps', responses: ok({ type: 'string' }) },
      'spec/params.yaml': { id: { name: 'id', in: 'path', required: true, schema: { type: 'integer' } } },
      'spec/responses/pet.yaml': { description: 'ok', content: { 'application/json': { schema: { $ref: '../models/pet.yaml' } } } },
      'spec/responses/problem.yaml': { description: 'e', content: { 'application/json': { schema: { $ref: '../models/problem.yaml' } } } },
      'spec/models/pet.yaml': { type: 'object', properties: { id: { type: 'integer' } } },
      'spec/models/problem.yaml': { type: 'object', required: ['message'], properties: { message: { type: 'string' } } },
    })
    const getPet = doc.operations.find((o) => o.id === 'getPet')
    expect(getPet?.pathParams[0]).toMatchObject({ name: 'id', type: { kind: 'number', integer: true } })
    expect(getPet?.response).toEqual({ kind: 'ref', name: 'Pet' })
    // `responses.default` is a RESPONSE, not the data keyword `default`.
    expect(getPet?.errors).toEqual([{ status: 'default', type: { kind: 'ref', name: 'Problem' } }])
    expect(doc.operations.map((o) => o.id).sort()).toEqual(['getPet', 'listOps'])
  })

  it('rewrites a discriminator mapping that names a file', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: {
          '/p': {
            get: {
              operationId: 'p',
              responses: ok({
                oneOf: [{ $ref: 'cat.yaml' }, { $ref: 'dog.yaml' }],
                discriminator: { propertyName: 'kind', mapping: { cat: 'cat.yaml', dog: 'dog.yaml' } },
              }),
            },
          },
        },
      },
      'spec/cat.yaml': { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['cat'] } } },
      'spec/dog.yaml': { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['dog'] } } },
    })
    expect(doc.operations[0]?.response).toEqual({
      kind: 'union',
      options: [
        { kind: 'ref', name: 'Cat' },
        { kind: 'ref', name: 'Dog' },
      ],
      discriminator: 'kind',
    })
  })

  it('leaves DATA alone: an example payload may contain a `$ref` key', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: { '/x': { get: { operationId: 'x', responses: ok({ $ref: 'x.yaml' }) } } },
      },
      'spec/x.yaml': { type: 'object', properties: { ref: { type: 'string', example: { $ref: 'nowhere.yaml' } } } },
    })
    expect(doc.notes.filter((n) => n.code === 'unsupported-ref')).toEqual([])
  })

  it('reports a file that cannot be read, and an inline self-inclusion, without failing the rest', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: {
          '/missing': { get: { operationId: 'missing', responses: ok({ $ref: 'gone.yaml' }) } },
          '/loop': { $ref: 'loop.yaml' },
          '/fine': { get: { operationId: 'fine', responses: ok({ type: 'string' }) } },
        },
      },
      'spec/loop.yaml': { $ref: 'loop.yaml' },
    })
    const codes = doc.notes.map((n) => n.code)
    expect(codes).toContain('unsupported-ref')
    expect(codes).toContain('cyclic-ref')
    expect(doc.notes.find((n) => n.code === 'unsupported-ref')?.message).toContain('ENOENT')
    expect(doc.operations.find((o) => o.id === 'fine')?.response).toEqual({ kind: 'string' })
  })

  it('does not fetch at generate time: a remote reference names `lathe pull`', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        ...head,
        paths: { '/r': { get: { operationId: 'r', responses: ok({ $ref: 'https://other.test/m.yaml' }) } } },
      },
    })
    expect(doc.notes.find((n) => n.code === 'unsupported-ref')?.message).toContain('lathe pull')
  })

  it('bundles a Swagger 2 document into `definitions` before up-converting it', () => {
    const { doc } = load({
      'spec/openapi.yaml': {
        swagger: '2.0',
        info: { title: 'S', version: '1' },
        host: 'api.test',
        schemes: ['https'],
        paths: { '/p': { get: { operationId: 'p', responses: { 200: { description: 'ok', schema: { $ref: 'pet.json' } } } } } },
      },
      'spec/pet.json': JSON.stringify({ type: 'object', properties: { id: { type: 'integer' } } }),
    })
    expect(doc.models.map((m) => m.name)).toEqual(['Pet'])
    expect(doc.operations[0]?.response).toEqual({ kind: 'ref', name: 'Pet' })
  })

  it('without a location (a bare string), a cross-file reference is reported, not read', () => {
    const doc = loadOpenApi(JSON.stringify({ ...head, paths: { '/x': { get: { operationId: 'x', responses: ok({ $ref: 'm.yaml' }) } } } })).doc
    expect(doc.notes.find((n) => n.code === 'unsupported-ref')?.message).toContain('another document')
  })
})

describe('`lathe generate` over a split spec', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '.generated', 'multi-file')
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }))

  it('resolves references against the spec FILE and reports every document read', async () => {
    const files: Files = {
      'api/openapi.yaml': { ...head, paths: { '/p': { get: { operationId: 'getPet', responses: ok({ $ref: 'models/pet.yaml' }) } } } },
      'api/models/pet.yaml': { type: 'object', properties: { name: { type: 'string' } } },
    }
    const mem: Record<string, string> = Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, stringify(v)]),
    )
    const fs: Fs = {
      read: (p) => {
        const v = mem[p]
        if (v === undefined) throw new Error(`ENOENT ${p}`)
        return v
      },
      write: (p, c) => {
        mem[p] = c
        mkdirSync(dirname(join(ROOT, p)), { recursive: true })
        writeFileSync(join(ROOT, p), c)
      },
      exists: (p) => p in mem,
      mkdirp: () => {},
      remove: (p) => {
        delete mem[p]
      },
      join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
    }
    const r = await run(parseArgv(['generate', 'api/openapi.yaml', '--out', 'gen']), undefined, fs)
    expect(r.code).toBe(0)
    expect(r.documents).toEqual(['api/openapi.yaml', 'api/models/pet.yaml'])
    expect(mem['gen/schemas/Pet.ts']).toContain('Pet')
  })
})
