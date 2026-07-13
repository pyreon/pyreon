/** @jsxImportSource @pyreon/core */
import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVirtualizer } from '../use-virtualizer'
import { useWindowVirtualizer } from '../use-window-virtualizer'

// Real-Chromium smoke for @pyreon/virtual.
//
// happy-dom can't do real layout/measurement — `getBoundingClientRect`,
// ResizeObserver, and window scroll are all faked or inert, so the
// happy-dom unit tests had to `Object.defineProperty(el, 'offsetHeight', …)`
// to simulate a viewport. That means they CANNOT catch the class of bug
// where the virtualizer's scroll element is never measured (scrollRect
// stays {0,0} → empty range → ZERO rows render while totalSize is still
// correct) — the exact failure mode behind the empty app-showcase virtual
// lists. These tests assert the REAL contract in Chromium: a bounded
// visible window mounts (NOT all N rows), totalSize spans every row, and
// scrolling re-virtualizes the window.
//
// `useWindowVirtualizer` had ZERO real-browser coverage before this file —
// only happy-dom unit tests where window scroll is inert. This is its
// first proof that window-based virtualization actually works.

// `measureElement` drives a real ResizeObserver, which emits the well-known,
// benign "ResizeObserver loop completed with undelivered notifications" signal
// when a measurement triggers a reflow inside the same frame. It is NOT a test
// failure — swallow it so vitest-browser's strict unhandled-error catcher
// doesn't surface it. (Chrome/spec both classify this as a non-error notice.)
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    if (e.message?.includes('ResizeObserver loop')) {
      e.stopImmediatePropagation()
      e.preventDefault()
    }
  })
}

const COUNT = 1000
const ROW = 40
const TOTAL = COUNT * ROW

function rowStyle(size: number, start: number): string {
  return `position:absolute;top:0;left:0;width:100%;height:${size}px;transform:translateY(${start}px);box-sizing:border-box;`
}

afterEach(() => {
  // Reset window scroll between tests so the window-virtualizer specs start
  // from a known offset.
  window.scrollTo(0, 0)
})

describe('useVirtualizer — real Chromium', () => {
  function ElementList() {
    const parentRef = signal<HTMLElement | null>(null)
    const v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
      count: COUNT,
      getScrollElement: () => parentRef(),
      estimateSize: () => ROW,
      overscan: 5,
    }))
    return (
      <div
        ref={(el: HTMLElement | null) => parentRef.set(el)}
        data-testid="el-scroll"
        style="height:300px;overflow:auto;"
      >
        <div
          data-testid="el-sizer"
          style={() => `height:${v.totalSize()}px;width:100%;position:relative;`}
        >
          {() =>
            v.virtualItems().map((row) => (
              <div class="el-row" data-index={String(row.index)} key={String(row.key)} style={rowStyle(row.size, row.start)}>
                Item {row.index}
              </div>
            ))
          }
        </div>
      </div>
    )
  }

  it('mounts only the visible window (+overscan), not all 1000 rows', async () => {
    const { container, unmount } = mountInBrowser(<ElementList />)
    const rows = () => container.querySelectorAll('.el-row')
    // The virtualizer must measure the 300px scroll element and populate.
    await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
    // 300px / 40px ≈ 8 visible + 5 overscan each side ≈ <30 — far below 1000.
    expect(rows().length).toBeLessThan(100)
    // The sizer spans every row so the scrollbar is accurate.
    const sizer = container.querySelector<HTMLElement>('[data-testid=el-sizer]')!
    expect(sizer.style.height).toBe(`${TOTAL}px`)
    // The first window starts at row 0.
    expect(container.textContent).toContain('Item 0')
    unmount()
  })

  it('re-virtualizes the window on scroll (row 0 unmounts, a far row mounts)', async () => {
    const { container, unmount } = mountInBrowser(<ElementList />)
    const scroll = container.querySelector<HTMLElement>('[data-testid=el-scroll]')!
    await vi.waitFor(() => expect(container.querySelectorAll('.el-row').length).toBeGreaterThan(0))
    expect(container.textContent).toContain('Item 0')

    // Scroll to ~row 500 (500 × 40 = 20000px).
    scroll.scrollTop = 20000
    await vi.waitFor(() => {
      expect(container.textContent).not.toContain('Item 0')
    })
    // Still bounded after scroll (window moved, not grew).
    expect(container.querySelectorAll('.el-row').length).toBeLessThan(100)
    // A far-down row is now mounted.
    const indices = [...container.querySelectorAll('.el-row')].map((el) =>
      Number(el.getAttribute('data-index')),
    )
    expect(Math.min(...indices)).toBeGreaterThan(400)
    unmount()
  })
})

