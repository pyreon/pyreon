import { afterEach, describe, expect, it } from 'vitest'
import type { WebVitalMetric } from '../web-vitals'
import { reportWebVitals } from '../web-vitals'

const frames = (n = 2) => new Promise<void>((r) => {
  let i = 0
  const tick = () => (++i >= n ? r() : requestAnimationFrame(tick))
  requestAnimationFrame(tick)
})
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function fakeRouter() {
  let hook: ((to: { path: string }) => void) | null = null
  return {
    afterEach(h: (to: { path: string }) => void) {
      hook = h
      return () => { hook = null }
    },
    go(path: string) { hook?.({ path }) },
  }
}

let stop: (() => void) | undefined
afterEach(() => {
  stop?.()
  document.body.innerHTML = ''
})

describe('reportWebVitals in real Chromium', () => {
  it('reports LCP once, finalized by the first input, with activation-relative value', async () => {
    const big = document.createElement('p')
    big.style.fontSize = '64px'
    big.textContent = 'Largest contentful paint candidate text'
    document.body.appendChild(big)
    await frames(3)
    const got: WebVitalMetric[] = []
    stop = reportWebVitals((m) => got.push(m), { router: false })
    await wait(50)
    expect(got.filter((m) => m.name === 'LCP')).toHaveLength(0) // not final before input
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wait(50)
    const lcp = got.filter((m) => m.name === 'LCP')
    expect(lcp).toHaveLength(1)
    expect(lcp[0]!.value).toBeGreaterThan(0)
    expect(lcp[0]!.delta).toBe(lcp[0]!.value)
    expect(['good', 'needs-improvement', 'poor']).toContain(lcp[0]!.rating)
    // A second input does not re-report.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
    await wait(50)
    expect(got.filter((m) => m.name === 'LCP')).toHaveLength(1)
  })

  it('reports CLS per route and resets on a client-side navigation', async () => {
    const router = fakeRouter()
    const got: WebVitalMetric[] = []
    const box = document.createElement('div')
    box.style.cssText = 'width:300px;height:100px;background:red'
    document.body.appendChild(box)
    await frames(3)
    stop = reportWebVitals((m) => got.push(m), { router })
    // Shift the box by inserting content above it (no recent input).
    const spacer = document.createElement('div')
    spacer.style.height = '150px'
    document.body.insertBefore(spacer, box)
    await frames(3)
    await wait(100)
    router.go('/next')
    const first = got.filter((m) => m.name === 'CLS')
    expect(first).toHaveLength(1)
    expect(first[0]!.value).toBeGreaterThan(0)
    expect(first[0]!.path).toBe(location.pathname)

    // New route: no shift yet → CLS 0 reported for it, as its own id, soft-navigation.
    router.go('/third')
    const cls = got.filter((m) => m.name === 'CLS')
    expect(cls).toHaveLength(2)
    expect(cls[1]!.value).toBe(0)
    expect(cls[1]!.path).toBe('/next')
    expect(cls[1]!.navigationType).toBe('soft-navigation')
    expect(cls[1]!.id).not.toBe(cls[0]!.id)
  })

  it('reports TTFB and FCP from the page load', async () => {
    const got: WebVitalMetric[] = []
    stop = reportWebVitals((m) => got.push(m), { router: false })
    await wait(50)
    expect(got.find((m) => m.name === 'TTFB')!.value).toBeGreaterThanOrEqual(0)
    expect(got.find((m) => m.name === 'FCP')!.value).toBeGreaterThan(0)
  })
})
