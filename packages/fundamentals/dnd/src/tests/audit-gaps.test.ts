/**
 * Unit coverage for the 2026-07 audit-gap surface:
 *
 *  1. `useDraggable({ preview })` — pdnd `onGenerateDragPreview` +
 *     `setCustomNativeDragPreview` + the three offset presets.
 *  2. `useDroppable({ edges, sticky })` — closest-edge detection
 *     (`attachClosestEdge` / `extractClosestEdge` → `overEdge` signal) and
 *     the `getIsSticky` pass-through.
 *  3. `useSortable` screen-reader announcements (`@pyreon/a11y` mocked so
 *     messages are captured synchronously), the aria-describedby
 *     instructions node, the `itemHandleRef` registrar, and the
 *     `createSelector`-backed `isActive` / `isOverKey` predicates.
 *
 * pdnd is module-mocked (same shape as `integration.test.ts`) so each
 * registration's config is captured for synthetic callback replay. The
 * REAL pdnd paths are exercised by the `*.browser.test.tsx` suites in
 * real Chromium.
 */
import { effect, signal } from '@pyreon/reactivity'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let lastDraggableOpts: any = null
const allDropTargetOpts: Array<{ element: HTMLElement; config: any }> = []

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: (opts: any) => {
    lastDraggableOpts = opts
    return () => {}
  },
  dropTargetForElements: (config: any) => {
    allDropTargetOpts.push({ element: config.element, config })
    return () => {}
  },
  monitorForElements: () => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
  combine:
    (...fns: any[]) =>
    () =>
      fns.forEach((fn) => fn?.()),
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: () => () => {},
}))

// Hitbox mock: attachClosestEdge tags the wrapped data so getData output is
// distinguishable from unwrapped data; extractClosestEdge reads a test edge.
vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
  attachClosestEdge: (data: any, args: any) => ({
    ...data,
    __attached: true,
    __allowed: args.allowedEdges,
  }),
  extractClosestEdge: (data: any) => data?.__edge ?? null,
}))

// Preview entry points: capture the setCustomNativeDragPreview call; the
// offset presets return distinguishable marker functions.
let lastSetPreviewArgs: any = null
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview', () => ({
  setCustomNativeDragPreview: (args: any) => {
    lastSetPreviewArgs = args
  },
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview', () => ({
  pointerOutsideOfPreview: (point: any) => {
    const fn = () => point
    ;(fn as any).__preset = 'pointer-outside'
    return fn
  },
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/center-under-pointer', () => {
  const fn = () => ({ x: 0, y: 0 })
  ;(fn as any).__preset = 'center'
  return { centerUnderPointer: fn }
})
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source', () => ({
  preserveOffsetOnSource: (args: any) => {
    const fn = () => args
    ;(fn as any).__preset = 'preserve-offset'
    return fn
  },
}))

// a11y mock: capture announcements synchronously (the real announce() writes
// on the next rAF — the browser suite asserts the real live-region path).
const announced: string[] = []
vi.mock('@pyreon/a11y', () => ({
  announce: (message: string) => {
    announced.push(message)
  },
}))

beforeEach(() => {
  lastDraggableOpts = null
  lastSetPreviewArgs = null
  allDropTargetOpts.length = 0
  announced.length = 0
})

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve))

// ─── useDraggable preview ───────────────────────────────────────────────────

