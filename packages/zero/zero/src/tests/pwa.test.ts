import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServiceWorker, buildWebManifest } from '../pwa'

type Listener = (e: unknown) => void

/** Execute the generated worker against in-memory caches + a fake fetch. */
function bootWorker(opts: { skipWaiting?: boolean; online: () => boolean }) {
  const stores = new Map<string, Map<string, string>>()
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)!
    const key = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, 'https://a.test').pathname
    return {
      addAll: async (urls: string[]) => urls.forEach((u) => m.set(u, `pre:${u}`)),
      put: async (r: { url: string }, res: { body: string }) => void m.set(key(r), res.body),
    }
  }
  const match = async (r: string | { url: string }) => {
    const k = new URL(typeof r === 'string' ? r : r.url, 'https://a.test').pathname
    for (const m of stores.values()) if (m.has(k)) return { body: m.get(k)!, ok: true }
    return undefined
  }
  const listeners = new Map<string, Listener>()
  const calls = { skipWaiting: 0, claim: 0, net: [] as string[] }
  const self = {
    location: { origin: 'https://a.test' },
    addEventListener: (t: string, fn: Listener) => listeners.set(t, fn),
    skipWaiting: async () => void calls.skipWaiting++,
    clients: { claim: async () => void calls.claim++ },
  }
  const fetchFn = async (r: { url: string }) => {
    calls.net.push(new URL(r.url).pathname)
    if (!opts.online()) throw new TypeError('offline')
    return { ok: true, body: `net:${new URL(r.url).pathname}`, clone() { return this } }
  }
  const src = buildServiceWorker({
    precache: ['index.html', 'posts/a/index.html', 'assets/app.abc.js'],
    version: 'v1',
    base: '/',
    assetsDir: 'assets',
    cacheName: 'p',
    skipWaiting: opts.skipWaiting ?? false,
  })
  runInNewContext(src, {
    self,
    caches: { open, match, keys: async () => [...stores.keys()], delete: async (k: string) => stores.delete(k) },
    fetch: fetchFn,
    URL,
    Promise,
  })
  const dispatch = async (type: string, extra: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve()
    const ev = { ...extra, waitUntil: (p: Promise<unknown>) => (pending = p), respondWith: (p: Promise<unknown>) => (pending = p) }
    listeners.get(type)!(ev)
    return pending
  }
  return { dispatch, calls, stores }
}

const req = (path: string, mode = 'no-cors') => ({ request: { url: `https://a.test${path}`, method: 'GET', mode } })

describe('generated service worker', () => {
  it('install precaches the list; waits unless skipWaiting', async () => {
    const w = bootWorker({ online: () => true })
    await w.dispatch('install', {})
    expect([...w.stores.get('p-precache-v1')!.keys()]).toEqual(['/index.html', '/posts/a/index.html', '/assets/app.abc.js'])
    expect(w.calls.skipWaiting).toBe(0)
    const w2 = bootWorker({ online: () => true, skipWaiting: true })
    await w2.dispatch('install', {})
    await w2.dispatch('activate', {})
    expect([w2.calls.skipWaiting, w2.calls.claim]).toEqual([1, 1])
  })

  it('navigations are network-first, falling back to the precached page offline', async () => {
    let online = true
    const w = bootWorker({ online: () => online })
    await w.dispatch('install', {})
    expect(await w.dispatch('fetch', req('/posts/a', 'navigate'))).toMatchObject({ body: 'net:/posts/a' })
    online = false
    // Visited while online → the last-seen network copy wins offline.
    expect(await w.dispatch('fetch', req('/posts/a', 'navigate'))).toMatchObject({ body: 'net:/posts/a' })
    // Never visited → the precached prerendered page.
    expect(await w.dispatch('fetch', req('/', 'navigate'))).toMatchObject({ body: 'pre:/index.html' })
  })

  it('hashed assets are cache-first (no network hit when precached)', async () => {
    const w = bootWorker({ online: () => true })
    await w.dispatch('install', {})
    expect(await w.dispatch('fetch', req('/assets/app.abc.js'))).toMatchObject({ body: 'pre:/assets/app.abc.js' })
    expect(w.calls.net).not.toContain('/assets/app.abc.js')
  })

  it('activate drops precaches of older versions only', async () => {
    const w = bootWorker({ online: () => true })
    w.stores.set('p-precache-old', new Map())
    w.stores.set('p-runtime', new Map())
    await w.dispatch('install', {})
    await w.dispatch('activate', {})
    expect([...w.stores.keys()].sort()).toEqual(['p-precache-v1', 'p-runtime'])
  })
})

