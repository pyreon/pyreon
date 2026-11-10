/**
 * Real-Chromium measurements for one page load of `/items`.
 *
 * Every timed load uses a FRESH browser context (empty HTTP cache, no V8 code
 * cache): a first visit. The window is
 *
 *     navigationStart  →  `stacks:island-ready` mark
 *
 * The mark is set by the counter component's own post-mount hook (React
 * `useEffect`, Svelte `onMount`, Vue `onMounted`, Solid/Pyreon `onMount`,
 * Preact `useEffect` inside the Astro island). For a full-hydration stack it
 * fires after the whole root has hydrated; for Astro after the one island has.
 * Qwik never hydrates, so its window ends at `loadEventEnd` and is NOT a
 * hydration time — its interactive cost shows up in first-click latency.
 *
 * As in `examples/benchmark/bench-hydration.ts`, the framework's work is
 * separated from the browser's layout: a Chromium trace of the window is
 * split into
 *   - script  — union of V8 compile / evaluate / function-call / microtask
 *               intervals on the renderer main thread, MINUS the layout
 *               intervals nested inside them (forced layouts);
 *   - layout  — union of style recalc / layout / pre-paint / paint intervals;
 *   - busy    — union of all main-thread tasks (everything the thread did).
 * script is "framework + app JS on the critical path": parse/compile of the
 * shipped bundles, the hydration walk, and the app's own code. It is not
 * the hydration walk alone — the full-stack frameworks offer no way to time
 * their walk in isolation the way bench-hydration's hand-driven fixtures can.
 */
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import type { Browser, Page } from 'playwright'
import { READY_MARK } from './gate'

/**
 * Compression OFF everywhere: Chromium would otherwise advertise gzip/br and the
 * servers that compress by default (Next.js, react-router-serve's compression(),
 * sirv's precompressed assets) would compress while the others do not. Overriding
 * Accept-Encoding to identity is honoured by Chromium (verified: Next answers
 * without Content-Encoding). Bytes are reported separately, compressed by the harness.
 */
const NO_COMPRESSION = { extraHTTPHeaders: { 'accept-encoding': 'identity' } }

const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'v8.execute',
  'v8',
  'toplevel',
  'loading',
]

const SCRIPT_EVENTS = new Set([
  'EvaluateScript',
  'v8.compile',
  'v8.compileModule',
  'v8.evaluateModule',
  'FunctionCall',
  'RunMicrotasks',
  'TimerFire',
  'EventDispatch',
  'v8.run',
  'V8.Execute',
  'v8.callFunction',
])
const LAYOUT_EVENTS = new Set([
  'Layout',
  'UpdateLayoutTree',
  'RecalculateStyles',
  'PrePaint',
  'Paint',
  'Layerize',
  'UpdateLayer',
  'UpdateLayerTree',
])

interface TraceEvent {
  name: string
  cat: string
  ph: string
  ts: number
  dur?: number
  pid: number
  tid: number
  args?: { data?: { documentLoaderURL?: string; isLoadingMainFrame?: boolean } }
}

type Interval = [number, number]

function union(xs: Interval[]): Interval[] {
  const s = [...xs].sort((a, b) => a[0] - b[0])
  const out: Interval[] = []
  for (const iv of s) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}
function clip(xs: Interval[], lo: number, hi: number): Interval[] {
  return xs.map(([a, b]): Interval => [Math.max(a, lo), Math.min(b, hi)]).filter(([a, b]) => b > a)
}
const total = (xs: Interval[]) => xs.reduce((s, [a, b]) => s + (b - a), 0)
/** |A \ B| for two unions. */
function minus(a: Interval[], b: Interval[]): number {
  let overlap = 0
  for (const [a0, a1] of a) for (const [b0, b1] of b) overlap += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))
  return total(a) - overlap
}

export interface LoadSample {
  /** navigationStart → ready mark (or loadEventEnd for resumable), ms. */
  windowMs: number
  scriptMs: number
  layoutMs: number
  busyMs: number
  /** in-page click → counter text "Count: 1", ms (performance.now(), 0.1 ms clamp, not cross-origin isolated). */
  clickMs: number
  /** responseEnd of the document, ms from navigationStart. */
  docResponseEndMs: number
}

