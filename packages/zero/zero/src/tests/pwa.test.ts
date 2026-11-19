import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServiceWorker, buildWebManifest, writeServiceWorker } from '../pwa'

type Listener = (e: unknown) => void

/** Execute the generated worker against in-memory caches + a fake fetch. */
function bootWorker(opts: {
  skipWaiting?: boolean
  online: () => boolean
  responseHeaders?: HeadersInit
  shell?: string
  offlineFallback?: string
}) {
  const stores = new Map<string, Map<string, string>>()
  const varyOrigin = true // the server sends `Vary: Origin`
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const m = stores.get(name)!
    const key = (r: string | { url: string }) =>
      new URL(typeof r === 'string' ? r : r.url, 'https://a.test').pathname +
      new URL(typeof r === 'string' ? r : r.url, 'https://a.test').search
    return {
      // Models the real Cache API: a stored response with `Vary: Origin` does
      // not match a request carrying an `Origin` header unless ignoreVary is set.
      match: async (r: string | { url: string; headers?: Headers }, o?: { ignoreVary?: boolean }) => {
        if (!m.has(key(r))) return undefined
        const hasOrigin = typeof r !== 'string' && r.headers?.has('origin')
        if (hasOrigin && varyOrigin && !o?.ignoreVary) return undefined
        return { body: m.get(key(r))!, ok: true }
      },
      addAll: async (urls: string[]) => urls.forEach((u) => m.set(u, `pre:${u}`)),
      put: async (r: { url: string }, res: { body: string }) => void m.set(key(r), res.body),
    }
  }
  const match = async (r: string | { url: string }) => {
    const k =
      new URL(typeof r === 'string' ? r : r.url, 'https://a.test').pathname +
      new URL(typeof r === 'string' ? r : r.url, 'https://a.test').search
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
    return {
      ok: true,
      headers: new Headers(
        opts.responseHeaders ?? { 'cache-control': 'public', 'content-type': 'text/html' },
      ),
      body: `net:${new URL(r.url).pathname}`,
      clone() {
        return this
      },
    }
  }
  const src = buildServiceWorker({
    precache: ['index.html', 'posts/a/index.html', 'assets/app.abc.js'],
    version: 'v1',
    base: '/',
    assetsDir: 'assets',
    cacheName: 'p',
    skipWaiting: opts.skipWaiting ?? false,
    shell: opts.shell,
    offlineFallback: opts.offlineFallback,
  })
  runInNewContext(src, {
    self,
    caches: {
      open,
      match,
      keys: async () => [...stores.keys()],
      delete: async (k: string) => stores.delete(k),
    },
    fetch: fetchFn,
    URL,
    Promise,
  })
  const dispatch = async (type: string, extra: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve()
    const lifetime: Promise<unknown>[] = []
    const ev = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => lifetime.push(p),
      respondWith: (p: Promise<unknown>) => (pending = p),
    }
    listeners.get(type)!(ev)
    const response = await pending
    await Promise.all(lifetime)
    return response
  }
  return { dispatch, calls, stores }
}

const req = (path: string, mode = 'no-cors') => ({
  request: { url: `https://a.test${path}`, method: 'GET', mode, headers: new Headers() },
})

