/**
 * The three measurements, each in real Chromium against the harness's static
 * server, each page in a FRESH browser context (empty cache, no V8 code cache,
 * its own renderer): every load is a first visit.
 *
 *  - `inventory`  bundle bytes: what a first load of `/products` requests.
 *  - `timedLoad`  time to interactive under the throttle.
 *  - `memoryPass` retained JS heap after load and after scripted sessions.
 *
 * The definitions are in `examples/real-bench/README.md` ("App metrics").
 */
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import type { Browser, CDPSession, Page } from 'playwright'
import { type Arm, outDir } from './arms'
import type { Bundle, FirstLoadRequest, Heap, MemorySample, Sizes, TtiSample } from './result'
import type { Throttle } from './run'
import { BLANK_PATH, brotliSize, gzipSize, walk } from './serve'
import { buildSession, runSteps, ttiProbe } from './session'

/** Two forced collections in a row closer than this are "settled" (as `bench-fair.ts`'s STABLE_DELTA). */
export const GC_STABLE_BYTES = 16 * 1024
export const GC_MAX_ROUNDS = 10
const LOAD_TIMEOUT_MS = 120_000
const STEP_TIMEOUT_MS = 30_000

// ─── timer ──────────────────────────────────────────────────────────────────

export async function measureClockQuantum(
  browser: Browser,
  base: string,
): Promise<{ crossOriginIsolated: boolean; quantumMs: number }> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  try {
    await page.goto(`${base}${BLANK_PATH}`, { waitUntil: 'load' })
    return await page.evaluate(() => {
      let smallest = Number.POSITIVE_INFINITY
      let prev = performance.now()
      const end = prev + 150
      while (performance.now() < end) {
        const t = performance.now()
        if (t > prev) {
          if (t - prev < smallest) smallest = t - prev
          prev = t
        }
      }
      return { crossOriginIsolated: globalThis.crossOriginIsolated === true, quantumMs: smallest }
    })
  } finally {
    await ctx.close()
  }
}

// ─── bundle ─────────────────────────────────────────────────────────────────

function kindOf(path: string): FirstLoadRequest['kind'] {
  const ext = extname(path)
  if (ext === '.js' || ext === '.mjs') return 'js'
  if (ext === '.css') return 'css'
  if (ext === '' || ext === '.html') return 'html'
  return 'other'
}

const zero = (): Sizes => ({ raw: 0, gzip: 0, brotli: 0 })
const add = (a: Sizes, b: Sizes): Sizes => ({
  raw: a.raw + b.raw,
  gzip: a.gzip + b.gzip,
  brotli: a.brotli + b.brotli,
})
const sized = (b: Uint8Array): Sizes => ({
  raw: b.length,
  gzip: gzipSize(b),
  brotli: brotliSize(b),
})

/** Waits until the list shows the full catalogue count. */
async function waitForList(page: Page): Promise<void> {
  const { initialCount } = ttiProbe()
  await page.waitForFunction(
    (want) => document.getElementById('count')?.textContent?.trim() === want,
    initialCount,
    {
      timeout: LOAD_TIMEOUT_MS,
    },
  )
}

/**
 * Untimed, unthrottled first load of `/products`: every same-origin request
 * until the list is shown and the network is idle, each fetched again by the
 * harness without compression and sized here (raw, gzip -9, brotli 11), so
 * every arm is sized the same way. Plus every .js/.css file of the build.
 */
