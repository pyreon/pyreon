import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { useVirtualizer, useWindowVirtualizer } from '../index'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mountWith<T>(fn: () => T): { result: T; unmount: () => void } {
  let result: T | undefined
  const el = document.createElement('div')
  document.body.appendChild(el)
  const Wrapper = () => {
    result = fn()
    return null
  }
  const unmount = mount(<Wrapper />, el)
  return {
    result: result!,
    unmount: () => {
      unmount()
      el.remove()
    },
  }
}

function createScrollContainer(height = 200): HTMLDivElement {
  const container = document.createElement('div')
  Object.defineProperty(container, 'offsetHeight', { value: height })
  Object.defineProperty(container, 'offsetWidth', { value: 300 })
  Object.defineProperty(container, 'scrollHeight', { value: 10000 })
  Object.defineProperty(container, 'clientHeight', { value: height })
  document.body.appendChild(container)
  return container
}

// ─── useVirtualizer — virtualItems signal ──────────────────────────────────

describe('useVirtualizer — virtualItems signal', () => {
  it('returns a signal that holds an array of VirtualItem', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    const items = virt.virtualItems()
    expect(Array.isArray(items)).toBe(true)
    expect(items.length).toBeGreaterThan(0)
    unmount()
    container.remove()
  })

  it('virtual items have index, start, end, size, key properties', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    const items = virt.virtualItems()
    expect(items.length).toBeGreaterThan(0)
    const first = items[0]!
    expect(typeof first.index).toBe('number')
    expect(typeof first.start).toBe('number')
    expect(typeof first.end).toBe('number')
    expect(typeof first.size).toBe('number')
    expect(first.key).toBeDefined()
    unmount()
    container.remove()
  })

  it('first item starts at index 0', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.virtualItems()[0]!.index).toBe(0)
    unmount()
    container.remove()
  })
})

// ─── useVirtualizer — totalSize signal ─────────────────────────────────────

describe('useVirtualizer — totalSize signal', () => {
  it('returns count * estimateSize for uniform items', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.totalSize()).toBe(5000) // 100 * 50
    unmount()
    container.remove()
  })

  it('includes padding in totalSize', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 10,
        getScrollElement: () => container,
        estimateSize: () => 50,
        paddingStart: 20,
        paddingEnd: 30,
      })),
    )

    expect(virt.totalSize()).toBe(550) // 10*50 + 20 + 30
    unmount()
    container.remove()
  })

  it('includes gaps in totalSize', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 10,
        getScrollElement: () => container,
        estimateSize: () => 50,
        gap: 10,
      })),
    )

    expect(virt.totalSize()).toBe(590) // 10*50 + 9*10
    unmount()
    container.remove()
  })

  it('returns 0 when count is 0', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 0,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.totalSize()).toBe(0)
    unmount()
    container.remove()
  })
})

// ─── useVirtualizer — count changes update virtualItems ────────────────────

describe('useVirtualizer — count changes update virtualItems', () => {
  it('increasing count increases totalSize', () => {
    const container = createScrollContainer()
    const count = signal(100)
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: count(),
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.totalSize()).toBe(5000)

    count.set(200)
    expect(virt.totalSize()).toBe(10000)

    count.set(50)
    expect(virt.totalSize()).toBe(2500)
    unmount()
    container.remove()
  })

  it('setting count to 0 empties virtualItems', () => {
    const container = createScrollContainer()
    const count = signal(100)
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: count(),
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.virtualItems().length).toBeGreaterThan(0)

    count.set(0)
    expect(virt.virtualItems()).toHaveLength(0)
    expect(virt.totalSize()).toBe(0)
    unmount()
    container.remove()
  })

  it('growing count from 0 creates virtualItems', () => {
    const container = createScrollContainer()
    const count = signal(0)
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: count(),
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.virtualItems()).toHaveLength(0)

    count.set(100)
    expect(virt.virtualItems().length).toBeGreaterThan(0)
    expect(virt.totalSize()).toBe(5000)
    unmount()
    container.remove()
  })
})

// ─── useVirtualizer — estimateSize callback ────────────────────────────────

describe('useVirtualizer — estimateSize callback', () => {
  it('uses the provided estimateSize for totalSize calculation', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 10,
        getScrollElement: () => container,
        estimateSize: () => 100,
      })),
    )

    expect(virt.totalSize()).toBe(1000) // 10 * 100
    unmount()
    container.remove()
  })

  it('reactive estimateSize updates totalSize after measure()', () => {
    const container = createScrollContainer()
    const itemSize = signal(50)
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => itemSize(),
      })),
    )

    expect(virt.totalSize()).toBe(5000)

    itemSize.set(100)
    virt.instance.measure()
    expect(virt.totalSize()).toBe(10000)
    unmount()
    container.remove()
  })

  it('small estimateSize produces more visible items', () => {
    const container = createScrollContainer(200)
    const { result: small, unmount: u1 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 20,
        overscan: 0,
      })),
    )

    const { result: large, unmount: u2 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 100,
        overscan: 0,
      })),
    )

    // Smaller items = more items visible in same container
    expect(small.virtualItems().length).toBeGreaterThanOrEqual(large.virtualItems().length)
    u1()
    u2()
    container.remove()
  })
})