describe('generated service worker', () => {
  it('install precaches the list; waits unless skipWaiting', async () => {
    const w = bootWorker({ online: () => true })
    await w.dispatch('install', {})
    expect([...w.stores.get('p-precache-v1')!.keys()]).toEqual([
      '/index.html',
      '/posts/a/index.html',
      '/assets/app.abc.js',
    ])
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
    expect(await w.dispatch('fetch', req('/posts/a', 'navigate'))).toMatchObject({
      body: 'net:/posts/a',
    })
    online = false
    // Visited while online → the last-seen network copy wins offline.
    expect(await w.dispatch('fetch', req('/posts/a', 'navigate'))).toMatchObject({
      body: 'net:/posts/a',
    })
    // Never visited → the precached prerendered page.
    expect(await w.dispatch('fetch', req('/', 'navigate'))).toMatchObject({
      body: 'pre:/index.html',
    })
  })

  it.each([
    { 'cache-control': 'private, no-store' },
    { 'cache-control': 'public, no-store' },
    { 'cache-control': 'no-cache' },
    { 'cache-control': 'public', vary: 'Cookie' },
    { 'cache-control': 'public', vary: '*' },
    {},
  ])('never replays a private or unclassified navigation offline: %j', async (headers) => {
    let online = true
    const w = bootWorker({
      online: () => online,
      responseHeaders: { 'content-type': 'text/html', ...headers },
    })
    await w.dispatch('fetch', req('/account', 'navigate'))
    online = false
    await expect(w.dispatch('fetch', req('/account', 'navigate'))).rejects.toThrow('offline')
  })

  it('retains query variants separately for public offline navigation', async () => {
    let online = true
    const w = bootWorker({ online: () => online })
    await w.dispatch('fetch', req('/search?q=one', 'navigate'))
    online = false
    expect(await w.dispatch('fetch', req('/search?q=one', 'navigate'))).toMatchObject({ body: 'net:/search' })
    await expect(w.dispatch('fetch', req('/search?q=two', 'navigate'))).rejects.toThrow('offline')
  })

  it('SPA shell: an unvisited route offline gets the precached app shell', async () => {
    const w = bootWorker({ online: () => false, shell: 'index.html' })
    await w.dispatch('install', {})
    expect(await w.dispatch('fetch', req('/deep/unvisited/route', 'navigate'))).toMatchObject({
      body: 'pre:/index.html',
    })
  })

  it('SSG offlineFallback: an unprerendered route offline gets the configured page', async () => {
    const w = bootWorker({ online: () => false, offlineFallback: '/posts/a/' })
    await w.dispatch('install', {})
    expect(await w.dispatch('fetch', req('/never/prerendered', 'navigate'))).toMatchObject({
      body: 'pre:/posts/a/index.html',
    })
  })

  it('without shell or offlineFallback an unknown route offline is a network error', async () => {
    const w = bootWorker({ online: () => false })
    await w.dispatch('install', {})
    await expect(w.dispatch('fetch', req('/never/prerendered', 'navigate'))).rejects.toThrow('offline')
  })

  it('a precached asset matches a module-script request carrying Origin (Vary: Origin servers)', async () => {
    const w = bootWorker({ online: () => false })
    await w.dispatch('install', {})
    const moduleRequest = {
      request: {
        url: 'https://a.test/assets/app.abc.js',
        method: 'GET',
        mode: 'cors',
        headers: new Headers({ origin: 'https://a.test' }),
      },
    }
    expect(await w.dispatch('fetch', moduleRequest)).toMatchObject({ body: 'pre:/assets/app.abc.js' })
  })

  it('hashed assets are cache-first (no network hit when precached)', async () => {
    const w = bootWorker({ online: () => true })
    await w.dispatch('install', {})
    expect(await w.dispatch('fetch', req('/assets/app.abc.js'))).toMatchObject({
      body: 'pre:/assets/app.abc.js',
    })
    expect(w.calls.net).not.toContain('/assets/app.abc.js')
  })

  it('activate drops precaches of older versions only', async () => {
    const w = bootWorker({ online: () => true })
    w.stores.set('p-precache-old', new Map())
    w.stores.set('p-runtime', new Map([['/account', 'old private HTML']]))
    w.stores.set('p-runtime-public-v1', new Map())
    await w.dispatch('install', {})
    await w.dispatch('activate', {})
    expect([...w.stores.keys()].sort()).toEqual(['p-precache-v1', 'p-runtime-public-v1'])
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
    expect(JSON.parse(buildWebManifest(manifest, '/'))).toEqual({
      start_url: '/',
      scope: '/',
      ...manifest,
    })
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
    // The update listener is attached ONCE (by the first call), never again.
    expect(reg.addEventListener).toHaveBeenCalledTimes(1)
  })

  it('registers under the configured base, adding the trailing slash', async () => {
    const register = vi.fn(async () => ({ addEventListener: vi.fn(), waiting: null }))
    vi.stubGlobal('navigator', { serviceWorker: { register, controller: null } })
    vi.stubGlobal('__ZERO_BASE__', '/docs')
    vi.stubEnv('NODE_ENV', 'production')
    const { registerServiceWorker } = await loadClient()
    await registerServiceWorker()
    expect(register).toHaveBeenCalledWith('/docs/sw.js', {
      scope: '/docs/',
      updateViaCache: 'none',
    })
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
      installing: null as null | {
        state: string
        addEventListener: (t: string, f: () => void) => void
      },
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] = fn
      },
    }
    container.register.mockResolvedValue(reg)
    vi.stubGlobal('navigator', { serviceWorker: container })
    vi.stubEnv('NODE_ENV', 'production')
    const offers: Array<() => void> = []
    const { registerServiceWorker } = await loadClient()
    await registerServiceWorker({
      url: '/custom-sw.js',
      scope: '/app/',
      onUpdate: (activate) => offers.push(activate),
    })
    expect(container.register).toHaveBeenCalledWith('/custom-sw.js', {
      scope: '/app/',
      updateViaCache: 'none',
    })
    // Already-waiting worker with an existing controller → offered at once.
    expect(offers).toHaveLength(1)
    offers[0]!()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(container.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
      { once: true },
    )

    // A later update: offered only once the new worker reaches `installed`.
    let onState: () => void = () => {}
    const installing = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: (_t: string, f: () => void) => (onState = f),
    }
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

