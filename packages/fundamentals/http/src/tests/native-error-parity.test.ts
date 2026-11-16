// The WEB half of the request-error parity corpus (`native-error-corpus.ts`): every case through the real `@pyreon/http`
// client — an awaited endpoint call, and `useQuery(() => ep.query(…))` on a real TanStack client — asserting what the
// native compiler's `native-query-web-parity.test.ts` asserts of the shipped Swift / Kotlin runtimes and of the emit.
//
// Written with `h()` rather than JSX so the package keeps the non-JSX `@pyreon/tsconfig/lib.json` preset.

import { h } from '@pyreon/core'
import { QueryClient, QueryClientProvider, useQuery, type UseQueryResult } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'
import { createHttp } from '../client'
import { HttpError } from '../errors'
import { createMock } from '../mock'
import { HTTP_ERROR_CASES, UNDEFINED_DATA_CASES } from './native-error-corpus'

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe('request-error parity corpus — the web behaviour', () => {
  for (const c of HTTP_ERROR_CASES) {
    it(`HttpError: ${c.name}`, async () => {
      const mock = createMock([{ method: c.spec.split(' ')[0] as 'GET', path: /.*/, status: c.status, body: '{"message":"not read"}' }])
      const api = createHttp({ baseUrl: c.baseUrl, use: [mock.middleware] })
      const ep = api.endpoint(c.spec as 'GET /x')
      let caught: unknown
      try {
        await (ep as unknown as (a: unknown) => Promise<unknown>)(c.args ?? {})
      } catch (e) {
        caught = e
      }
      expect(caught).toBeInstanceOf(HttpError)
      const err = caught as HttpError
      expect(err.message).toBe(c.message)
      expect(err.name).toBe(c.errorName)
      expect(err.status).toBe(c.status)
      // The URL the native layer names is the request as sent.
      expect(err.request?.url).toBe(c.sentUrl)
    })
  }

  it('a 204 / empty body resolves undefined from an awaited call (the native mutation succeeds with no data)', async () => {
    for (const route of [{ status: 204 }, { status: 205 }, { status: 200, body: '' }]) {
      const mock = createMock([{ method: 'POST', path: /.*/, ...route }])
      const api = createHttp({ baseUrl: 'https://api.example.com', use: [mock.middleware] })
      const ep = api.endpoint('POST /users')
      await expect(ep({ json: { a: 1 } })).resolves.toBeUndefined()
    }
  })

  for (const c of UNDEFINED_DATA_CASES) {
    it(`a 204 fails the query as TanStack does: ${c.name}`, async () => {
      const mock = createMock([{ path: /.*/, status: 204 }])
      const api = createHttp({
        baseUrl: 'https://api.example.com',
        use: [mock.middleware],
        ...(c.clientKeyScope !== undefined ? { keyScope: c.clientKeyScope } : {}),
      })
      const ep = api.endpoint(c.spec as 'GET /x', c.endpointKeyScope !== undefined ? { keyScope: c.endpointKeyScope } : {})
      const args = c.args === undefined ? undefined : (new Function('props', `return (${c.args})`)(c.props) as unknown)
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      let q: UseQueryResult<unknown, Error> | undefined
      const el = document.createElement('div')
      document.body.appendChild(el)
      const unmount = mount(
        h(QueryClientProvider, { client }, () => {
          q = useQuery(() => (ep as unknown as { query(a: unknown): never }).query(args))
          return null
        }),
        el,
      )
      const original = console.error
      console.error = () => {}
      try {
        for (let i = 0; i < 20 && q?.error() == null; i++) await tick()
      } finally {
        console.error = original
      }
      expect(q?.error()?.message).toBe(c.message)
      expect(q?.data()).toBeUndefined()
      unmount()
      el.remove()
    })
  }
})
