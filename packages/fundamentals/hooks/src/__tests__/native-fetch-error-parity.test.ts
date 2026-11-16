// The WEB half of the `useFetch(url)` error parity corpus (`native-fetch-error-corpus.ts`): each case through the real
// hook, asserting the message the native compiler's `native-query-web-parity.test.ts` asserts of the shipped Swift /
// Kotlin `fetchError`.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { FETCH_ERROR_CASES } from './native-fetch-error-corpus'
import { useFetch } from '../useFetch'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('useFetch error parity corpus — the web behaviour', () => {
  for (const c of FETCH_ERROR_CASES) {
    it(`${c.url} → ${c.status}`, async () => {
      globalThis.fetch = vi.fn(async () => new Response('{"message":"not read"}', { status: c.status }))
      const r = useFetch<unknown>(c.url)
      await settle()
      expect(r.isPending()).toBe(false)
      expect(r.data()).toBeUndefined()
      expect(r.error()).toBeInstanceOf(Error)
      expect((r.error() as Error).message).toBe(c.message)
    })
  }
})
