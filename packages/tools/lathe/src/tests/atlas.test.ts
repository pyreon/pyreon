/**
 * The Atlas integration, which has to line up on THREE sides to work at all.
 *
 * An earlier version emitted scenarios keyed by a native data component and
 * varied RESPONSE fields: names Atlas had no reason to scan, and args that
 * were not props. It produced a plausible-looking file that did nothing --
 * exactly the "generated but never wired" shape, and only running `atlas scan`
 * against a real project surfaced it.
 */
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { previewName, previewOperations } from '../emit/components'
import { loadOpenApi } from '../input/openapi'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
    post:
      operationId: createBook
      tags: [books]
      responses:
        '201':
          content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } }
  /books/{id}:
    get:
      operationId: getBook
      tags: [books]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } }
  /search:
    get:
      operationId: search
      tags: [books]
      parameters: [{ name: q, in: query, required: true, schema: { type: string } }]
      responses:
        '200':
          content: { application/json: { schema: { $ref: '#/components/schemas/Book' } } }
components:
  schemas:
    Book:
      type: object
      required: [id]
      properties: { id: { type: string } }
`

const cfg = resolveConfig({ input: 'x', plugins: ['schemas', 'client', 'queries', 'mocks', 'atlas'] })
const files = generate(SPEC, cfg).files
const file = (path: string): string => {
  const f = files.find((x) => x.path === path)
  if (!f) throw new Error(`no ${path}; got ${files.map((x) => x.path).join(', ')}`)
  return f.contents
}

describe('atlas integration', () => {
  it('previews exactly the operations that can render without invented input', () => {
    // A path parameter or a REQUIRED query parameter would need a real value,
    // and one the generator invents produces a preview that 404s -- worse than
    // no preview, because it looks broken rather than absent.
    const { doc } = loadOpenApi(SPEC)
    expect(previewOperations(doc).map((o) => o.id)).toEqual(['listBooks'])
  })

  it('scenario keys are the component names Atlas will actually discover', () => {
    // The whole integration rests on this: Atlas keys authored scenarios by
    // COMPONENT NAME, so a key naming something it never scans is a silent
    // no-op that reads like a working file.
    const components = file('components.tsx')
    const scenarios = file('atlas.scenarios.ts')
    const { doc } = loadOpenApi(SPEC)
    for (const op of previewOperations(doc)) {
      const name = previewName(op)
      expect(components).toContain(`export function ${name}(`)
      expect(scenarios).toContain(`'${name}'`)
    }
  })

  it('varies a real PROP, not a response field', () => {
    // Atlas infers a control from the props type. Args that are not props
    // produce controls that do nothing.
    expect(file('components.tsx')).toContain('force?: PreviewState')
    const scenarios = file('atlas.scenarios.ts')
    for (const state of ['loading', 'error', 'empty']) {
      expect(scenarios).toContain(`"force":"${state}"`)
    }
  })

  it('emits a wrapper that provides the client the previews need', () => {
    // Atlas names the missing provider precisely when there is none, so this
    // is a step the generator can simply take.
    const wrapper = file('atlas.wrapper.tsx')
    expect(wrapper).toContain('QueryClientProvider')
    expect(wrapper).toContain('installMocks()')
    expect(wrapper).toContain('retry: false')
  })

  it('`atlas` implies `mocks`, because the wrapper needs the routes', () => {
    const only = generate(SPEC, resolveConfig({ input: 'x', plugins: ['client', 'queries', 'atlas'] }))
    expect(only.files.map((f) => f.path)).toContain('mocks.ts')
  })

  it('the client reserves a transport seam the mocks install through', () => {
    // Endpoints bind to the client at declaration time, so middleware cannot
    // be added afterwards -- without the seam a workbench wrapper has no way
    // to serve fixtures and every card shows a network error.
    expect(file('client.ts')).toContain('export function setDevTransport(')
    expect(file('mocks.ts')).toContain('setDevTransport(mockRoutes)')
  })

  it('says so plainly when a spec has nothing previewable', () => {
    const none = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /books/{id}:
    get:
      operationId: getBook
      tags: [books]
      parameters: [{ name: id, in: path, required: true, schema: { type: string } }]
      responses: { '200': { content: { application/json: { schema: { type: string } } } } }
`
    const out = generate(none, cfg)
    const scenarios = out.files.find((f) => f.path === 'atlas.scenarios.ts')?.contents ?? ''
    expect(scenarios).toContain('export const scenarios = {}')
    expect(scenarios).toContain('No previewable operations')
    // And no empty component or wrapper file rides along.
    expect(out.files.map((f) => f.path)).not.toContain('components.tsx')
    expect(out.files.map((f) => f.path)).not.toContain('atlas.wrapper.tsx')
  })
})
