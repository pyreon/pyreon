/**
 * Spec constructs the reader used to leave behind: `$ref`'d examples, `$ref`'d
 * path items, `trace`, a `default`-only response, and duplicate JSON keys.
 */
import { stringify } from 'yaml'
import type { IrDocument, IrOperation } from '../core/ir'
import { duplicateJsonKeys } from '../input/json-keys'
import { loadOpenApi } from '../input/openapi'

const head = { openapi: '3.1.0', info: { title: 'T', version: '1' }, servers: [{ url: 'https://t.test' }] }
const load = (spec: Record<string, unknown>): IrDocument => loadOpenApi(JSON.stringify({ ...head, ...spec })).doc
const op = (doc: IrDocument, id: string): IrOperation => {
  const found = doc.operations.find((o) => o.id === id)
  if (!found) throw new Error(`no operation ${id}`)
  return found
}
const json = (schema: unknown, extra: Record<string, unknown> = {}) => ({ 'application/json': { schema, ...extra } })

describe('`$ref`s inside an `examples` map', () => {
  const spec = (examples: Record<string, unknown>, components: Record<string, unknown> = {}) => ({
    paths: {
      '/pets': {
        post: {
          operationId: 'addPet',
          parameters: [{ name: 'q', in: 'query', schema: { type: 'string' }, examples: { a: { $ref: '#/components/examples/Q' } } }],
          requestBody: { content: json({ type: 'object', properties: { name: { type: 'string' } } }, { examples }) },
          responses: { 204: { description: 'ok' } },
        },
      },
    },
    components: { examples: { Q: { value: 'tabby' }, ...components } },
  })

  it('a request body example referenced from components is resolved to its value', () => {
    const doc = load(spec({ first: { $ref: '#/components/examples/Rex' } }, { Rex: { value: { name: 'Rex' } } }))
    expect(op(doc, 'addPet').body?.example).toEqual({ name: 'Rex' })
  })

  it('a parameter example referenced from components is resolved too', () => {
    const doc = load(spec({}))
    expect(op(doc, 'addPet').queryParams[0]?.example).toBe('tabby')
  })

  it('follows a chain of references', () => {
    const doc = load(spec({ first: { $ref: '#/components/examples/A' } }, { A: { $ref: '#/components/examples/B' }, B: { value: { name: 'B' } } }))
    expect(op(doc, 'addPet').body?.example).toEqual({ name: 'B' })
  })

  it('reports a reference cycle instead of looping, and falls through to the next entry', () => {
    const doc = load(
      spec(
        { loop: { $ref: '#/components/examples/A' }, ok: { value: { name: 'ok' } } },
        { A: { $ref: '#/components/examples/B' }, B: { $ref: '#/components/examples/A' } },
      ),
    )
    expect(op(doc, 'addPet').body?.example).toEqual({ name: 'ok' })
    expect(doc.notes.some((n) => n.code === 'unsupported-ref' && n.message.includes('cycle'))).toBe(true)
  })

  it('an example in ANOTHER file is inlined by the bundler, while a `$ref` key INSIDE a value stays data', () => {
    const files: Record<string, unknown> = {
      'spec/openapi.yaml': {
        ...head,
        paths: {
          '/pets': {
            post: {
              operationId: 'addPet',
              requestBody: { content: json({ type: 'object' }, { examples: { a: { $ref: 'examples/rex.yaml' } } }) },
              responses: { 204: { description: 'ok' } },
            },
          },
        },
      },
      // A payload may legitimately carry a `$ref` KEY (JSON Schema documents, for one).
      'spec/examples/rex.yaml': { summary: 'Rex', value: { name: 'Rex', link: { $ref: 'not/a/file.yaml' } } },
    }
    const read = (id: string): string => {
      const f = files[id]
      if (f === undefined) throw new Error(`ENOENT ${id}`)
      return stringify(f)
    }
    const { doc } = loadOpenApi(read('spec/openapi.yaml'), { location: 'spec/openapi.yaml', readDocument: read })
    expect(op(doc, 'addPet').body?.example).toEqual({ name: 'Rex', link: { $ref: 'not/a/file.yaml' } })
    expect(doc.notes.filter((n) => n.code === 'unsupported-ref')).toEqual([])
  })
})

describe('path items by `$ref`', () => {
  it('a path whose item is a `$ref` generates its operations, with local siblings winning', () => {
    const doc = load({
      paths: {
        '/a': { $ref: '#/components/pathItems/Shared' },
        '/b': { $ref: '#/components/pathItems/Shared', summary: 'local' },
      },
      components: {
        pathItems: {
          Shared: {
            summary: 'shared',
            get: { operationId: 'listShared', responses: { 200: { content: json({ type: 'string' }) } } },
          },
        },
      },
    })
    // One operation id declared twice is disambiguated, not dropped.
    expect(doc.operations.map((o) => o.path).sort()).toEqual(['/a', '/b'])
    expect(doc.operations.every((o) => o.response?.kind === 'string')).toBe(true)
  })

  it('an unresolvable path item is reported once, not per pass', () => {
    const doc = load({ paths: { '/a': { $ref: '#/components/pathItems/Nope' } } })
    expect(doc.operations).toEqual([])
    expect(doc.notes.filter((n) => n.code === 'unsupported-ref')).toHaveLength(1)
  })

  it('a webhook whose path item is a `$ref` is followed', () => {
    const doc = load({
      webhooks: { ping: { $ref: '#/components/pathItems/Ping' } },
      components: { pathItems: { Ping: { post: { requestBody: { content: json({ type: 'string' }) } } } } },
    })
    expect(doc.webhooks?.map((w) => [w.name, w.payload])).toEqual([['ping', { kind: 'string' }]])
  })
})

