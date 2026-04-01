import { signal } from '@pyreon/reactivity'

// ─── Mock pragmatic-drag-and-drop ──────────────────────────────────────────

// Captured callback registrations for testing
let lastDraggableOpts: any = null
let lastDropTargetOpts: any = null
let lastMonitorOpts: any = null
let lastExternalDropOpts: any = null
let lastExternalMonitorOpts: any = null
const allDraggableOpts: any[] = []
const allDropTargetOpts: any[] = []

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: (opts: any) => {
    lastDraggableOpts = opts
    allDraggableOpts.push(opts)
    return () => {} // cleanup
  },
  dropTargetForElements: (opts: any) => {
    lastDropTargetOpts = opts
    allDropTargetOpts.push(opts)
    return () => {} // cleanup
  },
  monitorForElements: (opts: any) => {
    lastMonitorOpts = opts
    return () => {} // cleanup
  },
}))

vi.mock('@atlaskit/pragmatic-drag-and-drop/external/adapter', () => ({
  dropTargetForExternal: (opts: any) => {
    lastExternalDropOpts = opts
    return () => {} // cleanup
  },
  monitorForExternal: (opts: any) => {
    lastExternalMonitorOpts = opts
    return () => {} // cleanup
  },
}))

vi.mock('@atlaskit/pragmatic-drag-and-drop/external/file', () => ({
  containsFiles: () => true,
  getFiles: ({ source }: any) => source?._files ?? [],
}))

vi.mock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
  combine: (...fns: (() => void)[]) => () => fns.forEach((fn) => fn()),
}))

let lastAutoScrollOpts: any = null
vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: (opts: any) => {
    lastAutoScrollOpts = opts
    return () => {}
  },
}))

vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
  attachClosestEdge: (data: any) => data,
  extractClosestEdge: (data: any) => data?.__edge ?? null,
}))

beforeEach(() => {
  lastDraggableOpts = null
  lastDropTargetOpts = null
  lastMonitorOpts = null
  lastExternalDropOpts = null
  lastExternalMonitorOpts = null
  lastAutoScrollOpts = null
  allDraggableOpts.length = 0
  allDropTargetOpts.length = 0
})

// Helper to flush microtasks
const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve))

// ─── useDraggable integration ───────────────────────────────────────────────

describe('useDraggable integration', () => {
  it('initializes with isDragging false for a real element', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: '1', type: 'card' },
    })

    expect(isDragging()).toBe(false)
    el.remove()
  })

  it('supports drag handle option', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    const handle = document.createElement('span')
    el.appendChild(handle)
    document.body.appendChild(el)

    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: '1' },
      handle: () => handle,
    })

    expect(isDragging()).toBe(false)
    el.remove()
  })

  it('supports onDragStart and onDragEnd callbacks', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const startFn = vi.fn()
    const endFn = vi.fn()

    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: '1' },
      onDragStart: startFn,
      onDragEnd: endFn,
    })

    expect(isDragging()).toBe(false)
    // Callbacks are registered — verify no errors during setup
    el.remove()
  })

  it('disabled as reactive signal prevents drag', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const disabled = signal(true)

    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: '1' },
      disabled,
    })

    expect(isDragging()).toBe(false)
    disabled.set(false)
    // Switching disabled does not change isDragging by itself
    expect(isDragging()).toBe(false)
    el.remove()
  })

  it('dynamic data function is accepted', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const count = signal(0)

    const { isDragging } = useDraggable({
      element: () => el,
      data: () => ({ count: count(), type: 'counter' }),
    })

    expect(isDragging()).toBe(false)
    count.set(5)
    expect(isDragging()).toBe(false)
    el.remove()
  })
})

// ─── useDroppable integration ───────────────────────────────────────────────