describe('useDraggable — custom native drag preview', () => {
  it('does NOT wire onGenerateDragPreview when preview is omitted', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    useDraggable({ element: () => el, data: { id: '1' } })
    await flushMicrotasks()
    expect(lastDraggableOpts.onGenerateDragPreview).toBeUndefined()
  })

  it('routes render through setCustomNativeDragPreview (no offset → browser default)', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    const rendered: HTMLElement[] = []
    const cleanup = vi.fn()
    useDraggable({
      element: () => el,
      data: { id: '1' },
      preview: {
        render: (container) => {
          rendered.push(container)
          return cleanup
        },
      },
    })
    await flushMicrotasks()
    expect(typeof lastDraggableOpts.onGenerateDragPreview).toBe('function')

    const nativeSetDragImage = vi.fn()
    lastDraggableOpts.onGenerateDragPreview({
      nativeSetDragImage,
      source: { element: el },
      location: { initial: { input: { clientX: 3, clientY: 4 } } },
    })
    expect(lastSetPreviewArgs).not.toBeNull()
    expect(lastSetPreviewArgs.nativeSetDragImage).toBe(nativeSetDragImage)
    // No offset preset configured → getOffset key absent (browser default).
    expect('getOffset' in lastSetPreviewArgs).toBe(false)

    // The render fn delegates to the user callback with the raw container.
    const container = document.createElement('div')
    const result = lastSetPreviewArgs.render({ container })
    expect(rendered).toEqual([container])
    expect(result).toBe(cleanup)
  })

  it.each([
    ['pointer-outside', 'pointer-outside'],
    ['center', 'center'],
    ['preserve-offset', 'preserve-offset'],
  ] as const)('offset preset %s resolves to the matching pdnd util', async (offset, preset) => {
    const { useDraggable } = await import('../use-draggable')
    const el = document.createElement('div')
    useDraggable({
      element: () => el,
      data: { id: '1' },
      preview: { render: () => {}, offset },
    })
    await flushMicrotasks()
    lastDraggableOpts.onGenerateDragPreview({
      nativeSetDragImage: vi.fn(),
      source: { element: el },
      location: { initial: { input: { clientX: 3, clientY: 4 } } },
    })
    expect(lastSetPreviewArgs.getOffset.__preset).toBe(preset)
    if (offset === 'preserve-offset') {
      // preserveOffsetOnSource receives the drag's source element + initial input.
      expect(lastSetPreviewArgs.getOffset()).toEqual({
        element: el,
        input: { clientX: 3, clientY: 4 },
      })
    }
  })
})

// ─── useDroppable edges + sticky ────────────────────────────────────────────

describe('useDroppable — closest-edge detection + stickiness', () => {
  it('getData is UNWRAPPED and onDrag/getIsSticky absent without edges/sticky', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    useDroppable({ element: () => el, data: { zone: 'a' }, onDrop: () => {} })
    await flushMicrotasks()
    const config = allDropTargetOpts[0]!.config
    expect(config.getData({ input: {}, element: el })).toEqual({ zone: 'a' })
    expect(config.onDrag).toBeUndefined()
    expect(config.getIsSticky).toBeUndefined()
  })

  it('edges wraps getData via attachClosestEdge and drives the overEdge signal', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    const { isOver, overEdge } = useDroppable({
      element: () => el,
      data: { zone: 'a' },
      edges: ['top', 'bottom'],
      onDrop: () => {},
    })
    await flushMicrotasks()
    const config = allDropTargetOpts[0]!.config

    // getData wraps the resolved data with hitbox metadata + allowed edges.
    expect(config.getData({ input: {}, element: el })).toEqual({
      zone: 'a',
      __attached: true,
      __allowed: ['top', 'bottom'],
    })

    // Enter near the bottom edge → overEdge flips.
    config.onDragEnter({ source: { data: {} }, self: { data: { __edge: 'bottom' } } })
    expect(isOver()).toBe(true)
    expect(overEdge()).toBe('bottom')

    // Live tracking while moving over the target.
    config.onDrag({ self: { data: { __edge: 'top' } } })
    expect(overEdge()).toBe('top')

    // Leave clears both.
    config.onDragLeave()
    expect(isOver()).toBe(false)
    expect(overEdge()).toBeNull()

    // Enter again, then drop clears both.
    config.onDragEnter({ source: { data: {} }, self: { data: { __edge: 'top' } } })
    expect(overEdge()).toBe('top')
    config.onDrop({ source: { data: {} } })
    expect(isOver()).toBe(false)
    expect(overEdge()).toBeNull()
  })

  it('sticky: true passes getIsSticky through to pdnd', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    useDroppable({ element: () => el, sticky: true, onDrop: () => {} })
    await flushMicrotasks()
    const config = allDropTargetOpts[0]!.config
    expect(typeof config.getIsSticky).toBe('function')
    expect(config.getIsSticky()).toBe(true)
  })
})

// ─── useSortable — announcements, instructions, handle, selectors ───────────

type Item = { id: string; name: string }

