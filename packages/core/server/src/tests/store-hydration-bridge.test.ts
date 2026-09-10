// @vitest-environment happy-dom
/**
 * The SSR store-state bridge, and the loader module shapes an island accepts.
 *
 * `startClient` seeds `@pyreon/store` from a snapshot the server embedded on
 * `window.__PYREON_STORE_STATE__`, through a bridge `@pyreon/store` registers
 * on import. Both halves are optional — an app without the store never sets
 * the bridge, and a page without shared state never emits the blob — so every
 * combination has to be a clean no-op rather than a boot failure. A throw here
 * happens BEFORE mount, so the page renders nothing at all.
 *
 * The blob is the least trustworthy input in the whole boot path: it is
 * whatever the server serialized, parsed from the document. A string, a null,
 * a truncated write — each has to be ignored rather than handed to the store.
 *
 * The island loader's module shape is the same class of tolerance: a chunk may
 * export the component as `default` or be the function itself, depending on
 * how the consumer's bundler interops. Getting it wrong mounts `undefined`.
 */
import { hydrateIslands, startClient } from '../client'

type G = Record<string, unknown>
const g = globalThis as G
const tick = (ms = 20) => new Promise<void>((r) => setTimeout(r, ms))

const BRIDGE = '__PYREON_HYDRATE_STORES__'
const BLOB = '__PYREON_STORE_STATE__'

afterEach(() => {
  delete g[BRIDGE]
  delete (window as unknown as G)[BLOB]
  document.body.innerHTML = ''
})

/**
 * Boot the REAL `startClient` and report what reached the store bridge.
 *
 * Deliberately not a re-implementation of the bridge call: a helper that
 * repeated the `storeState && typeof storeState === 'object'` check would
 * assert my copy of the logic and leave the shipped path untested — the
 * "test the shipped entry, not the export" rule, which this file broke on
 * its first draft.
 */
function bootAndSeed(): { seen: unknown[]; stop: () => void } {
  const seen: unknown[] = []
  g[BRIDGE] = (d: unknown) => seen.push(d)
  const host = document.createElement('div')
  host.id = 'app'
  document.body.appendChild(host)
  const stop = startClient({
    App: (() => null) as never,
    routes: [{ path: '/', component: () => null }] as never,
    container: '#app',
  })
  return { seen, stop }
}

describe('the SSR store snapshot is only forwarded when it is usable', () => {
  test('a well-formed snapshot reaches the bridge', () => {
    ;(window as unknown as G)[BLOB] = { cart: { items: 2 } }
    const { seen, stop } = bootAndSeed()
    expect(seen, 'the happy path must actually forward').toEqual([{ cart: { items: 2 } }])
    stop()
  })

  test('an ABSENT blob forwards nothing', () => {
    // The ordinary case for a page with no shared state.
    const { seen, stop } = bootAndSeed()
    expect(seen).toEqual([])
    stop()
  })

  for (const [label, value] of [
    ['null', null],
    ['a string', '{"cart":{}}'],
    ['a number', 42],
    ['a boolean', false],
  ] as Array<[string, unknown]>) {
    test(`a MALFORMED blob (${label}) is ignored, not forwarded`, () => {
      // A truncated or mis-typed write must not be handed to the store, which
      // would iterate it and fail — before mount, so the page renders nothing.
      ;(window as unknown as G)[BLOB] = value
      const { seen, stop } = bootAndSeed()
      expect(seen, `${label} must not reach the bridge`).toEqual([])
      stop()
    })
  }

  test('no bridge registered is a no-op even with a valid blob', () => {
    // An app that does not use `@pyreon/store` never registers the bridge. The
    // blob is then inert rather than an error.
    ;(window as unknown as G)[BLOB] = { cart: { items: 2 } }
    expect(g[BRIDGE], 'no store package loaded, so no bridge').toBeUndefined()
    const host = document.createElement('div')
    host.id = 'app'
    document.body.appendChild(host)
    let stop: (() => void) | undefined
    expect(() => {
      stop = startClient({
        App: (() => null) as never,
        routes: [{ path: '/', component: () => null }] as never,
        container: '#app',
      })
    }, 'boot must survive a blob with nothing to consume it').not.toThrow()
    stop?.()
  })
})

describe('an island loader may export the component either way', () => {
  function markup(name: string): HTMLElement {
    const el = document.createElement('pyreon-island')
    el.setAttribute('data-component', name)
    el.setAttribute('data-hydrate', 'load')
    el.setAttribute('data-props', '{}')
    document.body.appendChild(el)
    return el
  }

  test('a module whose default is the component mounts', async () => {
    // The dominant shape: `export default function Widget() {}`.
    let mounted = 0
    markup('widget')
    const stop = hydrateIslands({
      widget: (async () => ({
        default: () => {
          mounted++
          return null
        },
      })) as never,
    })
    await tick(40)
    expect(mounted, 'a default export must be found').toBe(1)
    stop()
  })

  test('a module that IS the component mounts too', async () => {
    // What some bundler interops hand back. Reading `.default` off a function
    // gives `undefined`, and mounting undefined renders nothing with no error.
    let mounted = 0
    markup('bare')
    const bare = () => {
      mounted++
      return null
    }
    const stop = hydrateIslands({ bare: (async () => bare) as never })
    await tick(40)
    expect(mounted, 'a bare function export must be found').toBe(1)
    stop()
  })

  test('an island whose loader REJECTS does not take the page down', async () => {
    // A chunk that 404s after a deploy is the ordinary cause. The rest of the
    // page must survive it.
    markup('broken')
    const stop = hydrateIslands({
      broken: (async () => {
        throw new Error('chunk 404')
      }) as never,
    })
    await expect(tick(40)).resolves.toBeUndefined()
    stop()
  })
})
