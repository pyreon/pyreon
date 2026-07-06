/**
 * R1 — LPIH auto-bridge.
 *
 * The plugin auto-wires Live Program Inlay Hints in dev:
 *   1. `configureServer` registers a POST /__pyreon_lpih__ middleware
 *      that atomically writes the cache file the LSP auto-discovers.
 *   2. `transformIndexHtml` injects a client-side `<script type="module">`
 *      that activates devtools + polls `getFireSummaries()` every
 *      `intervalMs` and POSTs to the endpoint.
 *
 * Bisect-verified-with-restore:
 *   - Disabling the lpihEnabled gate in configureServer → "no LPIH
 *     middleware registered when lpih:true" fails.
 *   - Disabling the lpihEnabled gate in transformIndexHtml → "injects
 *     the LPIH client script into <head> when lpih:true" fails.
 *   - Reverting writeLpihCacheFile to bare `JSON.parse` → "rejects
 *     malformed body" fails (would silently corrupt the file).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import pyreonPlugin, {
  type PyreonPluginOptions,
  buildLpihClientScript,
  resolveLpihCachePath,
  writeLpihCacheFile,
} from '../index'

type ConfigHook = (
  userConfig: Record<string, unknown>,
  env: { command: string; isSsrBuild?: boolean },
) => Record<string, unknown>

type TransformIndexHtmlHook = (html: string) => string | undefined

interface MockServer {
  watcher: { on: ReturnType<typeof vi.fn>; emit?: (event: string, file: string) => void }
  middlewares: { use: ReturnType<typeof vi.fn> }
  ssrFixStacktrace: (e: Error) => void
  ssrLoadModule: ReturnType<typeof vi.fn>
  transformIndexHtml: ReturnType<typeof vi.fn>
}

function createMockServer(): MockServer {
  const handlers: Record<string, (file: string) => void> = {}
  return {
    watcher: {
      on: vi.fn((event: string, cb: (file: string) => void) => {
        handlers[event] = cb
      }),
      emit: (event: string, file: string) => handlers[event]?.(file),
    },
    middlewares: { use: vi.fn() },
    ssrFixStacktrace: () => {},
    ssrLoadModule: vi.fn(),
    transformIndexHtml: vi.fn(async (_url: string, html: string) => html),
  }
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-lpih-bridge-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function bootstrap(
  opts?: PyreonPluginOptions,
  env: { command: 'serve' | 'build' } = { command: 'serve' },
) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root }, env)
  return plugin
}

describe('resolveLpihCachePath', () => {
  it('returns <projectRoot>/.pyreon-lpih.json', () => {
    expect(resolveLpihCachePath('/abs/proj')).toBe('/abs/proj/.pyreon-lpih.json')
  })

  it('handles paths without trailing slash', () => {
    expect(resolveLpihCachePath('/abs/proj/')).toBe('/abs/proj/.pyreon-lpih.json')
  })
})

describe('writeLpihCacheFile', () => {
  it('writes JSON payload at the target path', async () => {
    const path = join(root, '.pyreon-lpih.json')
    const payload = JSON.stringify({
      fires: [{ file: '/a.tsx', line: 1, count: 1, kind: 'signal' }],
    })
    await writeLpihCacheFile(path, payload)
    expect(existsSync(path)).toBe(true)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { fires: unknown[] }
    expect(parsed.fires).toHaveLength(1)
  })

  it('overwrites existing file (atomic rename)', async () => {
    const path = join(root, '.pyreon-lpih.json')
    await writeLpihCacheFile(path, JSON.stringify({ fires: [{ file: 'a', line: 1, count: 1 }] }))
    await writeLpihCacheFile(path, JSON.stringify({ fires: [{ file: 'b', line: 2, count: 2 }] }))
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      fires: Array<{ file: string }>
    }
    expect(parsed.fires[0]?.file).toBe('b')
  })

  it('rejects malformed JSON body', async () => {
    const path = join(root, '.pyreon-lpih.json')
    await expect(writeLpihCacheFile(path, 'not json')).rejects.toThrow(/not valid JSON/)
    expect(existsSync(path)).toBe(false)
  })

  it('rejects body without `fires` array', async () => {
    const path = join(root, '.pyreon-lpih.json')
    await expect(writeLpihCacheFile(path, JSON.stringify({}))).rejects.toThrow(/missing `fires`/)
    await expect(
      writeLpihCacheFile(path, JSON.stringify({ fires: 'not array' })),
    ).rejects.toThrow(/missing `fires`/)
    await expect(writeLpihCacheFile(path, JSON.stringify(null))).rejects.toThrow(
      /missing `fires`/,
    )
    expect(existsSync(path)).toBe(false)
  })

  it('leaves no tmp files after successful write', async () => {
    const path = join(root, '.pyreon-lpih.json')
    await writeLpihCacheFile(path, JSON.stringify({ fires: [] }))
    const fs = await import('node:fs/promises')
    const files = await fs.readdir(root)
    const tmpFiles = files.filter((f) => f.includes('.tmp.'))
    expect(tmpFiles).toEqual([])
  })

  it('cleans up tmp file when rename fails (rename onto a directory)', async () => {
    // The pre-existing case the original try-around-rename ALREADY handled:
    // writeFile succeeds (writes a tmp file in root/), rename onto a path
    // that is a directory fails (EISDIR / EPERM), the catch unlinks tmp.
    // This test locks in that branch — bisect-verified by the existing
    // 'as-dir' rename-failure handling in writeLpihCacheFile.
    const targetDir = join(root, 'as-dir')
    const fs = await import('node:fs/promises')
    await fs.mkdir(targetDir, { recursive: true })
    await expect(
      writeLpihCacheFile(targetDir, JSON.stringify({ fires: [] })),
    ).rejects.toBeDefined()
    const files = await fs.readdir(root)
    const tmpFiles = files.filter(
      (f) => f.startsWith('as-dir.tmp.') || f.includes('.tmp.'),
    )
    expect(tmpFiles).toEqual([])
  })
})

describe('buildLpihClientScript', () => {
  it('returns a <script type="module"> block', () => {
    const script = buildLpihClientScript(250)
    expect(script).toContain('<script type="module">')
    expect(script).toContain('</script>')
  })

  it('embeds the interval as a JSON literal', () => {
    const script = buildLpihClientScript(500)
    expect(script).toContain('const __pxInterval = 500')
  })

  it('imports activateReactiveDevtools + getFireSummaries from @pyreon/reactivity', () => {
    const script = buildLpihClientScript(250)
    expect(script).toContain("import('@pyreon/reactivity')")
    expect(script).toContain('activateReactiveDevtools')
    expect(script).toContain('getFireSummaries')
  })

  it('uses top-level await on the dynamic import — activation BEFORE app modules', () => {
    // Critical for tracking module-scope signals. `<script type="module">`
    // tags defer + run in document order; top-level await blocks subsequent
    // modules. Dynamic import via `.then()` does NOT — the module body
    // completes immediately, the app's entry runs, module-scope signals
    // get created with `_active = false`, and `_rdRegister` skips them.
    const script = buildLpihClientScript(250)
    expect(script).toMatch(/await import\(['"]@pyreon\/reactivity['"]\)/)
    // The catch path returns null (silent fallback for missing-dep apps).
    expect(script).toMatch(/\.catch\(\(\) => null\)/)
    // Activation MUST appear AFTER the await (synchronous after the import resolves).
    const awaitIdx = script.indexOf('await import')
    const activateIdx = script.indexOf('activateReactiveDevtools()')
    expect(awaitIdx).toBeGreaterThan(0)
    expect(activateIdx).toBeGreaterThan(awaitIdx)
  })

  it('POSTs to /__pyreon_lpih__ with JSON content-type', () => {
    const script = buildLpihClientScript(250)
    expect(script).toContain("fetch('/__pyreon_lpih__'")
    expect(script).toContain("method: 'POST'")
    expect(script).toContain("'content-type': 'application/json'")
  })

  it('cleans up the interval on beforeunload', () => {
    const script = buildLpihClientScript(250)
    expect(script).toContain("addEventListener('beforeunload'")
    expect(script).toContain('clearInterval')
  })

  it('serializes the `fires` shape that the dev-server expects', () => {
    const script = buildLpihClientScript(250)
    // The browser-side must produce { fires: [{ file, line, count, kind, lastFire, rate1s }] }
    expect(script).toContain('fires: summaries.map')
    expect(script).toContain('file: s.loc.file')
    expect(script).toContain('line: s.loc.line')
    expect(script).toContain('count: s.count')
    expect(script).toContain('kind: s.kind')
    expect(script).toContain('rate1s: s.rate1s')
  })
})

describe('LPIH transformIndexHtml — injection gating', () => {
  it('injects the LPIH client script into <head> when lpih:true (default)', () => {
    const plugin = bootstrap()
    const transform = plugin.transformIndexHtml as unknown as TransformIndexHtmlHook
    const out = transform('<html><head><title>X</title></head><body></body></html>')
    expect(out).toBeDefined()
    expect(out).toContain('/__pyreon_lpih__')
    expect(out).toContain('@pyreon/reactivity')
    // Injected BEFORE the closing </head>, not after.
    const headEnd = out!.indexOf('</head>')
    const scriptStart = out!.indexOf('<script type="module">')
    expect(scriptStart).toBeGreaterThan(0)
    expect(scriptStart).toBeLessThan(headEnd)
  })

  it('does NOT inject the LPIH poller when lpih:false', () => {
    const plugin = bootstrap({ lpih: false })
    const transform = plugin.transformIndexHtml as unknown as TransformIndexHtmlHook
    const out = transform('<html><head></head><body></body></html>')
    // The LPIH poller specifically is not injected. (The dev throw-time fix
    // printer is a SEPARATE default-on dev injection, so the result may still
    // contain that script — hence we assert on the LPIH marker, not undefined.)
    expect(out === undefined || !out.includes('/__pyreon_lpih__')).toBe(true)
  })

  it('injects nothing (undefined) when both lpih AND devErrorPrinter are off', () => {
    const plugin = bootstrap({ lpih: false, devErrorPrinter: false })
    const transform = plugin.transformIndexHtml as unknown as TransformIndexHtmlHook
    const out = transform('<html><head></head><body></body></html>')
    // Nothing to inject → undefined → Vite uses the original HTML.
    expect(out).toBeUndefined()
  })

  it('does NOT inject in build mode (lpih is dev-only)', () => {
    const plugin = bootstrap({ lpih: true }, { command: 'build' })
    const transform = plugin.transformIndexHtml as unknown as TransformIndexHtmlHook
    const out = transform('<html><head></head><body></body></html>')
    expect(out).toBeUndefined()
  })

  it('respects custom intervalMs via object-form option', () => {
    const plugin = bootstrap({ lpih: { intervalMs: 1000 } })
    const transform = plugin.transformIndexHtml as unknown as TransformIndexHtmlHook
    const out = transform('<html><head></head><body></body></html>')
    expect(out).toContain('const __pxInterval = 1000')
  })

  it('uses default 250ms interval when lpih:true with no override', () => {
    const plugin = bootstrap({ lpih: true })
    const transform = plugin.transformIndexHtml as unknown as TransformIndexHtmlHook
    const out = transform('<html><head></head><body></body></html>')
    expect(out).toContain('const __pxInterval = 250')
  })
})

describe('LPIH configureServer — middleware registration', () => {
  it('registers a /__pyreon_lpih__ middleware when lpih:true (default)', () => {
    const plugin = bootstrap()
    const server = createMockServer()
    ;(plugin.configureServer as unknown as (s: MockServer) => unknown)(server)

    // Find the LPIH middleware in the call list — first arg is the path.
    const lpihCall = server.middlewares.use.mock.calls.find(
      (c: unknown[]) => c[0] === '/__pyreon_lpih__',
    )
    expect(lpihCall).toBeDefined()
    expect(typeof lpihCall![1]).toBe('function')
  })

  it('does NOT register the LPIH middleware when lpih:false', () => {
    const plugin = bootstrap({ lpih: false })
    const server = createMockServer()
    ;(plugin.configureServer as unknown as (s: MockServer) => unknown)(server)

    const lpihCall = server.middlewares.use.mock.calls.find(
      (c: unknown[]) => c[0] === '/__pyreon_lpih__',
    )
    expect(lpihCall).toBeUndefined()
  })

  it('LPIH middleware rejects non-POST with 405', () => {
    const plugin = bootstrap()
    const server = createMockServer()
    ;(plugin.configureServer as unknown as (s: MockServer) => unknown)(server)

    const lpihCall = server.middlewares.use.mock.calls.find(
      (c: unknown[]) => c[0] === '/__pyreon_lpih__',
    )
    const handler = lpihCall![1] as (
      req: { method: string },
      res: { statusCode: number; end: (msg?: string) => void },
    ) => void

    let statusCode = 0
    let ended = false
    handler(
      { method: 'GET' },
      {
        statusCode: 0,
        end(_msg?: string) {
          ended = true
          // capture
          statusCode = (this as { statusCode: number }).statusCode
        },
      },
    )
    expect(ended).toBe(true)
    expect(statusCode).toBe(405)
  })

  it('LPIH middleware writes valid POST payload to the cache file', async () => {
    const plugin = bootstrap()
    const server = createMockServer()
    ;(plugin.configureServer as unknown as (s: MockServer) => unknown)(server)

    const lpihCall = server.middlewares.use.mock.calls.find(
      (c: unknown[]) => c[0] === '/__pyreon_lpih__',
    )
    const handler = lpihCall![1] as (
      req: { method: string; on: (ev: string, cb: (chunk: string) => void) => void; destroy: () => void },
      res: { statusCode: number; end: () => void },
    ) => void

    type DataCb = (chunk: string) => void
    type EndCb = () => void
    const handlers: { data?: DataCb; end?: EndCb } = {}
    const req = {
      method: 'POST',
      on: (ev: string, cb: (chunk: string) => void) => {
        if (ev === 'data') handlers.data = cb as DataCb
        if (ev === 'end') handlers.end = cb as unknown as EndCb
      },
      destroy: () => {},
    }
    const resultPromise = new Promise<number>((resolve) => {
      const res = {
        statusCode: 0,
        end() {
          resolve(res.statusCode)
        },
      }
      handler(req, res)
    })

    const payload = JSON.stringify({
      fires: [
        { file: '/a.tsx', line: 5, count: 3, kind: 'signal', lastFire: 100, rate1s: 1.5 },
      ],
    })
    handlers.data!(payload)
    handlers.end!()

    const status = await resultPromise
    expect(status).toBe(204)
    const cachePath = join(root, '.pyreon-lpih.json')
    expect(existsSync(cachePath)).toBe(true)
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as { fires: unknown[] }
    expect(parsed.fires).toHaveLength(1)
  })

  it('LPIH middleware honours custom cachePath via object-form option', async () => {
    const customPath = join(root, 'custom-lpih.json')
    const plugin = bootstrap({ lpih: { cachePath: customPath } })
    const server = createMockServer()
    ;(plugin.configureServer as unknown as (s: MockServer) => unknown)(server)

    const lpihCall = server.middlewares.use.mock.calls.find(
      (c: unknown[]) => c[0] === '/__pyreon_lpih__',
    )
    const handler = lpihCall![1] as (
      req: { method: string; on: (ev: string, cb: (chunk: string) => void) => void; destroy: () => void },
      res: { statusCode: number; end: () => void },
    ) => void

    type DataCb = (chunk: string) => void
    type EndCb = () => void
    const handlers: { data?: DataCb; end?: EndCb } = {}
    const req = {
      method: 'POST',
      on: (ev: string, cb: (chunk: string) => void) => {
        if (ev === 'data') handlers.data = cb as DataCb
        if (ev === 'end') handlers.end = cb as unknown as EndCb
      },
      destroy: () => {},
    }
    const done = new Promise<void>((resolve) => {
      handler(req, {
        statusCode: 0,
        end: () => resolve(),
      })
    })
    handlers.data!(JSON.stringify({ fires: [] }))
    handlers.end!()
    await done

    // Default cache path NOT written; custom path IS.
    expect(existsSync(join(root, '.pyreon-lpih.json'))).toBe(false)
    expect(existsSync(customPath)).toBe(true)
  })
})
