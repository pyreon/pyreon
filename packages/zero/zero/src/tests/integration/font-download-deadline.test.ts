import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { fontPlugin } from '../../font'

const FONT_CSS =
  '@font-face{font-family:"Inter";src:url(https://fonts.gstatic.com/test.woff2);font-weight:400}'

// Real HTTP and Vite: only redirect the provider's URLs to the fixture server
// and trigger the deadline once a request has actually stalled. Healthy
// requests keep the production budget, including on a slow CI runner.
// Headers and response bodies still go
// through fetch's real abort machinery, including socket teardown.
async function fixture(context: { onTestFinished: (fn: () => Promise<void>) => void }) {
  const root = mkdtempSync(join(tmpdir(), 'zero-font-deadline-'))
  writeFileSync(join(root, 'index.html'), '<html><head></head><body>font build</body></html>')
  let stalled: 'headers' | 'css-body' | 'font-body' | 'css-status' | 'font-status' | null = null
  let closed = 0
  const signals: Array<AbortSignal | null | undefined> = []
  const timers: Array<ReturnType<typeof setTimeout>> = []
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const realFetch = globalThis.fetch
  let expireDownload = () => {}
  const cleared = vi.spyOn(globalThis, 'clearTimeout')
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, delay, ...args) => {
    const timer = realSetTimeout(fn, delay, ...args)
    if (delay === 60_000) {
      timers.push(timer)
      expireDownload = () => {
        if (!cleared.mock.calls.some(([id]) => id === timer) && typeof fn === 'function')
          fn(...args)
      }
    }
    return timer
  })
  const server = createServer((req, res) => {
    const css = req.url === '/css'
    if (
      (css && stalled === 'headers') ||
      (css && stalled === 'css-body') ||
      (!css && stalled === 'font-body') ||
      (css && stalled === 'css-status') ||
      (!css && stalled === 'font-status')
    ) {
      if (stalled !== 'headers') {
        res.writeHead(stalled?.endsWith('status') ? 503 : 200, {
          'Content-Type': css ? 'text/css' : 'font/woff2',
        })
        res.write(css ? '@font-face{' : 'partial-font')
      }
      // Baseline without a deadline eventually finishes, then fails the
      // diagnostic assertion. This also closes requests if the test fails.
      timers.push(realSetTimeout(() => res.destroy(), 1_000))
      res.on('close', () => {
        closed++
      })
      if (stalled === 'headers') queueMicrotask(() => expireDownload())
      return
    }
    res.end(css ? FONT_CSS : Buffer.from('complete-font-bytes'))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture did not bind')
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    signals.push(init?.signal)
    const css = String(input).startsWith('https://fonts.googleapis.com/')
    return realFetch(`http://127.0.0.1:${address.port}/${css ? 'css' : 'font'}`, init).then(
      (response) => {
        // Run after headers have resolved and the plugin has started consuming
        // the body. A timer wrongly cleared at headers will not fire here.
        if ((css && stalled === 'css-body') || (!css && stalled === 'font-body')) {
          setImmediate(() => expireDownload())
        }
        return response
      },
    )
  })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  context.onTestFinished(async () => {
    vi.restoreAllMocks()
    for (const timer of timers) realClearTimeout(timer)
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(root, { recursive: true, force: true })
  })
  const runBuild = () =>
    build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [fontPlugin({ google: ['Inter:wght@400'], fallbackAdjust: false })],
    })
  return {
    root,
    signals,
    fetchSpy,
    warn,
    runBuild,
    closed: () => closed,
    expireDownload: () => expireDownload(),
    stall: (stage: typeof stalled) => {
      stalled = stage
    },
  }
}

describe('font download deadline through a real Vite build', () => {
  for (const stage of ['headers', 'css-body', 'font-body'] as const) {
    it(`aborts stalled ${stage}, warns and builds with the documented CDN fallback`, async (context) => {
      const f = await fixture(context)
      f.stall(stage)
      await f.runBuild()
      expect(f.warn.mock.calls.flat().join('\n')).toContain('exceeded its 60s download budget')
      expect(f.signals.length).toBeGreaterThan(0)
      expect(f.signals.every((signal) => signal === f.signals[0] && signal?.aborted)).toBe(true)
      await vi.waitFor(() => expect(f.closed()).toBeGreaterThan(0))
      expect(readFileSync(join(f.root, 'dist/index.html'), 'utf8')).toContain(
        'https://fonts.googleapis.com/css2',
      )
      expect(() => readdirSync(join(f.root, 'node_modules/.cache/zero-fonts'))).toThrow()
      // A failed partial download must not poison the following build/cache.
      f.stall(null)
      await f.runBuild()
      expect(readFileSync(join(f.root, 'dist/assets/fonts/test.woff2'), 'utf8')).toBe(
        'complete-font-bytes',
      )
    })
  }

  for (const stage of ['css-status', 'font-status'] as const) {
    it(`aborts the unfinished ${stage} error body before using the CDN`, async (context) => {
      const f = await fixture(context)
      f.stall(stage)
      await f.runBuild()
      expect(f.warn.mock.calls.flat().join('\n')).toContain(
        stage === 'css-status' ? 'CSS: 503' : 'Failed to download font',
      )
      expect(f.signals.every((signal) => signal?.aborted)).toBe(true)
      await vi.waitFor(() => expect(f.closed()).toBeGreaterThan(0))
      expect(readFileSync(join(f.root, 'dist/index.html'), 'utf8')).toContain(
        'https://fonts.googleapis.com/css2',
      )
    })
  }

  it('clears the deadline after success and uses the complete cache without network', async (context) => {
    const f = await fixture(context)
    await f.runBuild()
    const signal = f.signals[0]
    expect(signal).toBeInstanceOf(AbortSignal)
    f.expireDownload()
    expect(signal?.aborted).toBe(false)
    f.fetchSpy.mockClear()
    f.fetchSpy.mockRejectedValue(new Error('warm builds must not fetch'))
    await f.runBuild()
    expect(f.fetchSpy).not.toHaveBeenCalled()
    expect(f.warn).not.toHaveBeenCalled()
    expect(readFileSync(join(f.root, 'dist/assets/fonts/test.woff2'), 'utf8')).toBe(
      'complete-font-bytes',
    )
    expect(readFileSync(join(f.root, 'dist/index.html'), 'utf8')).not.toContain(
      'https://fonts.googleapis.com/css2',
    )
  })
})