export async function inventory(browser: Browser, base: string, arm: Arm): Promise<Bundle> {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const paths = new Set<string>()
  page.on('request', (r) => {
    if (r.url().startsWith(base)) paths.add(new URL(r.url()).pathname)
  })
  try {
    await page.goto(`${base}/products`, { waitUntil: 'load' })
    await waitForList(page)
    await page.waitForLoadState('networkidle')
  } finally {
    await ctx.close()
  }
  const firstLoad: FirstLoadRequest[] = []
  for (const path of [...paths].sort()) {
    const res = await fetch(`${base}${path}`, { headers: { 'accept-encoding': 'identity' } })
    const body = new Uint8Array(await res.arrayBuffer())
    firstLoad.push({ path, kind: kindOf(path), ...sized(body) })
  }
  const firstLoadTotals = { js: zero(), css: zero(), html: zero() }
  for (const r of firstLoad)
    if (r.kind !== 'other') firstLoadTotals[r.kind] = add(firstLoadTotals[r.kind], r)

  const root = outDir(arm)
  const build = { js: { ...zero(), files: 0 }, css: { ...zero(), files: 0 } }
  for (const rel of walk(root)) {
    const kind = kindOf(rel)
    if (kind !== 'js' && kind !== 'css') continue
    const s = sized(readFileSync(join(root, rel)))
    build[kind] = { ...add(build[kind], s), files: build[kind].files + 1 }
  }
  return { firstLoad, firstLoadTotals, build }
}

// ─── time to interactive ────────────────────────────────────────────────────

interface ProbeConfig {
  query: string
  initialCount: string
  expectedCount: string
  retryMs: number
}

/**
 * Installed with `addInitScript`, so it runs before any of the page's own
 * script. SELF-CONTAINED (serialised into the page).
 *
 * When `#count` first shows the unfiltered count (the list is in the DOM), it
 * schedules one input event in a NEW task (a user's keystroke arrives as its
 * own task): the native value setter puts the query in `#search`, then an
 * `input` event. The moment `#count` shows the filtered count (a
 * MutationObserver callback, so no paint is included) is the time to
 * interactive. If the app has not reacted `retryMs` later, the input is sent
 * again and `attempts` counts it; a run where any load needed a retry is not
 * publishable (the time then has `retryMs` resolution).
 */
function ttiProbeScript(cfg: ProbeConfig): void {
  const out = {
    done: false,
    ttiMs: -1,
    firstRenderMs: -1,
    firstAttemptMs: -1,
    attempts: 0,
    longTasks: [] as Array<[number, number]>,
  }
  ;(window as unknown as { __RB_TTI__: typeof out }).__RB_TTI__ = out
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) out.longTasks.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    // no long-task support: the list stays empty
  }
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  let retry: ReturnType<typeof setTimeout> | undefined
  const count = () => document.getElementById('count')?.textContent?.trim()
  const attempt = () => {
    if (out.done) return
    const search = document.getElementById('search') as HTMLInputElement | null
    if (!search || !setValue) return
    out.attempts++
    if (out.firstAttemptMs < 0) out.firstAttemptMs = performance.now()
    setValue.call(search, cfg.query)
    search.dispatchEvent(new Event('input', { bubbles: true }))
    check()
    if (!out.done) retry = setTimeout(attempt, cfg.retryMs)
  }
  const check = () => {
    if (out.done) return
    const c = count()
    if (out.firstRenderMs < 0 && c === cfg.initialCount) {
      out.firstRenderMs = performance.now()
      setTimeout(attempt, 0)
    }
    if (out.firstRenderMs >= 0 && c === cfg.expectedCount) {
      out.ttiMs = performance.now()
      out.done = true
      mo.disconnect()
      clearTimeout(retry)
    }
  }
  const mo = new MutationObserver(check)
  mo.observe(document, { subtree: true, childList: true, characterData: true })
}

async function applyThrottle(cdp: CDPSession, t: Throttle): Promise<void> {
  if (t.cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: t.cpuRate })
  if (t.latencyMs > 0 || t.downloadKbps > 0) {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: t.latencyMs,
      downloadThroughput: t.downloadKbps > 0 ? (t.downloadKbps * 1000) / 8 : -1,
      uploadThroughput: t.uploadKbps > 0 ? (t.uploadKbps * 1000) / 8 : -1,
    })
  }
}

