// @vitest-environment happy-dom
/**
 * The generated `<Op>Mutation` components (#4835) are shared source: PMTC
 * lowers them to `PyreonMutation`, and the WEB build mounts them as ordinary
 * Pyreon components. Mounted for real here: `mutate` sends the request with the
 * props as they are when it is CALLED, and `children` re-renders with the
 * pending state and the response.
 */
import { h, type VNodeChild } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Notes', version: '1' },
  servers: [{ url: 'https://notes.test/v1' }],
  paths: {
    '/notes/{id}': {
      put: {
        operationId: 'renameNote',
        tags: ['notes'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NoteInput' } } } },
        responses: { 200: { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Note: { type: 'object', required: ['id', 'title'], properties: { id: { type: 'string' }, title: { type: 'string' } } },
      NoteInput: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
    },
  },
})

type Note = { id: string; title: string }

type MutationComponent = (props: {
  id: string
  json: { title: string }
  children: (mutate: () => void, data: Note | undefined, isPending: boolean, error: Error | null) => VNodeChild
}) => VNodeChild

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

afterAll(() => cleanEmitted('native-mutation-web'))

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

describe('generated <Op>Mutation components on the web', () => {
  it('send the props current at the call, and re-render with pending and the response', async () => {
    const e = emitToDisk('native-mutation-web', SPEC, { target: 'multiplatform', plugins: ['schemas', 'client', 'queries'] })
    const mod = await e.load<{ RenameNoteMutation: MutationComponent }>('notes.native.tsx')

    const sent: { method: string; url: string; body: string }[] = []
    let release: (() => void) | undefined
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(String(input), init)
      const body = await req.text()
      sent.push({ method: req.method, url: req.url, body })

      return new Promise<Response>((resolve) => {
        release = () =>
          resolve(new Response(JSON.stringify({ id: 'n1', ...JSON.parse(body) }), { headers: { 'content-type': 'application/json' } }))
      })
    }) as typeof fetch

    const title = signal('draft')
    let trigger: (() => void) | undefined
    const client = new QueryClient()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(
      h(QueryClientProvider, { client }, () =>
        h(mod.RenameNoteMutation, {
          id: 'n1',
          get json() {
            return { title: title() }
          },
          children: (mutate, data, isPending) => {
            trigger = mutate
            return h('p', null, isPending ? 'saving' : (data?.title ?? 'idle'))
          },
        }),
      ),
      host,
    )
    try {
      expect(host.textContent).toBe('idle')
      title.set('final')
      trigger?.()
      await settle()
      expect(sent).toEqual([{ method: 'PUT', url: 'https://notes.test/v1/notes/n1', body: '{"title":"final"}' }])
      expect(host.textContent).toBe('saving')
      release?.()
      await settle()
      expect(host.textContent).toBe('final')
    } finally {
      dispose()
      host.remove()
    }
  })
})
