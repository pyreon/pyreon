/**
 * `reportWebVitals` — Core Web Vitals (LCP, CLS, INP) plus FCP and TTFB,
 * measured with `PerformanceObserver`. `@pyreon/zero/web-vitals`.
 *
 * Semantics follow Google's `web-vitals` library (v4/v5):
 *  - **LCP** — the last `largest-contentful-paint` entry, finalized on the
 *    first `keydown`/`pointerdown`/`click` or when the page is hidden.
 *    Measured relative to `activationStart` (prerender-aware). Not reported
 *    when the page was hidden before the entry (background tab).
 *  - **CLS** — the largest SESSION WINDOW of `layout-shift` entries without
 *    `hadRecentInput` (shifts < 1 s apart, window ≤ 5 s).
 *  - **INP** — `event` timing entries with an `interactionId`, observed with
 *    `durationThreshold: 40`; the value is the worst interaction after
 *    ignoring one per 50 interactions (a p98 estimate), reported only once an
 *    interaction happened.
 *  - **FCP** — the `first-contentful-paint` paint entry minus
 *    `activationStart`, dropped if the page was hidden first.
 *  - **TTFB** — `responseStart − activationStart` from the navigation entry.
 *  - Every metric is reported ONCE per page view when the page is hidden
 *    (and again with the final value on the next change) — like `web-vitals`
 *    without `reportAllChanges`.
 *
 * Deviations, stated plainly:
 *  - **Client-side navigation.** On a route change (`router.afterEach`) the
 *    CLS and INP of the route being left are reported with `navigationType:
 *    'soft-navigation'` for the NEXT route and reset, so each route gets its
 *    own CLS/INP. LCP, FCP and TTFB are hard-load metrics — browsers expose no
 *    stable soft-navigation LCP yet — so they are reported once, for the
 *    initial load only, and are finalized by the first route change.
 *  - No `rating` thresholds object beyond the standard good/poor bands, no
 *    attribution build, no bfcache-restore re-reporting.
 *  - INP's first-input fallback for browsers without `interactionId` is not
 *    implemented; such browsers simply report no INP.
 */
import { getActiveRouter } from '@pyreon/router'

export type WebVitalName = 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB'

export interface WebVitalMetric {
  name: WebVitalName
  /** ms for timing metrics, unitless for CLS. */
  value: number
  /** Change since this metric was last reported for the same page view. */
  delta: number
  rating: 'good' | 'needs-improvement' | 'poor'
  /** Unique per metric per page view (hard load or client route). */
  id: string
  /** The route path the metric belongs to. */
  path: string
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'prerender' | 'soft-navigation'
}

export interface ReportWebVitalsOptions {
  /**
   * Router to follow for client-side navigations. Defaults to the active
   * `@pyreon/router` instance at call time. Pass `false` to disable
   * per-route reporting.
   */
  router?: { afterEach(hook: (to: { path: string }) => void): () => void } | false
}

const THRESHOLDS: Record<WebVitalName, [number, number]> = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
}

function rate(name: WebVitalName, v: number): WebVitalMetric['rating'] {
  const [good, poor] = THRESHOLDS[name]
  return v <= good ? 'good' : v <= poor ? 'needs-improvement' : 'poor'
}

let idSeq = 0

/**
 * Report Core Web Vitals to `handler`. Returns a function that stops
 * observing (and flushes nothing). Browser-only — a no-op on the server.
 *
 * @example
 * ```ts
 * import { reportWebVitals, sendToBeacon } from '@pyreon/zero/web-vitals'
 *
 * reportWebVitals(sendToBeacon('/api/vitals'))
 * ```
 */