describe('buildWebManifest', () => {
  it('defaults start_url/scope to the base and display to standalone', () => {
    expect(JSON.parse(buildWebManifest({ name: 'X' }, '/app/'))).toEqual({
      name: 'X',
      start_url: '/app/',
      scope: '/app/',
      display: 'standalone',
    })
  })

  it('writes every declared manifest field verbatim (orientation, colors, icons)', () => {
    const manifest = {
      name: 'X',
      short_name: 'x',
      orientation: 'portrait' as const,
      theme_color: '#111',
      background_color: '#fff',
      lang: 'en',
      display: 'minimal-ui' as const,
      icons: [{ src: '/i.png', sizes: '192x192', purpose: 'maskable' as const }],
    }
    expect(JSON.parse(buildWebManifest(manifest, '/'))).toEqual({ start_url: '/', scope: '/', ...manifest })
  })
})

async function loadClient(): Promise<typeof import('../pwa-client')> {
  // `isServer` is fixed at module load — give the module a DOM, fresh.
  vi.stubGlobal('document', {})
  vi.resetModules()
  return import('../pwa-client')
}

describe('registerServiceWorker', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  it('no-ops outside production (dev never gets a caching worker)', async () => {
    const register = vi.fn()
    vi.stubGlobal('navigator', { serviceWorker: { register } })
    vi.stubEnv('NODE_ENV', 'development')
    const { registerServiceWorker } = await loadClient()
    expect(await registerServiceWorker()).toBeNull()
    expect(register).not.toHaveBeenCalled()
  })
  it('registers <base>sw.js with updateViaCache none in production', async () => {
    const reg = { addEventListener: vi.fn(), waiting: null }
    const register = vi.fn(async () => reg)
    vi.stubGlobal('navigator', { serviceWorker: { register, controller: null } })
    vi.stubEnv('NODE_ENV', 'production')
    const { registerServiceWorker } = await loadClient()
    expect(await registerServiceWorker()).toBe(reg)
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
    // Idempotent: a second call reuses the registration, attaching nothing new.
    expect(await registerServiceWorker({ onUpdate: () => {} })).toBe(reg)
    expect(register).toHaveBeenCalledTimes(1)
    expect(reg.addEventListener).not.toHaveBeenCalled()
  })

  it('registers under the configured base, adding the trailing slash', async () => {
    const register = vi.fn(async () => ({ addEventListener: vi.fn(), waiting: null }))
    vi.stubGlobal('navigator', { serviceWorker: { register, controller: null } })
    vi.stubGlobal('__ZERO_BASE__', '/docs')
    vi.stubEnv('NODE_ENV', 'production')
    const { registerServiceWorker } = await loadClient()
    await registerServiceWorker()
    expect(register).toHaveBeenCalledWith('/docs/sw.js', { scope: '/docs/', updateViaCache: 'none' })
  })

  it('resolves null where service workers are unsupported', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubEnv('NODE_ENV', 'production')
    const { registerServiceWorker } = await loadClient()
    expect(await registerServiceWorker()).toBeNull()
  })

  it('offers an update to onUpdate, and activate() hands control to the waiting worker', async () => {
    const container = { register: vi.fn(), controller: {}, addEventListener: vi.fn() }
    const waiting = { postMessage: vi.fn() }
    const listeners: Record<string, () => void> = {}
    const reg = {
      waiting,
      installing: null as null | { state: string; addEventListener: (t: string, f: () => void) => void },
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn
      },
    }
    container.register.mockResolvedValue(reg)
    vi.stubGlobal('navigator', { serviceWorker: container })
    vi.stubEnv('NODE_ENV', 'production')
    const offers: Array<() => void> = []
    const { registerServiceWorker } = await loadClient()
    await registerServiceWorker({ url: '/custom-sw.js', scope: '/app/', onUpdate: (activate) => offers.push(activate) })
    expect(container.register).toHaveBeenCalledWith('/custom-sw.js', { scope: '/app/', updateViaCache: 'none' })
    // Already-waiting worker with an existing controller → offered at once.
    expect(offers).toHaveLength(1)
    offers[0]!()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(container.addEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function), { once: true })

    // A later update: offered only once the new worker reaches `installed`.
    let onState: () => void = () => {}
    const installing = { state: 'installing', postMessage: vi.fn(), addEventListener: (_t: string, f: () => void) => (onState = f) }
    reg.installing = installing
    listeners.updatefound!()
    onState()
    expect(offers).toHaveLength(1)
    installing.state = 'installed'
    onState()
    expect(offers).toHaveLength(2)

    // updatefound with no installing worker is ignored.
    reg.installing = null
    listeners.updatefound!()
    expect(offers).toHaveLength(2)
  })
})
