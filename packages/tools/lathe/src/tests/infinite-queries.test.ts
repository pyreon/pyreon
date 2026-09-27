/**
 * Infinite queries from an EXPLICIT declaration (audit E3) — config entry or
 * `x-pyreon-pagination`, checked against the spec's types, emitting a typed
 * `<op>InfiniteOptions` factory and `use<Op>Infinite` hook.
 */
import type { HttpMiddleware } from '@pyreon/http'
import { InfiniteQueryObserver, QueryClient } from '@pyreon/query'
import { resolveConfig } from '../core/config'
import { checkPagination } from '../emit/pagination'
import { generate } from '../core/generate'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { typecheckSpec } from './helpers/typecheck'

const ok = (schema: object) => ({ '200': { description: 'x', content: { 'application/json': { schema } } } })
const Customer = { $ref: '#/components/schemas/Customer' }
const q = (name: string, type: string, required = false) => ({ name, in: 'query', required, schema: { type } })
const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://api.test' }],
  paths: {
    // Stripe: the next page starts after the last item's id.
    '/customers': {
      get: {
        operationId: 'listCustomers',
        parameters: [q('starting_after', 'string'), q('limit', 'integer')],
        responses: ok({ type: 'object', required: ['data', 'has_more'], properties: { data: { type: 'array', items: Customer }, has_more: { type: 'boolean' } } }),
      },
    },
    // A cursor, declared in the SPEC.
    '/events': {
      get: {
        operationId: 'listEvents',
        'x-pyreon-pagination': { kind: 'cursor', param: 'cursor', next: 'meta.next_cursor' },
        parameters: [q('cursor', 'string')],
        responses: ok({ type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'string' } }, meta: { type: 'object', properties: { next_cursor: { type: 'string', nullable: true } } } } }),
      },
    },
    '/rows': { get: { operationId: 'listRows', parameters: [q('offset', 'integer')], responses: ok({ type: 'array', items: { type: 'string' } }) } },
    '/pages': { get: { operationId: 'listPages', parameters: [q('page', 'integer')], responses: ok({ type: 'object', properties: { results: { type: 'array', items: { type: 'string' } } } }) } },
    // A WRONG spec declaration is noted and ignored, never emitted.
    '/bad': { get: { operationId: 'listBad', 'x-pyreon-pagination': { kind: 'cursor', param: 'nope', next: 'x' }, responses: ok({ type: 'string' }) } },
  },
  components: { schemas: { Customer: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
})

const PAGINATION = {
  listCustomers: { kind: 'lastItem', param: 'starting_after', items: 'data', field: 'id', hasMore: 'has_more' },
  listRows: { kind: 'offset', param: 'offset' },
  listPages: { kind: 'page', param: 'page', items: 'results' },
} as const

afterAll(() => cleanEmitted('e3'))

describe('pagination declarations are checked', () => {
  const run = (pagination: Record<string, unknown>) =>
    generate(SPEC, resolveConfig({ input: 'x', plugins: ['schemas', 'client', 'queries'], pagination: pagination as never }))

  it('an invalid spec extension is noted and emits nothing', () => {
    const r = run({})
    expect(r.doc.notes.find((n) => n.code === 'invalid-pagination')?.message).toMatch(/`nope` is not a query parameter/)
    expect(r.files.filter((f) => f.path.startsWith('queries/')).map((f) => f.contents).join('\n')).not.toContain('useListBadInfinite')
  })

  it('an invalid CONFIG entry fails the run with the reason', () => {
    expect(() => run({ nope: { kind: 'page', param: 'page' } })).toThrow(/names no operation/)
    expect(() => run({ listRows: { kind: 'sideways', param: 'offset' } })).toThrow(/must be one of/)
    expect(() => run({ listCustomers: { kind: 'cursor', param: 'starting_after', next: 'has_more' } })).toThrow(/is boolean, but `starting_after` takes a string/)
    expect(() => run({ listCustomers: { kind: 'lastItem', param: 'limit', items: 'data', field: 'id' } })).toThrow(/is string, but `limit` takes a number/)
    expect(() => run({ listPages: { kind: 'page', param: 'page', items: 'nope' } })).toThrow(/does not exist in the response/)
    expect(() => run({ listPages: { kind: 'page', param: 'page', items: 'results', hasMore: 'results' } })).toThrow(/must be a boolean/)
  })
})

