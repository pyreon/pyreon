/** @jsxImportSource @pyreon/core */
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