describe('useDroppable integration', () => {
  it('initializes with isOver false for a real element', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isOver } = useDroppable({
      element: () => el,
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    el.remove()
  })

  it('supports data option as static object', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isOver } = useDroppable({
      element: () => el,
      data: { zone: 'target', accepts: 'card' },
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    el.remove()
  })

  it('supports data option as function', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const zoneType = signal('primary')

    const { isOver } = useDroppable({
      element: () => el,
      data: () => ({ zone: zoneType() }),
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    el.remove()
  })

  it('canDrop filter does not affect initial state', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isOver } = useDroppable({
      element: () => el,
      canDrop: (data) => data.type === 'task',
      onDragEnter: () => {},
      onDragLeave: () => {},
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    el.remove()
  })
})

// ─── useSortable integration ────────────────────────────────────────────────

describe('useSortable integration', () => {
  it('creates a complete sortable list with items attached to DOM', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ])

    const reorderedResults: typeof items extends ReturnType<typeof signal<infer T>> ? T : never[] =
      []

    const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
      items,
      by: (item) => item.id,
      onReorder: (newItems) => {
        reorderedResults.push(...newItems)
        items.set(newItems)
      },
    })

    // Build DOM
    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const elements = items().map((item) => {
      const li = document.createElement('li')
      li.textContent = item.name
      itemRef(item.id)(li)
      container.appendChild(li)
      return li
    })

    // Verify initial state
    expect(activeId()).toBeNull()
    expect(overId()).toBeNull()
    expect(overEdge()).toBeNull()

    // Verify accessibility attributes on all items
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i]!
      expect(el.getAttribute('role')).toBe('listitem')
      expect(el.getAttribute('aria-roledescription')).toBe('sortable item')
      expect(el.getAttribute('tabindex')).toBe('0')
      expect(el.dataset.pyreonSortKey).toBe(items()[i]!.id)
    }

    container.remove()
  })

  it('keyboard reorder: Alt+ArrowDown moves item down in vertical mode', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const els = items().map((item) => {
      const li = document.createElement('li')
      itemRef(item.id)(li)
      container.appendChild(li)
      return li
    })

    els[0]!.focus()

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )

    expect(reordered.length).toBe(1)
    expect(reordered[0]!.map((i) => i.id)).toEqual(['b', 'a', 'c'])

    container.remove()
  })

  it('keyboard reorder: Alt+ArrowRight moves item in horizontal mode', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'x' }, { id: 'y' }, { id: 'z' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
      axis: 'horizontal',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    containerRef(container)

    const els = items().map((item) => {
      const el = document.createElement('div')
      itemRef(item.id)(el)
      container.appendChild(el)
      return el
    })

    els[0]!.focus()

    // ArrowDown should NOT work in horizontal mode
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    // ArrowRight should work
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(1)
    expect(reordered[0]!.map((i) => i.id)).toEqual(['y', 'x', 'z'])

    container.remove()
  })

  it('does not reorder past boundaries', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: '1' }, { id: '2' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li1 = document.createElement('li')
    const li2 = document.createElement('li')
    itemRef('1')(li1)
    itemRef('2')(li2)
    container.appendChild(li1)
    container.appendChild(li2)

    // Try to move first item up (already at top)
    li1.focus()
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    // Try to move last item down (already at bottom)
    li2.focus()
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    container.remove()
  })

  it('preserves existing tabindex on items', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: '1' }])

    const { itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const el = document.createElement('div')
    el.setAttribute('tabindex', '-1')
    itemRef('1')(el)

    expect(el.getAttribute('tabindex')).toBe('-1')
  })
})

// ─── useFileDrop integration ────────────────────────────────────────────────

describe('useFileDrop integration', () => {
  it('initializes with both signals false for a real element', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isOver, isDraggingFiles } = useFileDrop({
      element: () => el,
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    expect(isDraggingFiles()).toBe(false)
    el.remove()
  })

  it('accepts accept, maxFiles, and disabled options together', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const disabled = signal(false)

    const { isOver, isDraggingFiles } = useFileDrop({
      element: () => el,
      accept: ['image/*', '.pdf', 'application/json'],
      maxFiles: 3,
      disabled,
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    expect(isDraggingFiles()).toBe(false)
    el.remove()
  })

  it('handles disabled as boolean', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isOver } = useFileDrop({
      element: () => el,
      disabled: true,
      onDrop: () => {},
    })

    expect(isOver()).toBe(false)
    el.remove()
  })
})

// ─── useDragMonitor integration ─────────────────────────────────────────────

