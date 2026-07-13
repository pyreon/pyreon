/** @jsxImportSource @pyreon/core */
import { For } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import type { VirtualItem } from '@tanstack/virtual-core'
import { useVirtualizer } from '../use-virtualizer'
import { useWindowVirtualizer } from '../use-window-virtualizer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createScrollContainer(height = 300): HTMLDivElement {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientHeight', { value: height, configurable: true })
  Object.defineProperty(container, 'offsetHeight', { value: height, configurable: true })
  Object.defineProperty(container, 'offsetWidth', { value: 300, configurable: true })
  // A large scrollHeight so programmatic scroll offsets aren't clamped (happy-dom
  // has no layout — scrollHeight defaults to 0, which clamps scrollToOffset to 0).
  Object.defineProperty(container, 'scrollHeight', { value: 10_000 * 40, configurable: true })
  let st = 0
  Object.defineProperty(container, 'scrollTop', {
    get: () => st,
    set: (v: number) => {
      st = v
    },
    configurable: true,
  })
  document.body.appendChild(container)
  return container
}

function driveScroll(container: HTMLElement, offset: number): void {
  ;(container as HTMLElement & { scrollTop: number }).scrollTop = offset
  container.dispatchEvent(new Event('scroll'))
}

type V = ReturnType<typeof useVirtualizer<HTMLElement, HTMLElement>>

/** Mount a fine-grained `item()`-driven list; returns the virtualizer + DOM. */
function mountItemList(
  count: number,
  container: HTMLElement,
  onStyleRun?: () => void,
): { v: V; host: HTMLElement; unmount: () => void } {
  let v!: V
  const host = document.createElement('div')
  container.appendChild(host)
  const App = () => {
    v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
      count,
      getScrollElement: () => container,
      estimateSize: () => 40,
      overscan: 2,
    }))
    return (
      <div>
        <For each={() => v.virtualItems()} by={(it: VirtualItem) => it.index}>
          {(it: VirtualItem) => {
            const m = v.item(it.index)
            return (
              <div
                class="row"
                data-i={String(it.index)}
                style={() => {
                  onStyleRun?.()
                  return `top:${m.start()}px;height:${m.size()}px;order:${m.lane()}`
                }}
              >
                r{it.index}
              </div>
            )
          }}
        </For>
      </div>
    )
  }
  const dispose = mount(<App />, host)
  return {
    v,
    host,
    unmount: () => {
      if (typeof dispose === 'function') dispose()
      host.remove()
    },
  }
}

const styleOf = (container: HTMLElement, index: number): string =>
  (container.querySelector(`[data-i="${index}"]`) as HTMLElement | null)?.getAttribute('style') ?? ''

// ─── item() — the fine-grained per-index measurement contract ────────────────