describe('useSortable — screen-reader announcements', () => {
  it('announces "Picked up <label>" on drag start (label option)', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      label: (i) => i.name,
      onReorder: (next) => items.set(next),
    })
    const el = document.createElement('li')
    s.itemRef('1')(el)
    lastDraggableOpts.onDragStart()
    expect(announced).toEqual(['Picked up Alice'])
  })

  it('falls back to String(key) when label is omitted', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([{ id: '1', name: 'Alice' }])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })
    const el = document.createElement('li')
    s.itemRef('1')(el)
    lastDraggableOpts.onDragStart()
    expect(announced).toEqual(['Picked up 1'])
  })

  it('announces "Moved <label> to position X of N" on keyboard reorder', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      label: (i) => i.name,
      onReorder: (next) => items.set(next),
    })
    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    s.containerRef(ul)
    const li = document.createElement('li')
    s.itemRef('1')(li)
    ul.appendChild(li)
    li.focus()
    ul.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
    expect(items().map((i) => i.id)).toEqual(['2', '1', '3'])
    expect(announced).toEqual(['Moved Alice to position 2 of 3'])
    ul.remove()
  })

  it('announces "Dropped <label> at position X of N" on a pointer reorder drop', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      label: (i) => i.name,
      onReorder: (next) => items.set(next),
    })
    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    s.containerRef(ul)
    const li1 = document.createElement('li')
    const li3 = document.createElement('li')
    s.itemRef('1')(li1)
    s.itemRef('3')(li3)

    // Simulate: drag item 1, hover item 3's bottom edge, drop on container.
    const li3Drop = allDropTargetOpts.find((c) => c.element === li3)!
    const ownSortId = li3Drop.config.getData({ input: {}, element: li3 })
      .__pyreon_sortable_id as string
    // draggable() is called per itemRef — the LAST call was li3's;
    // re-register li1 so lastDraggableOpts points at ITS draggable.
    s.itemRef('1')(li1)
    lastDraggableOpts.onDragStart() // activeId = '1'
    li3Drop.config.onDragEnter({ self: { data: { __edge: 'bottom' } } }) // overId = '3'
    const containerDrop = allDropTargetOpts.find((c) => c.element === ul)!
    announced.length = 0
    containerDrop.config.onDrop({ source: { data: { __pyreon_sortable_id: ownSortId } } })
    expect(items().map((i) => i.id)).toEqual(['2', '3', '1'])
    expect(announced).toEqual(['Dropped Alice at position 3 of 3'])
    ul.remove()
  })

  it('announces the cross-list receive on the destination', async () => {
    const { useSortable } = await import('../use-sortable')
    const itemsB = signal<Item[]>([{ id: 'b1', name: 'Bea' }])
    const dest = useSortable<Item>({
      items: itemsB,
      by: (i) => i.id,
      label: (i) => i.name,
      onReorder: (next) => itemsB.set(next),
      groupId: 'board',
      onCrossListReceive: (item, index) => {
        const next = [...itemsB()]
        next.splice(index, 0, item)
        itemsB.set(next)
      },
    })
    const elB1 = document.createElement('li')
    dest.itemRef('b1')(elB1)
    const b1Drop = allDropTargetOpts.find((c) => c.element === elB1)!
    announced.length = 0
    b1Drop.config.onDrop({
      source: {
        data: {
          __pyreon_sortable_id: 'someone-else',
          __pyreon_sortable_group: 'board',
          __pyreon_sortable_payload: { id: 'a9', name: 'Axel' } as Item,
        },
      },
      self: { data: { __edge: 'top' } },
    })
    expect(itemsB().map((i) => i.id)).toEqual(['a9', 'b1'])
    expect(announced).toEqual(['Dropped Axel at position 1 of 2 in the receiving list'])
  })
})

describe('useSortable — aria-describedby keyboard instructions', () => {
  it('creates a visually-hidden instructions node and links every item to it', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([{ id: '1', name: 'Alice' }])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })
    const ul = document.createElement('ul')
    document.body.appendChild(ul)
    s.containerRef(ul)

    const instructions = ul.querySelector('[data-pyreon-sortable-instructions]') as HTMLElement
    expect(instructions).not.toBeNull()
    expect(instructions.textContent).toBe('Press Alt plus arrow keys to reorder')
    expect(instructions.id).toMatch(/^sortable-\d+-instructions$/)

    const li = document.createElement('li')
    s.itemRef('1')(li)
    expect(li.getAttribute('aria-describedby')).toBe(instructions.id)

    // A consumer-supplied aria-describedby wins.
    const li2 = document.createElement('li')
    li2.setAttribute('aria-describedby', 'my-own-help')
    s.itemRef('1')(li2)
    expect(li2.getAttribute('aria-describedby')).toBe('my-own-help')

    // The instructions node is removed with the container registration.
    s.containerRef(null)
    expect(ul.querySelector('[data-pyreon-sortable-instructions]')).toBeNull()
    ul.remove()
  })
})