export function reportWebVitals(
  handler: (metric: WebVitalMetric) => void,
  options: ReportWebVitalsOptions = {},
): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return () => {}

  const disposers: (() => void)[] = []
  const nav = performance.getEntriesByType('navigation')[0] as
    | (PerformanceNavigationTiming & { activationStart?: number })
    | undefined
  const activationStart = nav?.activationStart ?? 0
  const hardNavType: WebVitalMetric['navigationType'] =
    activationStart > 0
      ? 'prerender'
      : nav?.type === 'back_forward'
        ? 'back-forward'
        : nav?.type === 'reload'
          ? 'reload'
          : 'navigate'
  // web-vitals' getVisibilityWatcher: hidden before we started → Infinity
  // is replaced by 0 so background-tab loads report no LCP/FCP.
  let firstHiddenTime = document.visibilityState === 'hidden' ? 0 : Infinity

  let path = location.pathname
  let navType = hardNavType

  type Slot = { id: string; path: string; navType: WebVitalMetric['navigationType']; value: number; reported: number | null }
  const slot = (): Slot => ({ id: `v1-${Date.now()}-${++idSeq}`, path, navType, value: -1, reported: null })

  const emit = (name: WebVitalName, s: Slot): void => {
    if (s.value < 0 || s.reported === s.value) return
    const delta = s.value - (s.reported ?? 0)
    s.reported = s.value
    handler({ name, value: s.value, delta, rating: rate(name, s.value), id: s.id, path: s.path, navigationType: s.navType })
  }

  const observe = (type: string, cb: (list: PerformanceEntryList) => void, init: Record<string, unknown> = {}): PerformanceObserver | null => {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return null
    try {
      const po = new PerformanceObserver((l) => cb(l.getEntries()))
      po.observe({ type, buffered: true, ...init } as PerformanceObserverInit)
      disposers.push(() => po.disconnect())
      return po
    } catch {
      return null
    }
  }

  // ─── TTFB ───────────────────────────────────────────────────────────
  if (nav && nav.responseStart > 0) {
    const s = slot()
    s.value = Math.max(nav.responseStart - activationStart, 0)
    emit('TTFB', s)
  }

  // ─── FCP ────────────────────────────────────────────────────────────
  const fcp = slot()
  const fcpPo = observe('paint', (entries) => {
    for (const e of entries) {
      if (e.name !== 'first-contentful-paint') continue
      fcpPo?.disconnect()
      if (e.startTime < firstHiddenTime) {
        fcp.value = Math.max(e.startTime - activationStart, 0)
        emit('FCP', fcp)
      }
    }
  })

  // ─── LCP ────────────────────────────────────────────────────────────
  const lcp = slot()
  let lcpFinal = false
  const lcpPo = observe('largest-contentful-paint', (entries) => {
    if (lcpFinal) return
    const last = entries[entries.length - 1]
    if (last && last.startTime < firstHiddenTime) lcp.value = Math.max(last.startTime - activationStart, 0)
  })
  const finalizeLcp = (): void => {
    if (lcpFinal) return
    lcpFinal = true
    if (lcpPo) {
      const pending = lcpPo.takeRecords()
      const last = pending[pending.length - 1]
      if (last && last.startTime < firstHiddenTime) lcp.value = Math.max(last.startTime - activationStart, 0)
      lcpPo.disconnect()
    }
    emit('LCP', lcp)
  }
  for (const type of ['keydown', 'click', 'pointerdown']) {
    // `once` + capture, like web-vitals; `setTimeout` lets the input's own
    // LCP candidate (if any) land first.
    const fn = (): void => void setTimeout(finalizeLcp, 0)
    addEventListener(type, fn, { once: true, capture: true })
    disposers.push(() => removeEventListener(type, fn, { capture: true }))
  }

  // ─── CLS ────────────────────────────────────────────────────────────
  let cls = slot()
  cls.value = 0
  let sessionValue = 0
  let sessionFirst = 0
  let sessionLast = 0
  const clsPo = observe('layout-shift', (entries) => {
    for (const e of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (e.hadRecentInput) continue
      if (sessionValue > 0 && e.startTime - sessionLast < 1000 && e.startTime - sessionFirst < 5000) {
        sessionValue += e.value
      } else {
        sessionValue = e.value
        sessionFirst = e.startTime
      }
      sessionLast = e.startTime
      if (sessionValue > cls.value) cls.value = sessionValue
    }
  })
  const clsReady = clsPo !== null

  // ─── INP ────────────────────────────────────────────────────────────
  let inp = slot()
  let interactions = new Map<number, number>() // interactionId → max duration
  let interactionCount = 0
  const computeInp = (): void => {
    if (interactions.size === 0) return
    const sorted = [...interactions.values()].sort((a, b) => b - a)
    const idx = Math.min(sorted.length - 1, Math.floor(interactionCount / 50))
    inp.value = sorted[idx]!
  }
  observe(
    'event',
    (entries) => {
      for (const e of entries as (PerformanceEntry & { interactionId?: number })[]) {
        const iid = e.interactionId
        if (!iid) continue
        const prev = interactions.get(iid)
        if (prev === undefined) interactionCount++
        if (prev === undefined || e.duration > prev) interactions.set(iid, e.duration)
        // Keep only the 10 worst (web-vitals keeps the longest 10).
        if (interactions.size > 10) {
          let minK = -1
          let minV = Infinity
          for (const [k, v] of interactions) {
            if (v < minV) {
              minV = v
              minK = k
            }
          }
          interactions.delete(minK)
        }
      }
      computeInp()
    },
    { durationThreshold: 40 },
  )

  // ─── Flush on hide / route change ───────────────────────────────────
  const flushPerRoute = (): void => {
    if (clsReady) emit('CLS', cls)
    emit('INP', inp)
  }
  const onHidden = (): void => {
    if (document.visibilityState !== 'hidden') return
    if (firstHiddenTime === Infinity) firstHiddenTime = performance.now()
    finalizeLcp()
    flushPerRoute()
  }
  addEventListener('visibilitychange', onHidden, true)
  addEventListener('pagehide', onHidden, true)
  disposers.push(() => {
    removeEventListener('visibilitychange', onHidden, true)
    removeEventListener('pagehide', onHidden, true)
  })

  const router = options.router === false ? null : (options.router ?? getActiveRouter())
  if (router) {
    disposers.push(
      router.afterEach((to) => {
        if (to.path === path) return
        finalizeLcp()
        flushPerRoute()
        path = to.path
        navType = 'soft-navigation'
        cls = slot()
        cls.value = 0
        sessionValue = 0
        inp = slot()
        interactions = new Map()
        interactionCount = 0
      }),
    )
  }

  return () => {
    for (const d of disposers.splice(0)) d()
  }
}