// ─── useVirtualizer — additional options ───────────────────────────────────

describe('useVirtualizer — additional options', () => {
  it('overscan controls extra items rendered', () => {
    const container = createScrollContainer(200)
    const { result: noOverscan, unmount: u1 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 35,
        overscan: 0,
      })),
    )

    const { result: withOverscan, unmount: u2 } = mountWith(() =>
      useVirtualizer(() => ({
        count: 1000,
        getScrollElement: () => container,
        estimateSize: () => 35,
        overscan: 10,
      })),
    )

    expect(withOverscan.virtualItems().length).toBeGreaterThanOrEqual(
      noOverscan.virtualItems().length,
    )
    u1()
    u2()
    container.remove()
  })

  it('horizontal mode works', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 100,
        horizontal: true,
      })),
    )

    expect(virt.totalSize()).toBe(10000)
    expect(virt.virtualItems().length).toBeGreaterThan(0)
    unmount()
    container.remove()
  })

  it('enabled: false produces empty output', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
        enabled: false,
      })),
    )

    expect(virt.virtualItems()).toHaveLength(0)
    expect(virt.totalSize()).toBe(0)
    unmount()
    container.remove()
  })

  it('isScrolling starts as false', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(virt.isScrolling()).toBe(false)
    unmount()
    container.remove()
  })

  it('exposes instance with scrollToIndex and scrollToOffset', () => {
    const container = createScrollContainer()
    const { result: virt, unmount } = mountWith(() =>
      useVirtualizer(() => ({
        count: 100,
        getScrollElement: () => container,
        estimateSize: () => 50,
      })),
    )

    expect(typeof virt.instance.scrollToIndex).toBe('function')
    expect(typeof virt.instance.scrollToOffset).toBe('function')
    expect(typeof virt.instance.measureElement).toBe('function')
    unmount()
    container.remove()
  })
})

// ─── useWindowVirtualizer ──────────────────────────────────────────────────

describe('useWindowVirtualizer — comprehensive', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'scrollY', {
      value: 0,
      writable: true,
      configurable: true,
    })
  })

  it('returns virtualItems, totalSize, isScrolling signals', () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
      })),
    )

    expect(typeof virt.virtualItems).toBe('function')
    expect(typeof virt.totalSize).toBe('function')
    expect(typeof virt.isScrolling).toBe('function')
    expect(Array.isArray(virt.virtualItems())).toBe(true)
    expect(typeof virt.totalSize()).toBe('number')
    expect(typeof virt.isScrolling()).toBe('boolean')
    unmount()
  })

  it('totalSize equals count * estimateSize', () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
      })),
    )

    expect(virt.totalSize()).toBe(5000)
    unmount()
  })

  it('reactive count updates totalSize', () => {
    const count = signal(100)
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: count(),
        estimateSize: () => 50,
      })),
    )

    expect(virt.totalSize()).toBe(5000)

    count.set(200)
    expect(virt.totalSize()).toBe(10000)

    count.set(0)
    expect(virt.totalSize()).toBe(0)
    unmount()
  })

  it('reactive estimateSize updates totalSize after measure()', () => {
    const size = signal(50)
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => size(),
      })),
    )

    expect(virt.totalSize()).toBe(5000)

    size.set(100)
    virt.instance.measure()
    expect(virt.totalSize()).toBe(10000)
    unmount()
  })

  it('SSR-safe — handles missing document/window', () => {
    const origDoc = globalThis.document
    const origWin = globalThis.window
    try {
      // @ts-expect-error — temporarily remove globals
      delete globalThis.document
      // @ts-expect-error
      delete globalThis.window

      const { totalSize } = useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
      }))

      expect(totalSize()).toBeGreaterThanOrEqual(0)
    } finally {
      globalThis.document = origDoc
      globalThis.window = origWin
    }
  })

  it('gap affects totalSize', () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 10,
        estimateSize: () => 50,
        gap: 10,
      })),
    )

    expect(virt.totalSize()).toBe(590) // 10*50 + 9*10
    unmount()
  })

  it('enabled: false produces empty output', () => {
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
        enabled: false,
      })),
    )

    expect(virt.virtualItems()).toHaveLength(0)
    expect(virt.totalSize()).toBe(0)
    unmount()
  })

  it('onChange callback is forwarded', () => {
    const spy = vi.fn()
    const { result: virt, unmount } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 100,
        estimateSize: () => 50,
        onChange: spy,
      })),
    )

    const onChange = virt.instance.options.onChange
    if (onChange) {
      onChange(virt.instance, false)
    }

    expect(spy).toHaveBeenCalled()
    unmount()
  })

  it('overscan controls extra rendered items', () => {
    const { result: small, unmount: u1 } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
        overscan: 0,
      })),
    )

    const { result: large, unmount: u2 } = mountWith(() =>
      useWindowVirtualizer(() => ({
        count: 1000,
        estimateSize: () => 35,
        overscan: 10,
      })),
    )

    expect(large.virtualItems().length).toBeGreaterThanOrEqual(small.virtualItems().length)
    u1()
    u2()
  })
})