describe('useVirtualizer — <For> + item() fine-grained + real measurement', () => {
  // The fine-grained pattern: keyed <For> (staying rows never re-render) +
  // item() (per-index reactive position) so a dynamic remeasure repositions
  // staying rows correctly. Real Chromium is where measureElement actually
  // measures (happy-dom has no layout). This is the proof that the captured-
  // <For>-item staleness fix works with REAL getBoundingClientRect measurement.
  function DynamicList() {
    const parentRef = signal<HTMLElement | null>(null)
    const expanded = signal(false)
    const v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
      count: COUNT,
      getScrollElement: () => parentRef(),
      estimateSize: () => ROW,
      overscan: 3,
      measureElement: (el: Element) => el.getBoundingClientRect().height,
    }))
    return (
      <div>
        <button data-testid="expand" onClick={() => expanded.set(true)}>
          expand
        </button>
        <div
          ref={(el: HTMLElement | null) => parentRef.set(el)}
          data-testid="dyn-scroll"
          style="height:300px;overflow:auto;"
        >
          <div style={() => `height:${v.totalSize()}px;width:100%;position:relative;`}>
            <For each={() => v.virtualItems()} by={(row) => row.index}>
              {(row) => {
                const m = v.item(row.index)
                return (
                  <div
                    class="dyn-row"
                    data-index={String(row.index)}
                    ref={(el: HTMLElement | null) => el && v.instance.measureElement(el)}
                    style={() =>
                      `position:absolute;top:0;left:0;width:100%;transform:translateY(${m.start()}px);box-sizing:border-box;`
                    }
                  >
                    {/* Row 0 grows tall when expanded; others stay ROW-high. */}
                    <div
                      style={() =>
                        `height:${row.index === 0 && expanded() ? 200 : ROW}px;`
                      }
                    >
                      Item {row.index}
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </div>
      </div>
    )
  }

  const topOf = (container: HTMLElement, index: number): number => {
    const el = container.querySelector<HTMLElement>(`.dyn-row[data-index="${index}"]`)
    const m = el?.style.transform.match(/translateY\(([\d.]+)px\)/)
    return m ? Number(m[1]) : Number.NaN
  }

  it('repositions a STAYING row below when row 0 is remeasured taller', async () => {
    const { container, unmount } = mountInBrowser(<DynamicList />)
    await vi.waitFor(() => expect(container.querySelectorAll('.dyn-row').length).toBeGreaterThan(0))
    // Row 3 sits at 3 × ROW initially (fixed estimate, measured to the same).
    await vi.waitFor(() => expect(topOf(container, 3)).toBeCloseTo(3 * ROW, 0))

    // Expand row 0 → its real height jumps to 200 → measureElement remeasures →
    // every row below shifts down. Row 3 STAYS in the window (same key), so its
    // <For> callback does NOT re-run — item()'s signal is what repositions it.
    container.querySelector<HTMLElement>('[data-testid=expand]')!.click()
    await vi.waitFor(() => expect(topOf(container, 3)).toBeGreaterThan(3 * ROW + 100))
    unmount()
  })
})

describe('useWindowVirtualizer — real Chromium (first browser coverage)', () => {
  function WindowList() {
    const v = useWindowVirtualizer<HTMLElement>(() => ({
      count: COUNT,
      estimateSize: () => ROW,
      overscan: 5,
    }))
    return (
      <div
        data-testid="win-sizer"
        style={() => `height:${v.totalSize()}px;width:100%;position:relative;`}
      >
        {() =>
          v.virtualItems().map((row) => (
            <div class="win-row" data-index={String(row.index)} key={String(row.key)} style={rowStyle(row.size, row.start)}>
              Item {row.index}
            </div>
          ))
        }
      </div>
    )
  }

  it('mounts only the visible window against the window viewport, not all 1000', async () => {
    const { container, unmount } = mountInBrowser(<WindowList />)
    const rows = () => container.querySelectorAll('.win-row')
    await vi.waitFor(() => expect(rows().length).toBeGreaterThan(0))
    // Bounded to the viewport window (+overscan) — far below 1000.
    expect(rows().length).toBeLessThan(100)
    // totalSize spans every row (the document is scrollable to the full height).
    const sizer = container.querySelector<HTMLElement>('[data-testid=win-sizer]')!
    expect(sizer.style.height).toBe(`${TOTAL}px`)
    // The first window includes row 0 (list starts at the top of the document).
    expect(container.textContent).toContain('Item 0')
    unmount()
  })

  it('re-virtualizes on WINDOW scroll (row 0 unmounts, a far row mounts)', async () => {
    const { container, unmount } = mountInBrowser(<WindowList />)
    await vi.waitFor(() =>
      expect(container.querySelectorAll('.win-row').length).toBeGreaterThan(0),
    )
    expect(container.textContent).toContain('Item 0')

    // Scroll the WINDOW deep into the list (~row 500).
    window.scrollTo(0, 20000)
    await vi.waitFor(() => {
      expect(container.textContent).not.toContain('Item 0')
    })
    expect(container.querySelectorAll('.win-row').length).toBeLessThan(100)
    const indices = [...container.querySelectorAll('.win-row')].map((el) =>
      Number(el.getAttribute('data-index')),
    )
    // A far-down row mounted — proves window-scroll drove the virtualizer.
    expect(Math.max(...indices)).toBeGreaterThan(300)
    unmount()
  })
})