describe('useServiceWorkerUpdate', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })
  it('flips updateReady when a worker is waiting (no onUpdate needed) and apply() activates it', async () => {
    const container = { register: vi.fn(), controller: {}, addEventListener: vi.fn() }
    const waiting = { postMessage: vi.fn() }
    container.register.mockResolvedValue({ waiting, installing: null, addEventListener: vi.fn() })
    vi.stubGlobal('navigator', { serviceWorker: container })
    vi.stubEnv('NODE_ENV', 'production')
    const { registerServiceWorker, useServiceWorkerUpdate } = await loadClient()
    const update = useServiceWorkerUpdate()
    expect(update.updateReady()).toBe(false)
    update.apply() // no-op, nothing waiting
    expect(waiting.postMessage).not.toHaveBeenCalled()
    await registerServiceWorker()
    expect(update.updateReady()).toBe(true)
    update.apply()
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })
})

describe('unregisterServiceWorkers', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('unregisters every worker and deletes only this app\'s caches', async () => {
    const unregister = vi.fn(async () => true)
    const del = vi.fn(async () => true)
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: async () => [{ unregister }, { unregister }] },
    })
    vi.stubGlobal('caches', { keys: async () => ['pyreon-precache-x', 'other-cache'], delete: del })
    const { unregisterServiceWorkers } = await loadClient()
    expect(await unregisterServiceWorkers()).toBe(2)
    expect(unregister).toHaveBeenCalledTimes(2)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith('pyreon-precache-x')
  })
  it('resolves 0 without service-worker support', async () => {
    vi.stubGlobal('navigator', {})
    const { unregisterServiceWorkers } = await loadClient()
    expect(await unregisterServiceWorkers()).toBe(0)
  })
})

describe('useInstallPrompt', () => {
  afterEach(() => vi.unstubAllGlobals())
  function setup(standalone = false) {
    const win = new EventTarget()
    vi.stubGlobal('window', win)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('matchMedia', () => ({
      matches: standalone,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    return win
  }
  function offer(win: EventTarget, outcome: 'accepted' | 'dismissed') {
    const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome }),
    })
    win.dispatchEvent(e)
    return e
  }

  it('captures beforeinstallprompt once, suppresses the infobar, and prompts on demand', async () => {
    const win = setup()
    const { useInstallPrompt } = await loadClient()
    const install = useInstallPrompt()
    expect(install.canInstall()).toBe(false)
    expect(await install.prompt()).toBe('unavailable')
    const e = offer(win, 'accepted')
    expect(e.defaultPrevented).toBe(true)
    expect(install.canInstall()).toBe(true)
    expect(await install.prompt()).toBe('accepted')
    expect(e.prompt).toHaveBeenCalledTimes(1)
    // Single-use: the event is spent.
    expect(install.canInstall()).toBe(false)
    expect(await install.prompt()).toBe('unavailable')
  })

  it('reports dismissed, and appinstalled marks the app installed', async () => {
    const win = setup()
    const { useInstallPrompt } = await loadClient()
    const install = useInstallPrompt()
    offer(win, 'dismissed')
    expect(await install.prompt()).toBe('dismissed')
    expect(install.isInstalled()).toBe(false)
    offer(win, 'dismissed')
    win.dispatchEvent(new Event('appinstalled'))
    expect(install.isInstalled()).toBe(true)
    expect(install.canInstall()).toBe(false)
  })

  it('isInstalled reads the standalone display mode', async () => {
    setup(true)
    const { useInstallPrompt } = await loadClient()
    expect(useInstallPrompt().isInstalled()).toBe(true)
  })

  it('shares ONE listener set across callers (no per-call listener leak)', async () => {
    const win = setup()
    const add = vi.spyOn(win, 'addEventListener')
    const { useInstallPrompt } = await loadClient()
    useInstallPrompt()
    useInstallPrompt()
    useInstallPrompt()
    expect(add.mock.calls.filter(([t]) => t === 'beforeinstallprompt')).toHaveLength(1)
  })

  it('is inert on the server (no window access, nothing available)', async () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('navigator', {})
    vi.resetModules()
    vi.stubGlobal('document', undefined)
    const { useInstallPrompt } = await import('../pwa-client')
    const install = useInstallPrompt()
    expect(install.canInstall()).toBe(false)
    expect(install.isInstalled()).toBe(false)
    expect(await install.prompt()).toBe('unavailable')
  })
})

describe('pwa.offlineFallback', () => {
  it('is rejected outside mode ssg with a [Pyreon] message', async () => {
    await expect(
      writeServiceWorker('/nonexistent', { manifest: { name: 'x' }, offlineFallback: '/offline' }, {
        base: '/',
        assetsDir: 'assets',
        includeHtml: false,
      }),
    ).rejects.toThrow(/\[Pyreon\].*offlineFallback.*mode: "ssg"/)
  })
})