describe('useDragMonitor integration', () => {
  it('creates monitor without options', async () => {
    const { useDragMonitor } = await import('../use-drag-monitor')
    const { isDragging, dragData } = useDragMonitor()

    expect(isDragging()).toBe(false)
    expect(dragData()).toBeNull()
  })

  it('creates monitor with full options', async () => {
    const { useDragMonitor } = await import('../use-drag-monitor')
    const starts: unknown[] = []
    const drops: unknown[] = []

    const { isDragging, dragData } = useDragMonitor({
      canMonitor: (data) => data.type === 'card',
      onDragStart: (data) => starts.push(data),
      onDrop: (source, target) => drops.push({ source, target }),
    })

    expect(isDragging()).toBe(false)
    expect(dragData()).toBeNull()
  })
})

// ─── Combined draggable + droppable setup ───────────────────────────────────

describe('combined draggable + droppable', () => {
  it('creates both on the same element without conflicts', async () => {
    const { useDraggable } = await import('../use-draggable')
    const { useDroppable } = await import('../use-droppable')

    const el = document.createElement('div')
    document.body.appendChild(el)

    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: '1', type: 'card' },
    })

    const { isOver } = useDroppable({
      element: () => el,
      canDrop: (data) => data.type === 'card',
      onDrop: () => {},
    })

    expect(isDragging()).toBe(false)
    expect(isOver()).toBe(false)
    el.remove()
  })

  it('multiple droppable zones can coexist', async () => {
    const { useDroppable } = await import('../use-droppable')
    const zone1 = document.createElement('div')
    const zone2 = document.createElement('div')
    document.body.appendChild(zone1)
    document.body.appendChild(zone2)

    const drop1 = useDroppable({
      element: () => zone1,
      data: { zone: 'left' },
      onDrop: () => {},
    })

    const drop2 = useDroppable({
      element: () => zone2,
      data: { zone: 'right' },
      onDrop: () => {},
    })

    expect(drop1.isOver()).toBe(false)
    expect(drop2.isOver()).toBe(false)
    zone1.remove()
    zone2.remove()
  })
})

// ─── Module exports ─────────────────────────────────────────────────────────

describe('module exports completeness', () => {
  it('exports all hooks and types from index', async () => {
    const mod = await import('../index')
    expect(typeof mod.useDraggable).toBe('function')
    expect(typeof mod.useDroppable).toBe('function')
    expect(typeof mod.useSortable).toBe('function')
    expect(typeof mod.useFileDrop).toBe('function')
    expect(typeof mod.useDragMonitor).toBe('function')
  })
})

// ─── useDraggable — callback coverage ──────────────────────────────────────

describe('useDraggable — callbacks via mock', () => {
  it('isDragging becomes true on onDragStart and false on onDrop', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const startFn = vi.fn()
    const endFn = vi.fn()

    const { isDragging } = useDraggable({
      element: () => el,
      data: { id: '1', type: 'card' },
      onDragStart: startFn,
      onDragEnd: endFn,
    })

    await flushMicrotasks()

    expect(lastDraggableOpts).not.toBeNull()

    // Trigger drag start
    lastDraggableOpts.onDragStart()
    expect(isDragging()).toBe(true)
    expect(startFn).toHaveBeenCalledOnce()

    // Trigger drop
    lastDraggableOpts.onDrop()
    expect(isDragging()).toBe(false)
    expect(endFn).toHaveBeenCalledOnce()

    el.remove()
  })

  it('getInitialData resolves static data', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDraggable({
      element: () => el,
      data: { id: '42', type: 'item' },
    })

    await flushMicrotasks()

    const data = lastDraggableOpts.getInitialData()
    expect(data).toEqual({ id: '42', type: 'item' })

    el.remove()
  })

  it('getInitialData resolves dynamic data function', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const count = signal(5)

    useDraggable({
      element: () => el,
      data: () => ({ count: count(), type: 'counter' }),
    })

    await flushMicrotasks()

    const data = lastDraggableOpts.getInitialData()
    expect(data.count).toBe(5)

    count.set(10)
    const data2 = lastDraggableOpts.getInitialData()
    expect(data2.count).toBe(10)

    el.remove()
  })

  it('canDrag returns true when not disabled', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDraggable({
      element: () => el,
      data: { id: '1' },
    })

    await flushMicrotasks()
    expect(lastDraggableOpts.canDrag()).toBe(true)
    el.remove()
  })

  it('canDrag returns false when disabled is true', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDraggable({
      element: () => el,
      data: { id: '1' },
      disabled: true,
    })

    await flushMicrotasks()
    expect(lastDraggableOpts.canDrag()).toBe(false)
    el.remove()
  })

  it('canDrag uses reactive disabled function', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const disabled = signal(false)

    useDraggable({
      element: () => el,
      data: { id: '1' },
      disabled,
    })

    await flushMicrotasks()
    expect(lastDraggableOpts.canDrag()).toBe(true)

    disabled.set(true)
    expect(lastDraggableOpts.canDrag()).toBe(false)

    el.remove()
  })

  it('setup does nothing when element is null', async () => {
    const { useDraggable } = await import('../use-draggable')

    lastDraggableOpts = null
    useDraggable({
      element: () => null,
      data: { id: '1' },
    })

    await flushMicrotasks()
    // Should not have registered with pragmatic-dnd
    expect(lastDraggableOpts).toBeNull()
  })
})

