/**
 * Every generated client must resolve a request to the SAME URL and the SAME
 * cache key, whichever HTTP library is underneath.
 *
 * This is the test that makes the duplicated URL logic in `client-runtime.ts`
 * safe. That duplication exists for a reason (a project that chose axios did
 * so to NOT depend on `@pyreon/http`), but duplication drifts, and drift here
 * is invisible: the generated code compiles, the app renders, and the only
 * symptom is a request going somewhere slightly different than it did before
 * someone changed one word in a config file.
 *
 * So `@pyreon/http`'s own `buildUrl` is the ORACLE and the emitted one is
 * compared against it, rather than against a table of expectations written by
 * the same person who wrote the implementation — a table can only ever confirm
 * that the author agrees with themselves.
 *
 * The matrix is chosen from where these libraries actually disagree:
 *
 *   - a leading-slash path under a based URL (axios and ky RESOLVE, discarding
 *     the base's own path segment; `@pyreon/http` PREFIXES)
 *   - `undefined` / `null` query values (a naive `URLSearchParams` build
 *     serializes the text `"undefined"`)
 *   - array query values (repeat the key, not `a,b`)
 *   - a path parameter containing `/`, `?` or `#` (must not break its segment)
 *
 * The emitted source is EXECUTED, not string-matched: a `toContain` assertion
 * on generated code proves the emitter wrote what the emitter meant to write
 * and nothing about whether it is correct.
 */
import { buildUrl as oracleBuildUrl, type QueryValue } from '@pyreon/http'
import { join } from 'node:path'
import { ADAPTER_CLIENTS, cleanGenerated, writeGenerated } from './helpers/adapter-fixture'

interface ClientModule {
  buildUrl: (
    base: string | undefined,
    path: string,
    params: Record<string, string | number> | undefined,
    query: Record<string, QueryValue> | undefined,
  ) => string
  api: { endpoint: (spec: string, config?: { response?: unknown }) => never }
}

const modules = new Map<string, ClientModule>()

beforeAll(async () => {
  for (const client of ADAPTER_CLIENTS) {
    const dir = writeGenerated(client)
    modules.set(client, (await import(join(dir, 'client.ts'))) as ClientModule)
  }
})

afterAll(() => {
  cleanGenerated()
})

/**
 * Cases where a hand-rolled URL builder, or one of these libraries' defaults,
 * gets it wrong. Each is a real reported bug shape somewhere.
 */
const CASES: {
  name: string
  base: string
  path: string
  params?: Record<string, string | number>
  query?: Record<string, QueryValue>
}[] = [
  { name: 'plain path', base: 'https://api.test/v1', path: '/books' },
  { name: 'base with trailing slash', base: 'https://api.test/v1/', path: '/books' },
  { name: 'path without leading slash', base: 'https://api.test/v1', path: 'books' },
  { name: 'no base at all', base: '', path: '/books' },
  {
    name: 'path parameter',
    base: 'https://api.test/v1',
    path: '/books/:id',
    params: { id: 'abc' },
  },
  {
    name: 'path parameter containing a slash',
    base: 'https://api.test/v1',
    path: '/books/:id',
    params: { id: 'a/b' },
  },
  {
    name: 'path parameter containing a query delimiter',
    base: 'https://api.test/v1',
    path: '/books/:id',
    params: { id: 'a?b#c' },
  },
  {
    // A BOOLEAN path parameter is unsupported on every client — `@pyreon/http`
    // types params as `string | number` and the adapters match it, so the same
    // spec cannot typecheck under one `client` and fail under another.
    name: 'numeric path parameters',
    base: 'https://api.test/v1',
    path: '/books/:id/:page',
    params: { id: 7, page: 2 },
  },
  {
    name: 'query values',
    base: 'https://api.test/v1',
    path: '/books',
    query: { q: 'dune', limit: 10 },
  },
  {
    name: 'nullish query values are DROPPED',
    base: 'https://api.test/v1',
    path: '/books',
    query: { q: 'dune', missing: undefined, empty: null },
  },
  {
    name: 'array query repeats the key',
    base: 'https://api.test/v1',
    path: '/books',
    query: { tag: ['a', 'b'] },
  },
  {
    name: 'array query containing a nullish member',
    base: 'https://api.test/v1',
    path: '/books',
    // `QueryValue` forbids a nullish ARRAY MEMBER, and both implementations
    // skip one anyway. The cast is deliberate: the types cannot stop a value
    // arriving from untyped JS, and this asserts the defensive branch agrees
    // on both sides rather than one dropping it and the other writing "null".
    query: { tag: ['a', null, 'b'] as unknown as QueryValue },
  },
  {
    name: 'query value needing encoding',
    base: 'https://api.test/v1',
    path: '/books',
    query: { q: 'a b&c=d' },
  },
  {
    name: 'path that already carries a query string',
    base: 'https://api.test/v1',
    path: '/books?sort=asc',
    query: { q: 'dune' },
  },
  {
    name: 'absolute path ignores the base',
    base: 'https://api.test/v1',
    path: 'https://other.test/books',
  },
  { name: 'false and zero survive', base: 'https://api.test', path: '/x', query: { a: 0, b: false } },
]

describe('adapter URL parity — @pyreon/http is the oracle', () => {
  for (const client of ADAPTER_CLIENTS) {
    describe(client, () => {
      for (const c of CASES) {
        it(c.name, () => {
          const mod = modules.get(client)
          if (!mod) throw new Error(`no module for ${client}`)
          const expected = oracleBuildUrl(c.base, c.path, c.params, c.query)
          expect(mod.buildUrl(c.base, c.path, c.params, c.query)).toBe(expected)
        })
      }
    })
  }

  it('a missing path parameter THROWS rather than leaving a literal `:id`', () => {
    for (const client of ADAPTER_CLIENTS) {
      const mod = modules.get(client)
      if (!mod) throw new Error(`no module for ${client}`)
      // A silently-malformed request is far harder to diagnose than a throw,
      // and `@pyreon/http` throws here too.
      expect(() => mod.buildUrl('https://api.test', '/books/:id', undefined, undefined)).toThrow(
        /needs the parameter "id"/,
      )
    }
  })
})

describe('adapter cache keys are identical to @pyreon/http', () => {
  it('the same endpoint produces the same key shape on every client', async () => {
    // A different key shape would make the generated `keys.ts` — which is
    // emitted IDENTICALLY for every client — match nothing, so an
    // invalidateQueries after a mutation would silently refresh no query.
    const { createHttp } = (await import('@pyreon/http')) as typeof import('@pyreon/http')
    const oracleApi = createHttp({ baseUrl: 'https://api.test' })
    const oracle = oracleApi.endpoint('GET /books/:id')

    for (const client of ADAPTER_CLIENTS) {
      const mod = modules.get(client)
      if (!mod) throw new Error(`no module for ${client}`)
      const ep = mod.api.endpoint('GET /books/:id') as unknown as {
        method: string
        path: string
        key: ((args?: unknown) => unknown) & { prefix: unknown }
        query: (args?: unknown) => { queryKey: unknown }
      }
      expect(ep.method, client).toBe(oracle.method)
      expect(ep.path, client).toBe(oracle.path)
      expect(ep.key.prefix, client).toEqual(oracle.key.prefix)
      expect(ep.key({ params: { id: '1' } }), client).toEqual(oracle.key({ params: { id: '1' } }))
      expect(ep.query({ params: { id: '1' } }).queryKey, client).toEqual(
        oracle.query({ params: { id: '1' } }).queryKey,
      )
    }
  })
})
