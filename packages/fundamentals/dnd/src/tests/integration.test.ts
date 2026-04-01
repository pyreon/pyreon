import { signal } from '@pyreon/reactivity'

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