describe('useSortable — itemHandleRef drag handle', () => {
  it('re-registers the item with pdnd dragHandle when a handle arrives (and drops it on unregister)', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([{ id: '1', name: 'Alice' }])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })
    const li = document.createElement('li')
    s.itemRef('1')(li)
    // Initial registration: no handle.
    expect(lastDraggableOpts.element).toBe(li)
    expect(lastDraggableOpts.dragHandle).toBeUndefined()

    // Handle mounts (child refs fire after the parent's) → re-register.
    const grip = document.createElement('button')
    s.itemHandleRef('1')(grip)
    expect(lastDraggableOpts.element).toBe(li)
    expect(lastDraggableOpts.dragHandle).toBe(grip)

    // Handle unmounts → re-register without dragHandle.
    s.itemHandleRef('1')(null)
    expect(lastDraggableOpts.element).toBe(li)
    expect(lastDraggableOpts.dragHandle).toBeUndefined()
  })

  it('a handle registered before its item element is picked up at item registration', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([{ id: '1', name: 'Alice' }])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })
    const grip = document.createElement('button')
    // No item element yet → registrar stores the handle, registers nothing.
    lastDraggableOpts = null
    s.itemHandleRef('1')(grip)
    expect(lastDraggableOpts).toBeNull()

    const li = document.createElement('li')
    s.itemRef('1')(li)
    expect(lastDraggableOpts.dragHandle).toBe(grip)
  })
})

describe('useSortable — createSelector-backed isActive / isOverKey', () => {
  it('isActive/isOverKey reflect activeId/overId', async () => {
    const { useSortable } = await import('../use-sortable')
    const items = signal<Item[]>([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })
    const li1 = document.createElement('li')
    s.itemRef('1')(li1)

    expect(s.isActive('1')).toBe(false)
    expect(s.isOverKey('1')).toBe(false)

    lastDraggableOpts.onDragStart() // activeId = '1'
    expect(s.isActive('1')).toBe(true)
    expect(s.isActive('2')).toBe(false)

    const li1Drop = allDropTargetOpts.find((c) => c.element === li1)!
    li1Drop.config.onDragEnter({ self: { data: { __edge: 'top' } } })
    expect(s.isOverKey('1')).toBe(true)
    expect(s.isOverKey('2')).toBe(false)
  })

  it('a selection change notifies ONLY the affected keys (O(2), not O(N))', async () => {
    const { useSortable } = await import('../use-sortable')
    const keys = ['1', '2', '3', '4', '5']
    const items = signal<Item[]>(keys.map((id) => ({ id, name: `Item ${id}` })))
    const s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
    })
    const els = new Map<string, HTMLElement>()
    for (const k of keys) {
      const li = document.createElement('li')
      els.set(k, li)
      s.itemRef(k)(li)
    }

    // One probe effect per row reading isActive(key) — the documented row
    // idiom. Counts re-runs per key.
    const runs: Record<string, number> = {}
    const disposers = keys.map((k) =>
      effect(() => {
        s.isActive(k)
        runs[k] = (runs[k] ?? 0) + 1
      }),
    )
    expect(runs).toEqual({ '1': 1, '2': 1, '3': 1, '4': 1, '5': 1 })

    // Drag-start on item 2: with the naive `activeId() === key` idiom EVERY
    // row's effect re-runs (O(N)); the selector notifies only key '2'
    // (null → '2'; the null side has no subscribers).
    const li2 = els.get('2')!
    // Re-register item 2 so lastDraggableOpts points at ITS draggable.
    s.itemRef('2')(li2)
    lastDraggableOpts.onDragStart()
    expect(runs).toEqual({ '1': 1, '2': 2, '3': 1, '4': 1, '5': 1 })

    for (const d of disposers) d.dispose()
  })
})