// ─── useDroppable — callback coverage ──────────────────────────────────────

describe('useDroppable — callbacks via mock', () => {
  it('isOver changes on drag enter/leave/drop', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const onDrop = vi.fn()
    const onDragEnter = vi.fn()
    const onDragLeave = vi.fn()

    const { isOver } = useDroppable({
      element: () => el,
      onDrop,
      onDragEnter,
      onDragLeave,
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts).not.toBeNull()

    // Drag enter
    lastDropTargetOpts.onDragEnter({ source: { data: { type: 'card' } } })
    expect(isOver()).toBe(true)
    expect(onDragEnter).toHaveBeenCalledOnce()

    // Drag leave
    lastDropTargetOpts.onDragLeave()
    expect(isOver()).toBe(false)
    expect(onDragLeave).toHaveBeenCalledOnce()

    // Drop
    lastDropTargetOpts.onDragEnter({ source: { data: { type: 'card' } } })
    lastDropTargetOpts.onDrop({ source: { data: { type: 'card' } } })
    expect(isOver()).toBe(false)
    expect(onDrop).toHaveBeenCalledOnce()

    el.remove()
  })

  it('getData returns static data', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDroppable({
      element: () => el,
      data: { zone: 'target' },
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts.getData()).toEqual({ zone: 'target' })
    el.remove()
  })

  it('getData returns dynamic data', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const zone = signal('a')

    useDroppable({
      element: () => el,
      data: () => ({ zone: zone() }),
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts.getData()).toEqual({ zone: 'a' })
    zone.set('b')
    expect(lastDropTargetOpts.getData()).toEqual({ zone: 'b' })
    el.remove()
  })

  it('getData returns empty when no data option', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDroppable({
      element: () => el,
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts.getData()).toEqual({})
    el.remove()
  })

  it('canDrop returns true when no filter', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDroppable({
      element: () => el,
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts.canDrop({ source: { data: {} } })).toBe(true)
    el.remove()
  })

  it('canDrop uses filter function', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useDroppable({
      element: () => el,
      canDrop: (data) => data.type === 'allowed',
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts.canDrop({ source: { data: { type: 'allowed' } } })).toBe(true)
    expect(lastDropTargetOpts.canDrop({ source: { data: { type: 'denied' } } })).toBe(false)
    el.remove()
  })

  it('setup does nothing when element is null', async () => {
    const { useDroppable } = await import('../use-droppable')

    lastDropTargetOpts = null
    useDroppable({
      element: () => null,
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastDropTargetOpts).toBeNull()
  })
})

// ─── useDragMonitor — callback coverage ────────────────────────────────────

describe('useDragMonitor — callbacks via mock', () => {
  it('fires onDragStart and onDrop callbacks', async () => {
    const { useDragMonitor } = await import('../use-drag-monitor')
    const starts: any[] = []
    const drops: any[] = []

    const { isDragging, dragData } = useDragMonitor({
      onDragStart: (data) => starts.push(data),
      onDrop: (source, target) => drops.push({ source, target }),
    })

    expect(lastMonitorOpts).not.toBeNull()

    // Trigger drag start
    lastMonitorOpts.onDragStart({ source: { data: { id: '1' } } })
    expect(isDragging()).toBe(true)
    expect(dragData()).toEqual({ id: '1' })
    expect(starts).toHaveLength(1)

    // Trigger drop
    lastMonitorOpts.onDrop({
      source: { data: { id: '1' } },
      location: { current: { dropTargets: [{ data: { zone: 'target' } }] } },
    })
    expect(isDragging()).toBe(false)
    expect(dragData()).toBeNull()
    expect(drops).toHaveLength(1)
    expect(drops[0]!.target).toEqual({ zone: 'target' })
  })

  it('onDrop handles missing drop targets', async () => {
    const { useDragMonitor } = await import('../use-drag-monitor')
    useDragMonitor()

    lastMonitorOpts.onDrop({
      source: { data: { id: '1' } },
      location: { current: { dropTargets: [] } },
    })

    // Should not throw
  })

  it('canMonitor filter is applied when provided', async () => {
    const { useDragMonitor } = await import('../use-drag-monitor')
    useDragMonitor({
      canMonitor: (data) => data.type === 'card',
    })

    expect(lastMonitorOpts.canMonitor).toBeDefined()
    expect(lastMonitorOpts.canMonitor({ source: { data: { type: 'card' } } })).toBe(true)
    expect(lastMonitorOpts.canMonitor({ source: { data: { type: 'other' } } })).toBe(false)
  })
})

// ─── useFileDrop — callback coverage ──────────────────────────────────────

describe('useFileDrop — callbacks via mock', () => {
  it('fires onDrop with filtered files', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const droppedFiles: File[][] = []

    const { isOver, isDraggingFiles } = useFileDrop({
      element: () => el,
      accept: ['image/*'],
      maxFiles: 2,
      onDrop: (files) => droppedFiles.push(files),
    })

    await flushMicrotasks()
    expect(lastExternalDropOpts).not.toBeNull()

    // Monitor fires drag start
    lastExternalMonitorOpts.onDragStart()
    expect(isDraggingFiles()).toBe(true)

    // Drop target fires enter
    lastExternalDropOpts.onDragEnter()
    expect(isOver()).toBe(true)

    // Drop target fires leave
    lastExternalDropOpts.onDragLeave()
    expect(isOver()).toBe(false)

    // Drop with files
    const imgFile = new File([''], 'photo.png', { type: 'image/png' })
    const pdfFile = new File([''], 'doc.pdf', { type: 'application/pdf' })
    const img2File = new File([''], 'other.jpg', { type: 'image/jpeg' })
    const img3File = new File([''], 'extra.gif', { type: 'image/gif' })

    lastExternalDropOpts.onDrop({
      source: { _files: [imgFile, pdfFile, img2File, img3File] },
    })

    expect(isOver()).toBe(false)
    expect(isDraggingFiles()).toBe(false)
    expect(droppedFiles).toHaveLength(1)
    // Should filter out pdf, keep images, max 2
    expect(droppedFiles[0]!.length).toBe(2)

    // Monitor fires drop
    lastExternalMonitorOpts.onDrop()

    el.remove()
  })

  it('canDrop returns false when disabled is true', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useFileDrop({
      element: () => el,
      disabled: true,
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastExternalDropOpts.canDrop({ source: {} })).toBe(false)
    el.remove()
  })

  it('canDrop returns false when disabled function returns true', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)
    const disabled = signal(true)

    useFileDrop({
      element: () => el,
      disabled,
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastExternalDropOpts.canDrop({ source: {} })).toBe(false)
    el.remove()
  })

  it('drops with no accept filter passes all files', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const droppedFiles: File[][] = []
    useFileDrop({
      element: () => el,
      onDrop: (files) => droppedFiles.push(files),
    })

    await flushMicrotasks()

    const file1 = new File([''], 'a.txt', { type: 'text/plain' })
    const file2 = new File([''], 'b.jpg', { type: 'image/jpeg' })
    lastExternalDropOpts.onDrop({ source: { _files: [file1, file2] } })
    expect(droppedFiles[0]!.length).toBe(2)

    el.remove()
  })

  it('drops with empty files does not call onDrop', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const droppedFiles: File[][] = []
    useFileDrop({
      element: () => el,
      accept: ['image/*'],
      onDrop: (files) => droppedFiles.push(files),
    })

    await flushMicrotasks()

    // Drop non-matching files
    const txtFile = new File([''], 'readme.txt', { type: 'text/plain' })
    lastExternalDropOpts.onDrop({ source: { _files: [txtFile] } })
    expect(droppedFiles).toHaveLength(0)

    el.remove()
  })

  it('accept filter with file extension pattern', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const droppedFiles: File[][] = []
    useFileDrop({
      element: () => el,
      accept: ['.pdf'],
      onDrop: (files) => droppedFiles.push(files),
    })

    await flushMicrotasks()

    const pdf = new File([''], 'doc.PDF', { type: 'application/pdf' }) // uppercase ext
    const txt = new File([''], 'readme.txt', { type: 'text/plain' })
    lastExternalDropOpts.onDrop({ source: { _files: [pdf, txt] } })
    expect(droppedFiles[0]!.length).toBe(1)

    el.remove()
  })

  it('accept filter with exact mime type', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    const droppedFiles: File[][] = []
    useFileDrop({
      element: () => el,
      accept: ['application/json'],
      onDrop: (files) => droppedFiles.push(files),
    })

    await flushMicrotasks()

    const json = new File(['{}'], 'data.json', { type: 'application/json' })
    lastExternalDropOpts.onDrop({ source: { _files: [json] } })
    expect(droppedFiles[0]!.length).toBe(1)

    el.remove()
  })

  it('setup does nothing when element is null', async () => {
    const { useFileDrop } = await import('../use-file-drop')

    lastExternalDropOpts = null
    useFileDrop({
      element: () => null,
      onDrop: () => {},
    })

    await flushMicrotasks()
    expect(lastExternalDropOpts).toBeNull()
  })

  it('external monitor canMonitor is called', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    document.body.appendChild(el)

    useFileDrop({
      element: () => el,
      onDrop: () => {},
    })

    await flushMicrotasks()

    if (lastExternalMonitorOpts?.canMonitor) {
      // Our containsFiles mock always returns true
      expect(lastExternalMonitorOpts.canMonitor({ source: {} })).toBe(true)
    }

    // canDrop on drop target also calls containsFiles
    if (lastExternalDropOpts?.canDrop) {
      expect(lastExternalDropOpts.canDrop({ source: {} })).toBe(true)
    }

    el.remove()
  })
})