describe('useVirtualizer — item() fine-grained measurement', () => {
  it('seeds correct start/size/lane at mount', () => {
    const container = createScrollContainer()
    const { unmount } = mountItemList(100, container)
    // Fixed 40px rows → index N at top:N*40; single-lane list → lane 0.
    expect(styleOf(container, 0)).toBe('top: 0px; height: 40px; order: 0;')
    expect(styleOf(container, 2)).toBe('top: 80px; height: 40px; order: 0;')
    unmount()
    container.remove()
  })

  it('REPOSITIONS staying rows on a dynamic remeasure (the captured-item staleness fix)', () => {
    const container = createScrollContainer()
    const { v, unmount } = mountItemList(100, container)
    expect(styleOf(container, 1)).toContain('top: 40px')
    expect(styleOf(container, 3)).toContain('top: 120px')

    // Row 0 grows 40 → 200 (a measureElement result). Every row below shifts +160.
    v.instance.resizeItem(0, 200)

    // These rows STAYED in the window (same index/key, callback NOT re-run) — the
    // captured `<For>` item would be stale here; item()'s per-index signals fix it.
    expect(styleOf(container, 0)).toContain('height: 200px')
    expect(styleOf(container, 1)).toContain('top: 200px')
    expect(styleOf(container, 3)).toContain('top: 280px')
    unmount()
    container.remove()
  })

  it('fires ZERO style re-runs for staying rows across a redundant update', () => {
    const container = createScrollContainer()
    let styleRuns = 0
    const { v, unmount } = mountItemList(10000, container, () => {
      styleRuns++
    })
    const mountRuns = styleRuns
    expect(mountRuns).toBeGreaterThan(0)
    // Re-emit with the SAME window (no scroll): a fixed-size list keeps every
    // row's start/size invariant → Object.is-gated signals never fire.
    v.instance._willUpdate()
    v.instance.measure() // force a recompute + emit
    expect(styleRuns - mountRuns).toBe(0)
    unmount()
    container.remove()
  })

  it('gives a re-entering index a FRESH signal (leak-free pruning)', () => {
    const container = createScrollContainer()
    const { unmount } = mountItemList(10000, container)
    expect(styleOf(container, 0)).toContain('top: 0px')
    // Scroll far away — index 0 leaves the window, its row unmounts + its signal
    // is pruned. Scroll back — a fresh row for index 0 seeds the correct position.
    driveScroll(container, 40000)
    expect(container.querySelector('[data-i="0"]')).toBeNull()
    driveScroll(container, 0)
    expect(styleOf(container, 0)).toContain('top: 0px')
    unmount()
    container.remove()
  })

  it('lazily allocates only the fields a row reads (per-field, not all three)', () => {
    // Even rows read start() only; odd rows read size() only. So the sync loop
    // sees rows with `start` present / `size` absent AND rows with `start` absent
    // / `size` present — exercising the lazy-per-field guards in both directions.
    // Both must still update on a remeasure.
    const container = createScrollContainer()
    let v!: V
    const host = document.createElement('div')
    container.appendChild(host)
    const App = () => {
      v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 40,
        overscan: 2,
      }))
      return (
        <div>
          <For each={() => v.virtualItems()} by={(it: VirtualItem) => it.index}>
            {(it: VirtualItem) => {
              const m = v.item(it.index)
              return it.index % 2 === 0 ? (
                <div data-i={String(it.index)} style={() => `top:${m.start()}px`}>
                  r{it.index}
                </div>
              ) : (
                <div data-i={String(it.index)} style={() => `height:${m.size()}px`}>
                  r{it.index}
                </div>
              )
            }}
          </For>
        </div>
      )
    }
    const dispose = mount(<App />, host)
    expect(styleOf(container, 2)).toBe('top: 80px;') // even → start
    expect(styleOf(container, 1)).toBe('height: 40px;') // odd → size
    v.instance.resizeItem(0, 200) // sync runs across mixed field-subset rows
    expect(styleOf(container, 2)).toBe('top: 240px;') // even row repositioned (+160)
    expect(styleOf(container, 3)).toBe('height: 40px;') // odd row size unchanged
    if (typeof dispose === 'function') dispose()
    host.remove()
    container.remove()
  })

  it('is zero-cost until item() is called (captured pattern pays nothing)', () => {
    // A list that never calls item() must not incur per-index signal work — the
    // registry stays inactive. We assert the captured pattern still renders and
    // updates on scroll (behavioral proof the inactive path is intact).
    const container = createScrollContainer()
    let v!: V
    const host = document.createElement('div')
    container.appendChild(host)
    const App = () => {
      v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
        count: 10000,
        getScrollElement: () => container,
        estimateSize: () => 40,
        overscan: 2,
      }))
      return (
        <div>
          <For each={() => v.virtualItems()} by={(it: VirtualItem) => it.index}>
            {(it: VirtualItem) => (
              <div class="crow" data-i={String(it.index)} style={`top:${it.start}px`}>
                r{it.index}
              </div>
            )}
          </For>
        </div>
      )
    }
    const dispose = mount(<App />, host)
    expect(container.querySelector('.crow[data-i="0"]')).not.toBeNull()
    driveScroll(container, 40000)
    expect(container.querySelector('.crow[data-i="0"]')).toBeNull()
    expect(container.querySelector('.crow[data-i="1000"]')).not.toBeNull()
    if (typeof dispose === 'function') dispose()
    host.remove()
    container.remove()
  })
})

