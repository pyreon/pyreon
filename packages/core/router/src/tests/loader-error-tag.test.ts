/**
 * In development, `router.preload` tags a loader's error with the path of the
 * route whose loader threw, under `Symbol.for('pyreon.router.loaderErrorRoute')`,
 * and rethrows the SAME error. Zero's dev error overlay reads the tag to say
 * "Loader threw" on that route instead of "Server render failed".
 */
import { LOADER_ERROR_ROUTE, markLoaderError } from '../loader-error'
import { notFound } from '../not-found'
import { createRouter } from '../router'
import type { RouteRecord, RouterInstance } from '../types'

const Page = () => null
const TAG = Symbol.for('pyreon.router.loaderErrorRoute')

function routes(leafLoader: NonNullable<RouteRecord['loader']>): RouteRecord[] {
  return [
    {
      path: '/',
      component: Page,
      loader: async () => 'layout',
      children: [{ path: 'account/:id', component: Page, loader: leafLoader }],
    },
  ]
}

const make = (r: RouteRecord[], url: string) => createRouter({ routes: r, url }) as RouterInstance

describe('loader error tag (dev)', () => {
  test('the tag is the registered symbol zero reads', () => {
    expect(LOADER_ERROR_ROUTE).toBe(TAG)
  })

  test('a throwing loader rejects preload with the same error, tagged with its route path', async () => {
    const boom = new TypeError("Cannot read properties of undefined (reading 'name')")
    const router = make(routes(async () => { throw boom }), '/account/7')
    const err = await router.preload('/account/7').then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(err).toBe(boom)
    expect((err as Record<symbol, unknown>)[TAG]).toBe('account/:id')
    // Non-enumerable: never shows up when the error is serialised or spread.
    expect(Object.keys(err as object)).toEqual([])
  })

  test('a synchronous throw is tagged too', async () => {
    const router = make(routes(() => { throw new Error('sync') }), '/account/1')
    const err = await router.preload('/account/1').catch((e: unknown) => e)
    expect((err as Record<symbol, unknown>)[TAG]).toBe('account/:id')
  })

  test('notFound() is not an error and is not tagged', async () => {
    const router = make(routes(async () => notFound()), '/account/1')
    await expect(router.preload('/account/1')).resolves.toBeUndefined()
  })

  test('primitives and frozen errors pass through untouched', () => {
    expect(() => markLoaderError('a string', '/x')).not.toThrow()
    expect(() => markLoaderError(null, '/x')).not.toThrow()
    const frozen = Object.freeze(new Error('frozen'))
    expect(() => markLoaderError(frozen, '/x')).not.toThrow()
    expect((frozen as unknown as Record<symbol, unknown>)[TAG]).toBeUndefined()
  })
})