describe('emitted infinite queries', () => {
  it('typecheck — typed pages and page params, for a consumer', () => {
    const consumer = `
import { useListCustomersInfinite, useListEventsInfinite, useListRowsInfinite, listPagesInfiniteOptions } from './queries'
export function use() {
  const c = useListCustomersInfinite(() => ({ query: { limit: 10 } }))
  const firstId: string | undefined = c.data()?.pages[0]?.data[0]?.id
  void firstId
  const e = useListEventsInfinite(() => ({}), () => ({ staleTime: 1000 }))
  void e.fetchNextPage()
  const r = useListRowsInfinite(() => undefined)
  const n: number | undefined = r.data()?.pageParams.length
  void n
  const o = listPagesInfiniteOptions({})
  const start: number = o.initialPageParam
  void start
  // @ts-expect-error — options are typed
  useListEventsInfinite(() => ({}), () => ({ staleTimeTypo: 1 }))
}
`
    const { errors } = typecheckSpec('e3', SPEC, { plugins: ['schemas', 'client', 'queries'], pagination: PAGINATION }, { extra: { 'consumer.ts': consumer } })
    expect(errors, errors.join('\n')).toEqual([])
  })

  it('pages through the generated mocks, with the next param taken from the page', async () => {
    const e = emitToDisk('e3', SPEC, { plugins: ['schemas', 'client', 'queries', 'mocks'], pagination: PAGINATION })
    const client = await e.load<{ setDevTransport(m: HttpMiddleware | null): void }>('client.ts')
    const mocks = await e.load<{
      installMocks(): void
      resetMocks(): void
      mockOperation(id: string, o: Record<string, unknown>): () => void
      mockCalls: { url: string }[]
    }>('mocks.ts')
    type Opts = ConstructorParameters<typeof InfiniteQueryObserver>[1]
    const queries = await e.load<Record<string, (a: unknown) => Opts>>('queries/index.ts')
    const options = (name: string, a: unknown): Opts => {
      const fn = queries[name]
      if (!fn) throw new Error(`no ${name}`)
      return fn(a)
    }
    const start = async (o: { refetch(): Promise<unknown>; getCurrentResult(): { hasNextPage: boolean } }): Promise<boolean> => {
      await o.refetch()
      return o.getCurrentResult().hasNextPage
    }
    mocks.installMocks()
    const qc = new QueryClient()
    try {
      mocks.mockOperation('listCustomers', { json: { data: [{ id: 'c1' }, { id: 'c2' }], has_more: true } })
      const observer = new InfiniteQueryObserver(qc, options('listCustomersInfiniteOptions', { query: { limit: 2 } }))
      expect(await start(observer)).toBe(true)
      mocks.mockOperation('listCustomers', { json: { data: [{ id: 'c3' }], has_more: false } })
      const second = await observer.fetchNextPage()
      const pagesSeen = (second.data as { pages: { data: { id: string }[] }[] } | undefined)?.pages ?? []
      expect(pagesSeen.map((p) => p.data.map((c) => c.id))).toEqual([['c1', 'c2'], ['c3']])
      expect(second.hasNextPage).toBe(false)
      expect(mocks.mockCalls.at(-1)?.url).toBe('/customers?limit=2&starting_after=c2')

      mocks.mockOperation('listEvents', { json: { items: ['a'], meta: { next_cursor: 'k2' } } })
      const events = new InfiniteQueryObserver(qc, options('listEventsInfiniteOptions', {}))
      expect(await start(events)).toBe(true)
      mocks.mockOperation('listEvents', { json: { items: ['b'], meta: { next_cursor: null } } })
      expect((await events.fetchNextPage()).hasNextPage).toBe(false)
      expect(mocks.mockCalls.at(-1)?.url).toBe('/events?cursor=k2')

      mocks.mockOperation('listRows', { json: ['r1', 'r2', 'r3'] })
      const rows = new InfiniteQueryObserver(qc, options('listRowsInfiniteOptions', {}))
      await start(rows)
      mocks.mockOperation('listRows', { json: [] })
      expect((await rows.fetchNextPage()).hasNextPage).toBe(false)
      expect(mocks.mockCalls.at(-1)?.url).toBe('/rows?offset=3')

      mocks.mockOperation('listPages', { json: { results: ['p'] } })
      const pages = new InfiniteQueryObserver(qc, options('listPagesInfiniteOptions', {}))
      await start(pages)
      await pages.fetchNextPage()
      expect(mocks.mockCalls.at(-1)?.url).toBe('/pages?page=2')
    } finally {
      mocks.resetMocks()
      client.setDevTransport(null)
      qc.clear()
    }
  })
})

