/**
 * Targeted coverage for the spots the broader suites don't reach:
 *
 *  1. The `if (isServer)` early-return branch in every hook — the inert
 *     server-side API objects (and the inline accessor functions they
 *     carry). The pre-existing `dnd.test.ts` "SSR safety" block deletes
 *     `globalThis.document` but does NOT `vi.resetModules()` first, so the
 *     `@pyreon/reactivity` module's `isServer = typeof document === 'undefined'`
 *     constant — evaluated ONCE at module load, while `document` still
 *     existed — stays `false`. Those tests therefore asserted the inert
 *     shape while actually running the CLIENT branch (which also returns
 *     inert because `element() => null`). Here we `vi.resetModules()` BEFORE
 *     deleting `document` so the hook's re-import re-evaluates `@pyreon/reactivity`
 *     with `document` absent → `isServer === true` → the real server branch runs.
 *
 *  2. The container-level `onDrop` cross-list "already handled" skip
 *     (use-sortable.ts L178 else-if false side) — a cross-list source whose
 *     `__pyreon_sortable_handled` flag was already set by the item-level
 *     handler must make the container's else-if evaluate false so it does
 *     NOT re-insert at the end of the column.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── (1) Server-branch returns — exercised with a real `isServer === true` ───

describe('server branch — isServer truly true via resetModules + document delete', () => {
  let originalDocument: typeof globalThis.document

  beforeEach(() => {
    originalDocument = globalThis.document
    // Reset BEFORE deleting `document` so the next `import('../use-*')` pulls a
    // fresh `@pyreon/reactivity` whose `isServer` constant evaluates with no DOM.
    vi.resetModules()
    // @ts-expect-error — simulate SSR by removing document
    delete globalThis.document
  })

  afterEach(() => {
    globalThis.document = originalDocument
    // Restore the module registry so the rest of the suite (and other files)
    // see the normal client-side `@pyreon/reactivity` again.
    vi.resetModules()
  })

  it('useDraggable returns the inert server-branch isDragging', async () => {
    const { useDraggable } = await import('../use-draggable')
    const result = useDraggable({ element: () => null, data: { id: '1' } })
    expect(result.isDragging()).toBe(false)
  })

  it('useDroppable returns the inert server-branch isOver', async () => {
    const { useDroppable } = await import('../use-droppable')
    const result = useDroppable({ element: () => null, onDrop: () => {} })
    expect(result.isOver()).toBe(false)
  })

  it('useFileDrop returns the inert server-branch isOver + isDraggingFiles', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const result = useFileDrop({ element: () => null, onDrop: () => {} })
    expect(result.isOver()).toBe(false)
    expect(result.isDraggingFiles()).toBe(false)
  })

  it('useDragMonitor returns the inert server-branch isDragging + dragData', async () => {
    const { useDragMonitor } = await import('../use-drag-monitor')
    const result = useDragMonitor({ onDragStart: () => {}, onDrop: () => {} })
    expect(result.isDragging()).toBe(false)
    expect(result.dragData()).toBeNull()
  })

  it('useSortable returns the full inert server-branch API (noop refs + null accessors)', async () => {
    const { useSortable } = await import('../use-sortable')
    const result = useSortable<{ id: string }>({
      items: () => [{ id: '1' }],
      by: (item) => item.id,
      onReorder: () => {},
    })
    // Accessor functions (the four `() => null` / `() => null` arms).
    expect(result.activeId()).toBeNull()
    expect(result.overId()).toBeNull()
    expect(result.overEdge()).toBeNull()
    // The `noop` ref + the `itemRef` factory returning `noop`. Invoke them so
    // the noop body runs (with both an element and `null`, the two ref shapes).
    expect(typeof result.containerRef).toBe('function')
    expect(typeof result.itemRef).toBe('function')
    const itemNoop = result.itemRef('1')
    expect(typeof itemNoop).toBe('function')
    // These calls must be inert no-ops (the server noop ignores its argument).
    expect(result.containerRef(null)).toBeUndefined()
    expect(itemNoop(null)).toBeUndefined()
  })
})

// ─── (2) Container cross-list "already handled" skip (L178 else-if false) ────

describe('useSortable container onDrop — skips re-insert when source already handled', () => {
  let dropTargetCalls: Array<{ element: HTMLElement; config: any }> = []

  beforeEach(() => {
    vi.resetModules()
    dropTargetCalls = []
    vi.doMock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
      draggable: () => () => {},
      dropTargetForElements: (config: any) => {
        dropTargetCalls.push({ element: config.element, config })
        return () => {}
      },
      monitorForElements: () => () => {},
    }))
    vi.doMock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
      combine:
        (...fns: any[]) =>
        () =>
          fns.forEach((fn) => fn?.()),
    }))
    vi.doMock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
      autoScrollForElements: () => () => {},
    }))
    vi.doMock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
      attachClosestEdge: (data: any) => data,
      extractClosestEdge: (data: any) => data?.__edge ?? 'top',
    }))
  })

  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('@atlaskit/pragmatic-drag-and-drop/element/adapter')
    vi.doUnmock('@atlaskit/pragmatic-drag-and-drop/combine')
    vi.doUnmock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element')
    vi.doUnmock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge')
  })

  it('does NOT call onCrossListReceive a second time when __pyreon_sortable_handled is set', async () => {
    const { useSortable } = await import('../use-sortable')

    type Card = { id: string }
    const receivedByDest: Array<{ item: Card; index: number }> = []

    const dest = useSortable<Card>({
      items: () => [{ id: 'd1' }],
      by: (c) => c.id,
      onReorder: () => {},
      groupId: 'board',
      onCrossListReceive: (item, index) => receivedByDest.push({ item, index }),
    })

    const container = document.createElement('ul')
    document.body.appendChild(container)
    dest.containerRef(container)

    // Find the container's own drop target (its getData carries SORT_ID + SORT_GROUP).
    const containerDrop = dropTargetCalls.find((c) => {
      try {
        const d = c.config.getData()
        return d.__pyreon_sortable_id !== undefined && d.__pyreon_sortable_group === 'board'
      } catch {
        return false
      }
    })
    expect(containerDrop).toBeDefined()
    const destSortableId = containerDrop!.config.getData().__pyreon_sortable_id

    // A cross-list source (different sortableId, same group) that the item-level
    // handler ALREADY processed — its data carries the `handled` marker. The
    // container's else-if must evaluate FALSE (because `!handled` is false) and
    // skip the append, so onCrossListReceive is NOT re-invoked here.
    containerDrop!.config.onDrop({
      source: {
        data: {
          __pyreon_sortable_id: 'some-other-sortable',
          __pyreon_sortable_group: 'board',
          __pyreon_sortable_payload: { id: 'x1' } as Card,
          __pyreon_sortable_handled: true,
        },
      },
    })

    expect(receivedByDest).toEqual([])
    // The 3-signal reset still runs (the batch at the end of onDrop), proving
    // we reached past the else-if and didn't early-return.
    expect(dest.activeId()).toBeNull()
    expect(dest.overId()).toBeNull()
    expect(dest.overEdge()).toBeNull()

    container.remove()
  })
})