/**
 * A `reportWebVitals` handler that POSTs each metric as JSON with
 * `navigator.sendBeacon` (falls back to `fetch(..., { keepalive: true })`).
 *
 * @example
 * ```ts
 * reportWebVitals(sendToBeacon('/api/vitals'))
 * ```
 */
export function sendToBeacon(url: string): (metric: WebVitalMetric) => void {
  return (metric) => {
    const body = JSON.stringify(metric)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return
    void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {})
  }
}

/**
 * Server-side receiver for `sendToBeacon`: a middleware that accepts
 * `POST <path>` with a metric JSON body, validates its shape, hands it to
 * `onMetric`, and answers `204`. Malformed bodies get `400`.
 *
 * @example
 * ```ts
 * import { webVitalsEndpoint } from '@pyreon/zero/web-vitals'
 * createServer({ routes, middleware: [webVitalsEndpoint('/api/vitals', (m) => log.info(m))] })
 * ```
 */
export function webVitalsEndpoint(
  path: string,
  onMetric: (metric: WebVitalMetric, req: Request) => void | Promise<void>,
): (ctx: { req: Request; url: URL }) => Promise<Response | undefined> {
  const names = new Set<string>(['LCP', 'CLS', 'INP', 'FCP', 'TTFB'])
  return async (ctx) => {
    if (ctx.url.pathname !== path) return undefined
    if (ctx.req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
    let m: unknown
    try {
      const text = await ctx.req.text()
      if (text.length > 4096) return new Response(null, { status: 413 })
      m = JSON.parse(text)
    } catch {
      return new Response(null, { status: 400 })
    }
    const o = m as Record<string, unknown>
    if (
      !o || typeof o !== 'object' || typeof o.name !== 'string' || !names.has(o.name)
      || typeof o.value !== 'number' || !Number.isFinite(o.value)
      || typeof o.id !== 'string' || typeof o.path !== 'string'
    ) {
      return new Response(null, { status: 400 })
    }
    await onMetric(o as unknown as WebVitalMetric, ctx.req)
    return new Response(null, { status: 204 })
  }
}
