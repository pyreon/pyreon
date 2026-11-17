// The WEB half of the CRUD error parity: every case of `native-error-corpus.ts` through the real `useCreate()` hook (so
// the real `@pyreon/http` client and `createFetcher`'s extraction), asserting the `message` / `errors` the native
// compiler's `native-feature-web-parity.test.ts` asserts of the shipped Swift and Kotlin `messageError`. The corpus is
// the contract both sides are held to; this file proves it IS the web's behaviour.

import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { defineFeature } from '../define-feature'
import { ERROR_API, ERROR_CASES } from './native-error-corpus'

function mountWith<T>(client: QueryClient, fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Capture = () => {
    result = fn()
    return null
  }
  const unmount = mount(
    <QueryClientProvider client={client}>
      <Capture />
    </QueryClientProvider>,
    el,
  )

  return {
    result: result as T,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

describe('CRUD error parity corpus — the web behaviour', () => {
  for (const c of ERROR_CASES) {
    it(c.name, async () => {
      const todo = defineFeature<{ title: string }>({
        name: `err-${c.name}`,
        schema: { title: 'string' } as never,
        api: ERROR_API,
        fetcher: (async () => new Response(c.body, { status: c.status })) as typeof fetch,
      })
      const { result: create, unmount } = mountWith(new QueryClient(), () => todo.useCreate())
      let caught: unknown
      try {
        await create.mutateAsync({ title: 'x' })
      } catch (e) {
        caught = e
      }
      unmount()
      expect(caught).toBeInstanceOf(Error)
      const err = caught as Error & { status?: number; errors?: unknown }
      expect(err.message).toBe(c.message)
      expect(err.status).toBe(c.status)
      if (c.errors === undefined) expect('errors' in err).toBe(false)
      else expect(err.errors).toEqual(JSON.parse(c.errors))
    })
  }

  it('a 204 on create resolves undefined — the no-content success the native lowering mirrors', async () => {
    const todo = defineFeature<{ title: string }>({
      name: 'err-204',
      schema: { title: 'string' } as never,
      api: ERROR_API,
      fetcher: (async () => new Response(null, { status: 204 })) as typeof fetch,
    })
    const { result: create, unmount } = mountWith(new QueryClient(), () => todo.useCreate())
    const value = await create.mutateAsync({ title: 'x' })
    expect(value).toBeUndefined()
    expect(create.isSuccess()).toBe(true)
    expect(create.data()).toBeUndefined()
    unmount()
  })
})