export async function timedLoad(browser: Browser, url: string, resumable: boolean): Promise<LoadSample> {
  const ctx = await browser.newContext(NO_COMPRESSION)
  const page = await ctx.newPage()
  try {
    await browser.startTracing(page, { categories: TRACE_CATEGORIES })
    await page.goto(url, { waitUntil: 'load' })
    if (!resumable) {
      await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, READY_MARK, { timeout: 20_000 })
    }
    const pageSide = await page.evaluate((m) => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const mark = performance.getEntriesByName(m)[0]
      return { mark: mark ? mark.startTime : -1, load: nav.loadEventEnd, responseEnd: nav.responseEnd }
    }, READY_MARK)
    const buf = await browser.stopTracing()
    const events = (JSON.parse(buf.toString()) as { traceEvents: TraceEvent[] }).traceEvents
    const nav = events
      .filter(
        (e) =>
          e.name === 'navigationStart' &&
          e.args?.data?.isLoadingMainFrame === true &&
          (e.args.data.documentLoaderURL ?? '').includes('/items'),
      )
      .pop()
    if (!nav) throw new Error('trace has no main-frame navigationStart for /items')
    const markEv = events.find((e) => e.name === READY_MARK && e.pid === nav.pid)
    const endTs = resumable
      ? nav.ts + pageSide.load * 1000
      : markEv
        ? markEv.ts
        : nav.ts + pageSide.mark * 1000
    const main = events.filter((e) => e.pid === nav.pid && e.tid === nav.tid && e.ph === 'X' && e.dur !== undefined)
    const iv = (pred: (e: TraceEvent) => boolean) =>
      clip(union(main.filter(pred).map((e): Interval => [e.ts, e.ts + (e.dur as number)])), nav.ts, endTs)
    const script = iv((e) => SCRIPT_EVENTS.has(e.name))
    const layout = iv((e) => LAYOUT_EVENTS.has(e.name))
    const busy = iv((e) => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask')

    // First interaction: a click dispatched in-page, timed to the DOM change.
    const clickMs = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const btn = document.getElementById('counter')
          if (!btn) return reject(new Error('no #counter'))
          const done = () => btn.textContent?.trim() === 'Count: 1'
          const t0 = performance.now()
          const mo = new MutationObserver(() => {
            if (done()) {
              mo.disconnect()
              resolve(performance.now() - t0)
            }
          })
          mo.observe(btn, { subtree: true, childList: true, characterData: true })
          btn.click()
          if (done()) {
            mo.disconnect()
            resolve(performance.now() - t0)
          }
          setTimeout(() => reject(new Error('click did not update the counter in 10 s')), 10_000)
        }),
    )
    return {
      windowMs: (endTs - nav.ts) / 1000,
      scriptMs: minus(script, layout) / 1000,
      layoutMs: total(layout) / 1000,
      busyMs: total(busy) / 1000,
      clickMs,
      docResponseEndMs: pageSide.responseEnd,
    }
  } finally {
    await ctx.close()
  }
}

export interface ScriptEntry {
  url: string
  /** How the HTML references it. */
  how: 'script' | 'modulepreload' | 'dynamic'
  /** Top-level code ran during the load (V8 precise coverage, separate untimed load). */
  executed: boolean
  raw: number
  gzip: number
  brotli: number
}
export interface Inventory {
  html: { raw: number; gzip: number; brotli: number; inlineScriptBytes: number }
  scripts: ScriptEntry[]
  totals: { raw: number; gzip: number; brotli: number; count: number }
  /** Requests the page made during load (any type), for context. */
  requests: number
}

const gz = (b: Uint8Array) => gzipSync(b, { level: 9 }).length
const br = (b: Uint8Array) =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

/**
 * Untimed load that inventories the first-load JavaScript: every script the
 * page requests until it is interactive and the network is idle, each fetched
 * again by the harness uncompressed and compressed here (gzip -9, brotli 11) so
 * every arm is sized the same way whatever its server does.
 */
export async function inventory(browser: Browser, base: string, resumable: boolean): Promise<Inventory> {
  const htmlRes = await fetch(`${base}/items`, { headers: { 'accept-encoding': 'identity' } })
  const html = new Uint8Array(await htmlRes.arrayBuffer())
  const text = new TextDecoder().decode(html)
  const abs = (u: string) => new URL(u.replaceAll('&amp;', '&'), `${base}/items`).href
  const scriptSrc = new Set(
    [...text.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => abs(m[1] as string)),
  )
  const preload = new Set(
    [...text.matchAll(/<link\b[^>]*rel="modulepreload"[^>]*>/g)]
      .map((m) => /href="([^"]+)"/.exec(m[0])?.[1])
      .filter((x): x is string => !!x)
      .map(abs),
  )
  const inlineScriptBytes = [...text.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].reduce(
    (s, m) => s + Buffer.byteLength(m[1] as string),
    0,
  )

  const ctx = await browser.newContext(NO_COMPRESSION)
  const page: Page = await ctx.newPage()
  const jsUrls = new Set<string>()
  let requests = 0
  page.on('request', () => requests++)
  page.on('response', (r) => {
    const ct = r.headers()['content-type'] ?? ''
    if (r.request().resourceType() === 'script' || /javascript/.test(ct) || /\.m?js(\?|$)/.test(r.url())) {
      if (r.url().startsWith(base)) jsUrls.add(r.url())
    }
  })
  await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false })
  await page.goto(`${base}/items`, { waitUntil: 'load' })
  if (!resumable) {
    await page.waitForFunction((m) => performance.getEntriesByName(m).length > 0, READY_MARK, { timeout: 20_000 })
  }
  await page.waitForLoadState('networkidle')
  const cov = await page.coverage.stopJSCoverage()
  await ctx.close()
  const executed = new Set(
    cov.filter((c) => (c.functions[0]?.ranges[0]?.count ?? 0) > 0).map((c) => c.url),
  )
  const scripts: ScriptEntry[] = []
  for (const url of [...new Set([...jsUrls, ...scriptSrc, ...preload])].sort()) {
    const r = await fetch(url, { headers: { 'accept-encoding': 'identity' } })
    const b = new Uint8Array(await r.arrayBuffer())
    scripts.push({
      url: url.replace(base, ''),
      how: scriptSrc.has(url) ? 'script' : preload.has(url) ? 'modulepreload' : 'dynamic',
      executed: executed.has(url),
      raw: b.length,
      gzip: gz(b),
      brotli: br(b),
    })
  }
  const totals = scripts.reduce(
    (t, s) => ({ raw: t.raw + s.raw, gzip: t.gzip + s.gzip, brotli: t.brotli + s.brotli, count: t.count + 1 }),
    { raw: 0, gzip: 0, brotli: 0, count: 0 },
  )
  return {
    html: { raw: html.length, gzip: gz(html), brotli: br(html), inlineScriptBytes },
    scripts,
    totals,
    requests,
  }
}