export async function timedLoad(
  browser: Browser,
  base: string,
  throttle: Throttle,
): Promise<TtiSample> {
  const { query, initialCount, expectedCount } = ttiProbe()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  try {
    const cdp = await ctx.newCDPSession(page)
    await applyThrottle(cdp, throttle)
    await page.addInitScript(ttiProbeScript, { query, initialCount, expectedCount, retryMs: 50 })
    await page.goto(`${base}/products`, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS })
    await page.waitForFunction(
      () => (window as unknown as { __RB_TTI__?: { done: boolean } }).__RB_TTI__?.done === true,
      null,
      {
        timeout: LOAD_TIMEOUT_MS,
      },
    )
    if (errors.length > 0) throw new Error(`page error during a timed load: ${errors[0]}`)
    return await page.evaluate(() => {
      const probe = (
        window as unknown as {
          __RB_TTI__: Omit<
            TtiSample,
            'fcpMs' | 'domContentLoadedMs' | 'loadEventEndMs' | 'transferBytes'
          > & { done: boolean }
        }
      ).__RB_TTI__
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
      return {
        ttiMs: probe.ttiMs,
        firstRenderMs: probe.firstRenderMs,
        firstAttemptMs: probe.firstAttemptMs,
        attempts: probe.attempts,
        fcpMs: fcp ? fcp.startTime : -1,
        domContentLoadedMs: nav.domContentLoadedEventEnd,
        loadEventEndMs: nav.loadEventEnd,
        longTasks: probe.longTasks,
        transferBytes: nav.transferSize + resources.reduce((s, r) => s + r.transferSize, 0),
      }
    })
  } finally {
    await ctx.close()
  }
}

// ─── memory ─────────────────────────────────────────────────────────────────

/**
 * Forces full collections through the DevTools protocol until two in a row
 * differ by less than `GC_STABLE_BYTES`, then reads the heap and DOM counters.
 * Chromium/V8 only: the "never force GC" rule in the benchmarks guide is about
 * JavaScriptCore under bun, not V8.
 */
async function settledHeap(cdp: CDPSession): Promise<Heap> {
  let prev = Number.POSITIVE_INFINITY
  let rounds = 0
  let usage = { usedSize: 0, totalSize: 0 }
  while (rounds < GC_MAX_ROUNDS) {
    await cdp.send('HeapProfiler.collectGarbage')
    rounds++
    usage = await cdp.send('Runtime.getHeapUsage')
    if (Math.abs(prev - usage.usedSize) < GC_STABLE_BYTES) break
    prev = usage.usedSize
  }
  const dom = await cdp.send('Memory.getDOMCounters')
  return {
    usedBytes: usage.usedSize,
    totalBytes: usage.totalSize,
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    documents: dom.documents,
    gcRounds: rounds,
  }
}

export async function memoryPass(
  browser: Browser,
  base: string,
  sessions: number,
): Promise<MemorySample> {
  const blankCtx = await browser.newContext()
  let blank: Heap
  try {
    const page = await blankCtx.newPage()
    const cdp = await blankCtx.newCDPSession(page)
    await page.goto(`${base}${BLANK_PATH}`, { waitUntil: 'load' })
    blank = await settledHeap(cdp)
  } finally {
    await blankCtx.close()
  }

  const ctx = await browser.newContext()
  try {
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('HeapProfiler.enable')
    await page.goto(`${base}/products`, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS })
    await waitForList(page)
    await page.waitForLoadState('networkidle')
    const afterLoad = await settledHeap(cdp)
    const sessionSteps: number[][] = []
    let afterSession: Heap | null = null
    for (let k = 1; k <= sessions; k++) {
      const r = await page.evaluate(runSteps, {
        steps: buildSession(k),
        timeoutMs: STEP_TIMEOUT_MS,
      })
      if (r.failure) throw new Error(`session ${k} failed during the memory pass: ${r.failure}`)
      sessionSteps.push(r.durations)
      if (k === 1) afterSession = await settledHeap(cdp)
    }
    const afterSessions = await settledHeap(cdp)
    if (errors.length > 0) throw new Error(`page error during the memory pass: ${errors[0]}`)
    return {
      blank,
      afterLoad,
      afterSession: afterSession ?? afterLoad,
      afterSessions,
      sessionSteps,
    }
  } finally {
    await ctx.close()
  }
}
