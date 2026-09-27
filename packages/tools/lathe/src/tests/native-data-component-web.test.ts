// @vitest-environment happy-dom
/**
 * The generated `<Op>Data` components are shared source: PMTC lowers them to
 * a native render-prop view, and the WEB build mounts them as ordinary Pyreon
 * components. A Pyreon component body runs ONCE, so the emitted
 * `return props.children(q.data())` read the query's data at mount — while it
 * was still `undefined` — and never re-rendered: on the web every generated
 * data component stayed at its loading state forever.
 *
 * Mounted for real, through the real runtime and the real query client,
 * against a fetch whose response is released on demand, so the test observes
 * the loading render AND the settled one.
 */
import { h, type VNodeChild } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    '/pets/{id}': {
      get: {
        operationId: 'getPet',
        tags: ['pets'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'ok',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
          },
        },
      },
    },
  },
  components: {
    schemas: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
  },
})

type DataComponent = (props: { id: string; children: (pet: { name: string } | undefined) => VNodeChild }) => VNodeChild

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})
afterAll(() => cleanEmitted('native-data-web'))

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('generated <Op>Data components on the web', () => {
  it('re-render when the query settles, and again when the prop changes', async () => {
    const e = emitToDisk('native-data-web', SPEC, { target: 'multiplatform', plugins: ['schemas', 'client', 'queries'] })
    expect(e.file('pets.native.tsx')).toContain('return () => props.children(q.data())')
    const mod = await e.load<{ GetPetData: DataComponent }>('pets.native.tsx')

    const pending: Array<{ url: string; release: () => void }> = []
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input)
      return new Promise<Response>((resolve) => {
        const name = url.endsWith('/1') ? 'Rex' : 'Fido'
        pending.push({
          url,
          release: () =>
            resolve(new Response(JSON.stringify({ name }), { headers: { 'content-type': 'application/json' } })),
        })
      })
    }) as typeof fetch

    const { signal } = await import('@pyreon/reactivity')
    const id = signal('1')
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(
      h(QueryClientProvider, { client }, () =>
        h(mod.GetPetData, {
          get id() {
            return id()
          },
          children: (pet) => h('p', null, pet ? pet.name : 'loading'),
        }),
      ),
      host,
    )

    await settle()
    expect(host.textContent).toBe('loading')
    expect(pending.map((p) => p.url)).toEqual(['https://api.test/pets/1'])

    pending[0]?.release()
    await settle()
    expect(host.textContent).toBe('Rex')

    id.set('2')
    await settle()
    expect(pending.map((p) => p.url)).toContain('https://api.test/pets/2')
    pending.at(-1)?.release()
    await settle()
    expect(host.textContent).toBe('Fido')

    dispose()
    host.remove()
  })
})