// ─── useSortable — extended coverage ──────────────────────────────────────

describe('useSortable — callback coverage via mock', () => {
  it('keyboard reorder: Alt+ArrowLeft in horizontal mode', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
      axis: 'horizontal',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    containerRef(container)

    const els = items().map((item) => {
      const el = document.createElement('div')
      itemRef(item.id)(el)
      container.appendChild(el)
      return el
    })

    // Focus on second item and move left
    els[1]!.focus()
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }),
    )

    expect(reordered.length).toBe(1)
    expect(reordered[0]!.map((i) => i.id)).toEqual(['b', 'a', 'c'])

    container.remove()
  })

  it('ignores keyboard events without altKey', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }, { id: 'b' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    items().forEach((item) => {
      const li = document.createElement('li')
      itemRef(item.id)(li)
      container.appendChild(li)
    })

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: false, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    container.remove()
  })

  it('ignores unrelated key with alt', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }, { id: 'b' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const els = items().map((item) => {
      const li = document.createElement('li')
      itemRef(item.id)(li)
      container.appendChild(li)
      return li
    })

    els[0]!.focus()

    // Alt + Escape — not an arrow key
    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    container.remove()
  })

  it('ignores keyboard when focused element is outside container', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li = document.createElement('li')
    itemRef('a')(li)
    container.appendChild(li)

    // Focus an element OUTSIDE the container
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    outside.remove()
    container.remove()
  })

  it('sortable item drag events update signals', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: 'a' }, { id: 'b' }])

    const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li1 = document.createElement('li')
    itemRef('a')(li1)
    container.appendChild(li1)

    const li2 = document.createElement('li')
    itemRef('b')(li2)
    container.appendChild(li2)

    // Find the draggable registered for item 'a'
    const itemADraggable = allDraggableOpts.find(
      (o: any) => o.getInitialData().__pyreon_sortable_key === 'a',
    )
    expect(itemADraggable).toBeDefined()

    // Trigger drag start on item 'a'
    itemADraggable.onDragStart()
    expect(activeId()).toBe('a')

    // Find the drop target registered for item 'b'
    const itemBDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        const d = o.getData({ input: {}, element: li2 })
        return d.__pyreon_sortable_key === 'b'
      } catch {
        return false
      }
    })

    if (itemBDropTarget) {
      // Drag enter on item B
      itemBDropTarget.onDragEnter({ self: { data: { __edge: 'bottom' } } })
      expect(overId()).toBe('b')
      expect(overEdge()).toBe('bottom')

      // onDrag updates edge
      itemBDropTarget.onDrag({ self: { data: { __edge: 'top' } } })
      expect(overEdge()).toBe('top')

      // Drag leave
      itemBDropTarget.onDragLeave()
      expect(overId()).toBeNull()
    }

    // Trigger drop on item 'a' draggable
    itemADraggable.onDrop()
    // queueMicrotask deferred reset
    await flushMicrotasks()
    expect(activeId()).toBeNull()

    container.remove()
  })

  it('container drop target fires performReorder', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])

    const { containerRef, itemRef, activeId, overId, overEdge } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    items().forEach((item) => {
      const li = document.createElement('li')
      itemRef(item.id)(li)
      container.appendChild(li)
    })

    // Find the container drop target (has our sortable ID in getData)
    const containerDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        const d = o.getData()
        return d.__pyreon_sortable_id !== undefined
      } catch {
        return false
      }
    })
    expect(containerDropTarget).toBeDefined()

    // Simulate: drag 'a', hover over 'c' at bottom edge, then drop on container
    const itemADraggable = allDraggableOpts.find(
      (o: any) => o.getInitialData().__pyreon_sortable_key === 'a',
    )
    itemADraggable!.onDragStart()
    // Manually set overId and overEdge (simulating hover)
    // Find item C's drop target
    const itemCDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        return o.getData({ input: {}, element: {} }).__pyreon_sortable_key === 'c'
      } catch {
        return false
      }
    })
    if (itemCDropTarget) {
      itemCDropTarget.onDragEnter({ self: { data: { __edge: 'bottom' } } })
    }

    // Drop on container
    containerDropTarget!.onDrop()
    expect(reordered.length).toBe(1)
    // 'a' moved after 'c'
    expect(reordered[0]!.map((i) => i.id)).toEqual(['b', 'c', 'a'])
    expect(activeId()).toBeNull()
    expect(overId()).toBeNull()
    expect(overEdge()).toBeNull()

    container.remove()
  })

  it('performReorder with top/left edge moves before target', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    items().forEach((item) => {
      const li = document.createElement('li')
      itemRef(item.id)(li)
      container.appendChild(li)
    })

    // Drag 'c', hover over 'a' at top edge
    const itemCDraggable = allDraggableOpts.find(
      (o: any) => o.getInitialData().__pyreon_sortable_key === 'c',
    )
    itemCDraggable!.onDragStart()

    const itemADropTarget = allDropTargetOpts.find((o: any) => {
      try {
        return o.getData({ input: {}, element: {} }).__pyreon_sortable_key === 'a'
      } catch {
        return false
      }
    })
    if (itemADropTarget) {
      itemADropTarget.onDragEnter({ self: { data: { __edge: 'top' } } })
    }

    // Drop on container
    const containerDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        const d = o.getData()
        return d.__pyreon_sortable_id !== undefined
      } catch {
        return false
      }
    })
    containerDropTarget!.onDrop()
    expect(reordered.length).toBe(1)
    // 'c' moved before 'a'
    expect(reordered[0]!.map((i) => i.id)).toEqual(['c', 'a', 'b'])

    container.remove()
  })

  it('item drag leave only clears when overId matches current key', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: 'a' }, { id: 'b' }])

    const { containerRef, itemRef, overId, overEdge } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li1 = document.createElement('li')
    itemRef('a')(li1)
    container.appendChild(li1)

    const li2 = document.createElement('li')
    itemRef('b')(li2)
    container.appendChild(li2)

    // Find item B's drop target
    const itemBDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        return o.getData({ input: {}, element: li2 }).__pyreon_sortable_key === 'b'
      } catch {
        return false
      }
    })

    if (itemBDropTarget) {
      // Enter B — overId is now 'b'
      itemBDropTarget.onDragEnter({ self: { data: { __edge: 'bottom' } } })
      expect(overId()).toBe('b')

      // Leave B — since overId matches 'b', it should clear
      itemBDropTarget.onDragLeave()
      expect(overId()).toBeNull()
      expect(overEdge()).toBeNull()
    }

    container.remove()
  })

  it('canDrop on container checks sortable ID', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: 'a' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li = document.createElement('li')
    itemRef('a')(li)
    container.appendChild(li)

    // Find container drop target
    const containerDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        const d = o.getData()
        return d.__pyreon_sortable_id !== undefined
      } catch {
        return false
      }
    })

    // canDrop should accept same sortable ID
    const sortableId = containerDropTarget!.getData().__pyreon_sortable_id
    expect(
      containerDropTarget!.canDrop({ source: { data: { __pyreon_sortable_id: sortableId } } }),
    ).toBe(true)
    expect(
      containerDropTarget!.canDrop({ source: { data: { __pyreon_sortable_id: 'other' } } }),
    ).toBe(false)

    container.remove()
  })

  it('autoScroll canScroll checks sortable ID', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: 'a' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li = document.createElement('li')
    itemRef('a')(li)
    container.appendChild(li)

    // Get the sortable ID from the item's data
    const itemData = allDraggableOpts[allDraggableOpts.length - 1]?.getInitialData()
    const sortableId = itemData?.__pyreon_sortable_id

    if (lastAutoScrollOpts?.canScroll) {
      // canScroll returns true for matching sortable ID
      expect(lastAutoScrollOpts.canScroll({ source: { data: { __pyreon_sortable_id: sortableId } } })).toBe(true)
      // canScroll returns false for different sortable ID
      expect(lastAutoScrollOpts.canScroll({ source: { data: { __pyreon_sortable_id: 'other' } } })).toBe(false)
    }

    container.remove()
  })

  it('item canDrop checks sortable ID', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: 'a' }])

    const { containerRef, itemRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li = document.createElement('li')
    itemRef('a')(li)
    container.appendChild(li)

    // Find the item drop target for 'a'
    const itemDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        return o.getData({ input: {}, element: li }).__pyreon_sortable_key === 'a'
      } catch {
        return false
      }
    })

    if (itemDropTarget?.canDrop) {
      const sortableId = allDraggableOpts[allDraggableOpts.length - 1]?.getInitialData().__pyreon_sortable_id
      expect(itemDropTarget.canDrop({ source: { data: { __pyreon_sortable_id: sortableId } } })).toBe(true)
      expect(itemDropTarget.canDrop({ source: { data: { __pyreon_sortable_id: 'other' } } })).toBe(false)
    }

    container.remove()
  })

  it('item drag leave does not clear overId if it does not match key', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal([{ id: 'a' }, { id: 'b' }])

    const { containerRef, itemRef, overId } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: () => {},
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    const li1 = document.createElement('li')
    itemRef('a')(li1)
    container.appendChild(li1)

    const li2 = document.createElement('li')
    itemRef('b')(li2)
    container.appendChild(li2)

    // Find item A's drop target
    const itemADropTarget = allDropTargetOpts.find((o: any) => {
      try {
        return o.getData({ input: {}, element: li1 }).__pyreon_sortable_key === 'a'
      } catch {
        return false
      }
    })

    // Find item B's drop target
    const itemBDropTarget = allDropTargetOpts.find((o: any) => {
      try {
        return o.getData({ input: {}, element: li2 }).__pyreon_sortable_key === 'b'
      } catch {
        return false
      }
    })

    if (itemADropTarget && itemBDropTarget) {
      // Enter B — overId is now 'b'
      itemBDropTarget.onDragEnter({ self: { data: { __edge: 'bottom' } } })
      expect(overId()).toBe('b')

      // Leave A — overId is 'b', not 'a', so should NOT clear
      itemADropTarget.onDragLeave()
      expect(overId()).toBe('b') // Still 'b'
    }

    container.remove()
  })

  it('ignores keyboard when focused element has no data-pyreon-sort-key', async () => {
    const { useSortable } = await import('../use-sortable')
    const reordered: { id: string }[][] = []
    const items = signal([{ id: 'a' }])

    const { containerRef } = useSortable({
      items,
      by: (i) => i.id,
      onReorder: (newItems) => reordered.push(newItems),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    containerRef(container)

    // Add a child without data-pyreon-sort-key
    const child = document.createElement('li')
    container.appendChild(child)
    child.focus()

    container.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }),
    )
    expect(reordered.length).toBe(0)

    container.remove()
  })
})
