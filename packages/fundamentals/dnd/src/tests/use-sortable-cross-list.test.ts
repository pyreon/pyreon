/**
 * Cross-list onDrop tests for `useSortable` — covers use-sortable.ts L313-345
 * (the per-item dropTargetForElements onDrop handler that fires for cross-list
 * shape: drag from group sortable A → drop onto item in group sortable B).
 *
 * Approach: mount via `effect()` to give the hook lifecycle context, then
 * invoke the returned `itemRef(key)(element)` directly so the per-item
 * pdnd registrations fire. pdnd is module-mocked so each call's config
 * is captured for synthetic onDrop replay.
 */
import { effect } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'

let dropTargetCalls: Array<{ element: HTMLElement; config: any }> = []
vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: (config: any) => {
    // Even when we don't use the config, capture for inspection
    void config
    return () => {}
  },
  dropTargetForElements: (config: any) => {
    dropTargetCalls.push({ element: config.element, config })
    return () => {}
  },
  monitorForElements: () => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/combine', () => ({
  combine: (...fns: any[]) => () => fns.forEach((fn) => fn?.()),
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
  attachClosestEdge: (data: any) => data,
  extractClosestEdge: (data: any) => data?.__edge ?? 'top',
}))

const flush = () => Promise.resolve().then(() => Promise.resolve())

describe('useSortable — cross-list onDrop (per-item handler)', () => {
  it('fires onCrossListReceive when a different sortable in the same group drops on an item', async () => {
    const { useSortable } = await import('../use-sortable')
    dropTargetCalls = []

    type Item = { id: string }
    const itemsA: Item[] = [{ id: 'a1' }, { id: 'a2' }]
    const itemsB: Item[] = [{ id: 'b1' }, { id: 'b2' }]
    const received: Array<{ item: Item; insertAt: number }> = []
    const sourceDrops: Item[] = []

    let resultA: any, resultB: any
    const eA = effect(() => {
      resultA = useSortable<Item>({
        element: () => document.createElement('div'),
        items: () => itemsA,
        by: (i) => i.id,
        onReorder: () => {},
        groupId: 'board',
        onCrossListDrop: (item) => sourceDrops.push(item),
      })
    })
    const eB = effect(() => {
      resultB = useSortable<Item>({
        element: () => document.createElement('div'),
        items: () => itemsB,
        by: (i) => i.id,
        onReorder: () => {},
        groupId: 'board',
        onCrossListReceive: (item, insertAt) => received.push({ item, insertAt }),
      })
    })

    // Wire up per-item drop targets by calling each itemRef with a DOM element.
    const elA1 = document.createElement('div')
    const elA2 = document.createElement('div')
    const elB1 = document.createElement('div')
    const elB2 = document.createElement('div')
    resultA.itemRef('a1')(elA1)
    resultA.itemRef('a2')(elA2)
    resultB.itemRef('b1')(elB1)
    resultB.itemRef('b2')(elB2)
    await flush()

    // dropTargetForElements is called once per item ref invocation. Each
    // call carries the per-item config — find the one for B's first item.
    const b1Drop = dropTargetCalls.find((c) => c.element === elB1)
    expect(b1Drop).toBeTruthy()
    const a1Drop = dropTargetCalls.find((c) => c.element === elA1)
    expect(a1Drop).toBeTruthy()

    // Read each item's sortableId from its getData payload.
    const a1Data = a1Drop!.config.getData({ input: { clientX: 0, clientY: 0 }, element: elA1 })
    const b1Data = b1Drop!.config.getData({ input: { clientX: 0, clientY: 0 }, element: elB1 })
    const sourceSortableId = a1Data.__pyreon_sortable_id as string
    const destSortableId = b1Data.__pyreon_sortable_id as string
    expect(sourceSortableId).not.toBe(destSortableId)

    // Synthetic drop: a1 from list A → onto b1 in list B.
    b1Drop!.config.onDrop({
      source: {
        data: {
          __pyreon_sortable_id: sourceSortableId,
          __pyreon_sortable_group: 'board',
          __pyreon_sortable_payload: { id: 'a1' } as Item,
        },
      },
      self: {
        data: { __pyreon_sortable_key: 'b1', __pyreon_sortable_id: destSortableId, __edge: 'top' },
      },
    })

    expect(received.length).toBe(1)
    expect(received[0]!.item).toEqual({ id: 'a1' })
    expect(received[0]!.insertAt).toBe(0) // 'top' edge → insert before b1 (index 0)
    expect(sourceDrops.length).toBe(1)
    expect(sourceDrops[0]).toEqual({ id: 'a1' })

    eA.dispose()
    eB.dispose()
  })

  it('bails when source is from the SAME sortable (early-return at L318)', async () => {
    const { useSortable } = await import('../use-sortable')
    dropTargetCalls = []

    type Item = { id: string }
    const received: unknown[] = []
    let result: any
    const e = effect(() => {
      result = useSortable<Item>({
        element: () => document.createElement('div'),
        items: () => [{ id: 'x' }, { id: 'y' }],
        by: (i) => i.id,
        onReorder: () => {},
        groupId: 'board',
        onCrossListReceive: (item) => received.push(item),
      })
    })
    const elX = document.createElement('div')
    result.itemRef('x')(elX)
    await flush()

    const xDrop = dropTargetCalls.find((c) => c.element === elX)!
    const xData = xDrop.config.getData({ input: { clientX: 0, clientY: 0 }, element: elX })
    const sortableId = xData.__pyreon_sortable_id as string

    // Same sortableId → early return at L318.
    xDrop.config.onDrop({
      source: {
        data: {
          __pyreon_sortable_id: sortableId,
          __pyreon_sortable_group: 'board',
          __pyreon_sortable_payload: { id: 'x' },
        },
      },
      self: { data: { __pyreon_sortable_key: 'x', __edge: 'top' } },
    })

    expect(received.length).toBe(0)
    e.dispose()
  })

  it('bails when source group differs (L319-325)', async () => {
    const { useSortable } = await import('../use-sortable')
    dropTargetCalls = []

    type Item = { id: string }
    const received: unknown[] = []
    let result: any
    const e = effect(() => {
      result = useSortable<Item>({
        element: () => document.createElement('div'),
        items: () => [{ id: 'x' }],
        by: (i) => i.id,
        onReorder: () => {},
        groupId: 'boardA',
        onCrossListReceive: (item) => received.push(item),
      })
    })
    const elX = document.createElement('div')
    result.itemRef('x')(elX)
    await flush()

    const xDrop = dropTargetCalls.find((c) => c.element === elX)!
    xDrop.config.onDrop({
      source: {
        data: {
          __pyreon_sortable_id: 'other',
          __pyreon_sortable_group: 'boardB', // different group → bail
          __pyreon_sortable_payload: { id: 'q' },
        },
      },
      self: { data: { __pyreon_sortable_key: 'x', __edge: 'top' } },
    })

    expect(received.length).toBe(0)
    e.dispose()
  })
})