// ─── listener leak-safety (Class D) ──────────────────────────────────────────

describe('useVirtualizer — scroll/resize listener cleanup on unmount', () => {
  it('removes every scroll listener it added (no leak)', () => {
    const container = createScrollContainer()
    const added = new Map<string, number>()
    const removed = new Map<string, number>()
    const origAdd = container.addEventListener.bind(container)
    const origRemove = container.removeEventListener.bind(container)
    container.addEventListener = ((type: string, ...rest: unknown[]) => {
      added.set(type, (added.get(type) ?? 0) + 1)
      return (origAdd as (t: string, ...r: unknown[]) => void)(type, ...rest)
    }) as typeof container.addEventListener
    container.removeEventListener = ((type: string, ...rest: unknown[]) => {
      removed.set(type, (removed.get(type) ?? 0) + 1)
      return (origRemove as (t: string, ...r: unknown[]) => void)(type, ...rest)
    }) as typeof container.removeEventListener

    const { unmount } = mountItemList(1000, container)
    // virtual-core attaches a `scroll` listener to the element.
    expect(added.get('scroll') ?? 0).toBeGreaterThan(0)

    unmount()
    // Every listener type that was added must have been removed at least as often.
    for (const [type, addCount] of added) {
      expect(removed.get(type) ?? 0).toBeGreaterThanOrEqual(addCount)
    }
    container.remove()
  })
})

// ─── scrollToIndex (previously untested) ─────────────────────────────────────

describe('useVirtualizer — scrollToIndex wiring', () => {
  it('computes the right offset and calls the scrollToFn', () => {
    // happy-dom's `scrollTo` is a no-op, so we assert the offset scrollToIndex
    // hands the (overridable) scrollToFn — index 500 × 40px, align:start → 20000.
    const container = createScrollContainer()
    let capturedOffset = -1
    let v!: V
    const host = document.createElement('div')
    container.appendChild(host)
    const App = () => {
      v = useVirtualizer<HTMLElement, HTMLElement>(() => ({
        count: 10000,
        getScrollElement: () => container,
        estimateSize: () => 40,
        overscan: 2,
        scrollToFn: (offset) => {
          capturedOffset = offset
        },
      }))
      return (
        <For each={() => v.virtualItems()} by={(it: VirtualItem) => it.index}>
          {(it: VirtualItem) => <div data-i={String(it.index)}>r{it.index}</div>}
        </For>
      )
    }
    const dispose = mount(<App />, host)
    v.instance.scrollToIndex(500, { align: 'start' })
    expect(capturedOffset).toBe(500 * 40)
    if (typeof dispose === 'function') dispose()
    host.remove()
    container.remove()
  })
})

// ─── window virtualizer item() parity ────────────────────────────────────────

describe('useWindowVirtualizer — item() parity', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { value: 400, writable: true, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true })
  })

  it('exposes item() with reactive start/size/lane', () => {
    let v!: ReturnType<typeof useWindowVirtualizer<HTMLElement>>
    const host = document.createElement('div')
    document.body.appendChild(host)
    const App = () => {
      v = useWindowVirtualizer<HTMLElement>(() => ({ count: 1000, estimateSize: () => 40 }))
      return (
        <div>
          <For each={() => v.virtualItems()} by={(it: VirtualItem) => it.index}>
            {(it: VirtualItem) => {
              const m = v.item(it.index)
              return (
                <div data-i={String(it.index)} style={() => `top:${m.start()}px;order:${m.lane()}`}>
                  r{it.index}
                </div>
              )
            }}
          </For>
        </div>
      )
    }
    const dispose = mount(<App />, host)
    expect(styleOf(host, 0)).toBe('top: 0px; order: 0;')
    // Remeasure updates the staying row.
    v.instance.resizeItem(0, 140)
    expect(styleOf(host, 1)).toContain('top: 140px')
    if (typeof dispose === 'function') dispose()
    host.remove()
  })
})
