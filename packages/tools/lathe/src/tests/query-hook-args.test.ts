// @vitest-environment happy-dom
/**
 * Every generated read hook takes the same args accessor, and its key can be
 * extended (#4841).
 *
 * The hook for an operation WITHOUT parameters used to take only query options
 * (`useListThings(options?)`), built from `listThings.query()` with no
 * arguments: a middleware's `meta`, per-call `headers` and `timeout` never
 * reached the request, and `useListThings(() => ({ meta, headers }))` still
 * compiled, `meta` landing in TanStack's query meta. And the options omitted
 * `queryKey` with no replacement, so a key could not carry the tenant or locale
 * a header changes the result by.
 *
 * Mounted for real, through the real runtime, the real query client and the
 * generated `@pyreon/http` client.
 */
import { h } from '@pyreon/core'
import type { HttpMiddleware } from '@pyreon/http'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { cleanTypecheck, TYPECHECK_BUDGET, typecheckSpec } from './helpers/typecheck'

const json = (schema: unknown) => ({ description: 'ok', content: { 'application/json': { schema } } })
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Things', version: '1' },
  servers: [{ url: 'https://things.test' }],
  paths: {
    '/things': {
      get: { operationId: 'listThings', tags: ['things'], responses: { 200: json({ type: 'array', items: { $ref: '#/components/schemas/Thing' } }) } },
    },
    '/things/{id}': {
      get: {
        operationId: 'getThing',
        tags: ['things'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json({ $ref: '#/components/schemas/Thing' }) },
      },
    },
  },
  components: { schemas: { Thing: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
})

const PLUGINS = { plugins: ['schemas', 'client', 'queries'] } as const
afterAll(() => {
  cleanEmitted('query-hook-args')
  cleanTypecheck('query-hook-args')
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

type Hook = (args?: () => unknown, options?: () => Record<string, unknown>) => { data: () => unknown }

describe('a parameterless read hook', () => {
  it('sends the meta and headers its args accessor returns, and caches under the extended key', async () => {
    const e = emitToDisk('query-hook-args', SPEC, PLUGINS)
    const client = await e.load<{ configureApi(c: { use?: HttpMiddleware[] }): void; setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
    const queries = await e.load<{ useListThings: Hook; useGetThing: Hook }>('queries/index.ts')
    const seen: { meta: unknown; tenant: string | null }[] = []
    client.configureApi({
      use: [
        (req, next) => {
          seen.push({ meta: req.meta?.tenant, tenant: new Headers(req.headers).get('x-tenant') })
          return next(req)
        },
      ],
    })
    client.setDevTransport((req) =>
      Promise.resolve({
        raw: new Response('[]', { headers: { 'content-type': 'application/json' } }),
        status: 200,
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        request: req,
      }),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const Probe = () => {
      queries.useListThings(
        () => ({ meta: { tenant: 'a' }, headers: { 'x-tenant': 'a' } }),
        () => ({ key: (base: readonly unknown[]) => [...base, { tenant: 'a' }] }),
      )
      // Returning `undefined` holds the request, as on a hook with parameters.
      queries.useListThings(() => undefined)
      return null
    }
    const dispose = mount(h(QueryClientProvider, { client: qc }, () => h(Probe, null)), host)
    try {
      await settle()
      expect(seen).toEqual([{ meta: 'a', tenant: 'a' }])
      const keys = qc.getQueryCache().getAll().map((q) => q.queryKey)
      expect(keys).toContainEqual(['https://things.test', 'GET', '/things', { tenant: 'a' }])
    } finally {
      dispose()
      host.remove()
      client.configureApi({ use: [] })
      client.setDevTransport(null)
    }
  })
})

describe('the hook types', () => {
  it('accept request options on a parameterless hook and refuse query options in their place', TYPECHECK_BUDGET, () => {
    const consumer = `
import { useGetThing, useListThings } from './queries/things'
const call = { meta: { tenant: 'a' }, headers: { 'x-tenant': 'a' }, timeout: 5_000 }
useListThings(() => ({ ...call }))
useListThings()
useListThings(undefined, () => ({ staleTime: 1, key: (base) => [...base, { tenant: 'a' }] }))
useGetThing(() => ({ params: { id: '1' }, ...call }), () => ({ key: (base) => [...base, 'a'] }))
// @ts-expect-error -- query options are the SECOND argument, not the first
useListThings(() => ({ staleTime: 1 }))
// @ts-expect-error -- the key is extended through \`key\`; \`queryKey\` stays the endpoint's
useGetThing(() => ({ params: { id: '1' } }), () => ({ queryKey: ['x'] }))
`
    const { errors } = typecheckSpec('query-hook-args', SPEC, PLUGINS, { extra: { 'consumer.ts': consumer } })
    expect(errors).toEqual([])
  })
})