describe('`trace`', () => {
  it('is reported with the reason, and no call is generated', () => {
    const doc = load({
      paths: {
        '/x': {
          get: { operationId: 'getX', responses: {} },
          trace: { operationId: 'traceX', responses: {} },
        },
      },
    })
    expect(doc.operations.map((o) => o.id)).toEqual(['getX'])
    const note = doc.notes.find((n) => n.code === 'unsupported-method')
    expect(note?.at).toBe('#/paths/~1x/trace')
    expect(note?.message).toContain('Fetch standard')
  })
})

describe('duplicate JSON keys', () => {
  it('names each duplicated key by pointer, once, including inside arrays', () => {
    const text = '{"a":1,"b":{"c":1,"c":2,"c":3},"list":[{"x":1},{"x":1,"x":2}],"a~/":0,"a~/":1,"a":2}'
    expect(duplicateJsonKeys(text)).toEqual([
      { at: '#/b/c', key: 'c' },
      { at: '#/list/1/x', key: 'x' },
      { at: '#/a~0~1', key: 'a~/' },
      { at: '#/a', key: 'a' },
    ])
  })

  it('reads escaped keys and strings containing structure characters', () => {
    expect(duplicateJsonKeys('{"k\\"}":"{[,:]}","k\\u0022}":1}')).toEqual([{ at: '#/k"}', key: 'k"}' }])
    expect(duplicateJsonKeys('{"a":"x","b":["a","a"],"c":{"a":1}}')).toEqual([])
  })

  it('reaches the report as a `duplicate-key` note, and the last value still wins as JSON says', () => {
    const text = `{"openapi":"3.1.0","info":{"title":"T","version":"1"},"paths":{},"components":{"schemas":{"Pet":{"type":"string"},"Pet":{"type":"number"}}}}`
    const { doc } = loadOpenApi(text)
    expect(doc.notes.filter((n) => n.code === 'duplicate-key').map((n) => n.at)).toEqual(['#/components/schemas/Pet'])
    expect(doc.models.find((m) => m.name === 'Pet')?.type.kind).toBe('number')
  })

  it('points into the document it came from, for a referenced file', () => {
    const files: Record<string, string> = {
      'spec/openapi.json': JSON.stringify({ ...head, paths: {}, components: { schemas: { Pet: { $ref: 'pet.json' } } } }),
      'spec/pet.json': '{"type":"object","type":"string"}',
    }
    const { doc } = loadOpenApi(files['spec/openapi.json'] as string, {
      location: 'spec/openapi.json',
      readDocument: (id) => files[id] as string,
    })
    expect(doc.notes.filter((n) => n.code === 'duplicate-key').map((n) => n.at)).toEqual(['spec/pet.json#/type'])
  })

  it('a YAML spec is not scanned (the YAML reader refuses duplicates itself)', () => {
    expect(() => loadOpenApi('openapi: 3.1.0\ninfo: { title: T, version: "1" }\npaths: {}\npaths: {}\n')).toThrow(/YAML parse error on line 4/)
  })
})

describe('Swagger 2 `tsv` reaches the generated call', () => {
  it('the endpoint declares `tabDelimited`, which `@pyreon/http` serializes with a tab', async () => {
    const { generate } = await import('../core/generate')
    const { resolveConfig } = await import('../core/config')
    const swagger = JSON.stringify({
      swagger: '2.0',
      info: { title: 'S', version: '1' },
      host: 'api.test',
      schemes: ['https'],
      paths: {
        '/x': {
          get: {
            operationId: 'listX',
            parameters: [{ in: 'query', name: 'ids', type: 'array', items: { type: 'string' }, collectionFormat: 'tsv' }],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    })
    const { files } = generate(swagger, resolveConfig({ input: 'spec.json', plugins: ['schemas', 'client'] }))
    const endpoints = files.filter((f) => f.path.startsWith('endpoints/')).map((f) => f.contents).join('\n')
    expect(endpoints).toContain(`ids: { style: 'tabDelimited', explode: false }`)
    const { buildQuery } = await import('@pyreon/http')
    expect(decodeURIComponent(buildQuery({ ids: ['a', 'b'] }, { ids: { style: 'tabDelimited', explode: false } }))).toBe('?ids=a\tb')
  })
})
