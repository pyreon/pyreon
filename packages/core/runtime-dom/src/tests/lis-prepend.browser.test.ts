import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

// Real-Chromium coverage for the `computeForLis` known-slot fast path.
// happy-dom is fine for op-counting the LIS probes but doesn't prove the
// reconciler actually lays out the DOM in the right order after a prepend.
// A bug in the fast path would silently corrupt the DOM under real CSS
// layout — caught here, not in the vitest happy-dom suite.

function buildRows(count: number, offset = 0): Array<{ id: number; label: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + offset,
    label: `row-${i + offset}`,
  }))
}

describe('runtime-dom LIS prepend fast path', () => {
  it('prepends 100 rows to a 100-row list, DOM matches the signal order', async () => {
    type Row = { id: number; label: string }
    const rows = signal<Row[]>(buildRows(100, 0))
    const { container, unmount } = mountInBrowser(
      h(
        'ul',
        { id: 'list' },
        For({
          each: rows,
          by: (r: Row) => r.id,
          children: (r: Row) => h('li', { 'data-id': String(r.id) }, r.label),
        }),
      ),
    )

    let items = container.querySelectorAll<HTMLLIElement>('#list li')
    expect(items).toHaveLength(100)
    expect(items[0]?.dataset.id).toBe('0')
    expect(items[99]?.dataset.id).toBe('99')

    // Prepend 100 new rows with ids 100..199. Final list: [100..199, 0..99].
    const prepended = buildRows(100, 100)
    rows.set([...prepended, ...rows()])
    await flush()

    items = container.querySelectorAll<HTMLLIElement>('#list li')
    expect(items).toHaveLength(200)
    // First 100 items must be the prepended rows in order.
    expect(items[0]?.dataset.id).toBe('100')
    expect(items[99]?.dataset.id).toBe('199')
    // Next 100 must be the original rows in original order.
    expect(items[100]?.dataset.id).toBe('0')
    expect(items[199]?.dataset.id).toBe('99')
    unmount()
  })

  it('measured prepend wall-clock stays in the expected range', async () => {
    // HONEST framing: the LIS fast path saves ~50-100 µs on a 1k prepend.
    // The full prepend cost is dominated by DOM work (~5-20 ms in real
    // Chromium for 1k <li> nodes). This test measures the full wall-clock
    // to give a realistic upper bound — the LIS save is a single-digit
    // percent improvement, not a headline win.
    //
    // Assertion bound is intentionally loose (< 500 ms). The purpose is
    // to anchor a "is this catastrophically slow" ceiling, not to prove
    // the LIS fix is responsible for any particular chunk of time.
    type Row = { id: number; label: string }
    const rows = signal<Row[]>(buildRows(1000, 0))
    const { container, unmount } = mountInBrowser(
      h(
        'ul',
        { id: 'perf-list' },
        For({
          each: rows,
          by: (r: Row) => r.id,
          children: (r: Row) => h('li', { 'data-id': String(r.id) }, r.label),
        }),
      ),
    )

    // Warm up — first mount allocates backing arrays.
    await flush()
    expect(container.querySelectorAll('#perf-list li')).toHaveLength(1000)

    const prepended = buildRows(1000, 1000)
    const t0 = performance.now()
    rows.set([...prepended, ...rows()])
    await flush()
    const elapsed = performance.now() - t0

    // oxlint-disable-next-line no-console
    console.log(`[lis-prepend] 1k→2k prepend wall-clock: ${elapsed.toFixed(2)}ms`)

    expect(container.querySelectorAll('#perf-list li')).toHaveLength(2000)
    // Loose ceiling. Real Chromium typically lands at 10-50ms. We're not
    // asserting the LIS win — we're asserting the whole path didn't break.
    expect(elapsed).toBeLessThan(500)
    unmount()
  })
})