describe('checkPagination edge cases', () => {
  const base = { id: 'op', method: 'GET' as const, path: '/x', tag: 't', pathParams: [], headerParams: [], cookieParams: [] }
  const qp = (name: string, kind: 'string' | 'boolean' | 'number') => ({
    name,
    required: false,
    type: kind === 'number' ? ({ kind: 'number', integer: true } as const) : ({ kind } as const),
  })
  const arr = { kind: 'array', items: { kind: 'string' } } as const
  const check = (pagination: unknown, queryParams: ReturnType<typeof qp>[], response?: unknown) =>
    checkPagination({ ...base, queryParams, pagination: pagination as never, response: response as never }, new Map())

  it('names each problem', () => {
    expect(check({ kind: 'cursor', param: 'c', next: '' }, [qp('c', 'string')])).toMatch(/no JSON response/)
    expect(check({ kind: 'cursor', param: 'c', next: '' }, [qp('c', 'boolean')], { kind: 'boolean' })).toMatch(/must be a string or a number/)
    expect(check({ kind: 'lastItem', param: 'c', items: '', field: 'id' }, [qp('c', 'boolean')], arr)).toMatch(/must be a string or a number/)
    expect(check({ kind: 'lastItem', param: 'c', items: '', field: 'id' }, [qp('c', 'string')], { kind: 'string' })).toMatch(/must be an array/)
    expect(check({ kind: 'lastItem', param: 'c', items: '', field: 'id' }, [qp('c', 'string')], arr)).toMatch(/no field `id`/)
    expect(check({ kind: 'offset', param: 'c', items: '' }, [qp('c', 'string')], arr)).toMatch(/must be a number/)
    expect(check({ kind: 'offset', param: 'c', items: '' }, [qp('c', 'number')], { kind: 'string' })).toMatch(/must be an array/)
    expect(check({ kind: 'cursor', param: 'c', next: 'a.b' }, [qp('c', 'string')], arr)).toMatch(/inside a array/)
    expect(check({ kind: 'offset', param: 'c', items: '' }, [qp('c', 'number')], arr)).toBeUndefined()
  })

  it('refuses a non-GET and a name clash', () => {
    const spec = JSON.parse(SPEC)
    spec.paths['/customers'].post = { operationId: 'addCustomer', 'x-pyreon-pagination': { kind: 'page', param: 'p' }, responses: ok({ type: 'string' }) }
    spec.paths['/clash'] = { get: { operationId: 'listRowsInfinite', responses: ok({ type: 'string' }) } }
    const gen = (pagination: object) =>
      generate(JSON.stringify(spec), resolveConfig({ input: 'x', pagination: pagination as never }))
    expect(() => gen({ listRows: { kind: 'offset', param: 'offset' } })).toThrow(/collide with the operation `listRowsInfinite`/)
    expect(gen({}).doc.notes.map((n) => n.message).join('\n')).toMatch(/`addCustomer`: only a GET can be paged/)
  })
})
