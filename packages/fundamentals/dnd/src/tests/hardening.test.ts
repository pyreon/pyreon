/**
 * dnd hardening (audit 2026-09). pdnd is module-mocked (same shape as
 * `audit-gaps.test.ts`) so each registration and its disposal is observable;
 * the real-adapter paths live in `hardening.browser.test.tsx`.
 *
 *  1. Element binding — `ref` registers a LATER-mounted element and moves the
 *     registration when the element is swapped; a signal-backed `element`
 *     getter re-resolves; a getter that is null at setup warns.
 *  2. `useDroppable` `onDrop(source, { edge, data })` — captured before reset.
 *  3. `useSortable` a11y — consumer roles survive, a non-list container gets
 *     `role="list"`, the instructions node lives OUTSIDE the container.
 *  4. `useSortable` keyboard pickup mode (Space/Enter pick, arrows move,
 *     Space/Enter drop, Escape cancel) + `disabled`.
 *  5. `itemRef(key)(null)` only disposes the registration it created.
 *  6. The focus-restore frame is cancelled on cleanup.
 *  7. `useFileDrop` `onReject` + `*` / `*\/*` accept wildcards.
 */
import { effect, signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface Reg {
  kind: 'draggable' | 'drop' | 'external' | 'monitor'
  config: any
  disposed: boolean
}
const regs: Reg[] = []
const track = (kind: Reg['kind']) => (config: any) => {
  const r: Reg = { kind, config, disposed: false }
  regs.push(r)
  return () => {
    r.disposed = true
  }
}

vi.mock('@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter', () => ({
  draggable: (c: any) => track('draggable')(c),
  dropTargetForElements: (c: any) => track('drop')(c),
  monitorForElements: () => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/adapter/drop-target-for-external', () => ({
  dropTargetForExternal: (c: any) => track('external')(c),
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/adapter/monitor-for-external', () => ({
  monitorForExternal: (c: any) => track('monitor')(c),
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/utils/contains-files', () => ({
  containsFiles: () => true,
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/utils/get-files', () => ({
  getFiles: ({ source }: any) => source?._files ?? [],
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop/utils/combine', () => ({
  combine:
    (...fns: any[]) =>
    () =>
      fns.forEach((fn) => fn?.()),
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: () => () => {},
}))
vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
  attachClosestEdge: (data: any) => ({ ...data, __attached: true }),
  extractClosestEdge: (data: any) => data?.__edge ?? null,
}))
const announced: string[] = []
vi.mock('@pyreon/a11y', () => ({
  announce: (message: string) => {
    announced.push(message)
  },
}))

const flush = () => new Promise<void>((r) => setTimeout(r, 0))
const live = (kind: Reg['kind']) => regs.filter((r) => r.kind === kind && !r.disposed)

beforeEach(() => {
  regs.length = 0
  announced.length = 0
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

// ─── 1. element binding ────────────────────────────────────────────────────

describe('element binding — ref + re-resolving getter', () => {
  for (const hook of ['draggable', 'droppable', 'fileDrop'] as const) {
    it(`${hook}: the returned ref registers a later-mounted element and follows a swap`, async () => {
      const mod =
        hook === 'draggable'
          ? await import('../use-draggable')
          : hook === 'droppable'
            ? await import('../use-droppable')
            : await import('../use-file-drop')
      const kind = hook === 'draggable' ? 'draggable' : hook === 'droppable' ? 'drop' : 'external'
      let result: any
      const e = effect(() => {
        result =
          hook === 'draggable'
            ? (mod as typeof import('../use-draggable')).useDraggable({ data: { id: '1' } })
            : hook === 'droppable'
              ? (mod as typeof import('../use-droppable')).useDroppable({})
              : (mod as typeof import('../use-file-drop')).useFileDrop({ onDrop: () => {} })
      })
      await flush()
      expect(live(kind)).toHaveLength(0)

      const a = document.createElement('div')
      result.ref(a)
      expect(live(kind).map((r) => r.config.element)).toEqual([a])

      const b = document.createElement('div')
      result.ref(b)
      expect(live(kind).map((r) => r.config.element)).toEqual([b])

      result.ref(null)
      expect(live(kind)).toHaveLength(0)

      result.ref(a)
      e.dispose()
      expect(live(kind)).toHaveLength(0)
    })
  }

  it('a signal-backed element getter re-resolves when the element arrives or changes', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = signal<HTMLElement | null>(null)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const e = effect(() => {
      useDraggable({ element: () => el(), data: { id: '1' } })
    })
    await flush()
    expect(live('draggable')).toHaveLength(0)
    const a = document.createElement('div')
    el.set(a)
    expect(live('draggable').map((r) => r.config.element)).toEqual([a])
    const b = document.createElement('div')
    el.set(b)
    expect(live('draggable').map((r) => r.config.element)).toEqual([b])
    e.dispose()
    expect(live('draggable')).toHaveLength(0)
  })

  it('warns once when the getter returns null at setup and no ref was attached', async () => {
    const { useDroppable } = await import('../use-droppable')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const e = effect(() => {
      useDroppable({ element: () => null })
    })
    await flush()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[Pyreon\] useDroppable:.*ref/)
    e.dispose()
  })

  it('once the ref has supplied an element, a signal getter no longer overrides it', async () => {
    const { useDraggable } = await import('../use-draggable')
    const el = signal<HTMLElement | null>(document.createElement('div'))
    let result: any
    const e = effect(() => {
      result = useDraggable({ element: () => el(), data: {} })
    })
    await flush()
    const viaRef = document.createElement('div')
    result.ref(viaRef)
    el.set(document.createElement('div'))
    expect(live('draggable').map((r) => r.config.element)).toEqual([viaRef])
    e.dispose()
  })

  it('does not warn when the ref supplied the element', async () => {
    const { useDraggable } = await import('../use-draggable')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let result: any
    const e = effect(() => {
      result = useDraggable({ element: () => null, data: {} })
    })
    result.ref(document.createElement('div'))
    await flush()
    expect(warn).not.toHaveBeenCalled()
    expect(live('draggable')).toHaveLength(1)
    e.dispose()
  })
})

// ─── 2. onDrop location ────────────────────────────────────────────────────

describe('useDroppable onDrop receives the drop location', () => {
  it('passes { edge, data } captured before the overEdge reset', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    const onDrop = vi.fn()
    let res: any
    const e = effect(() => {
      res = useDroppable({
        element: () => el,
        data: { zone: 'z1' },
        edges: ['top', 'bottom'],
        onDrop,
      })
    })
    await flush()
    const cfg = live('drop')[0]!.config
    cfg.onDragEnter({ source: { data: { id: 'x' } }, self: { data: { __edge: 'bottom' } } })
    expect(res.overEdge()).toBe('bottom')
    cfg.onDrop({ source: { data: { id: 'x' } }, self: { data: { __edge: 'bottom' } } })
    expect(onDrop).toHaveBeenCalledWith({ id: 'x' }, { edge: 'bottom', data: { zone: 'z1' } })
    expect(res.overEdge()).toBeNull()
    e.dispose()
  })

  it('falls back to the last hovered edge when the drop payload carries none', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    const onDrop = vi.fn()
    const e = effect(() => {
      useDroppable({ element: () => el, edges: ['left', 'right'], onDrop })
    })
    await flush()
    const cfg = live('drop')[0]!.config
    cfg.onDragEnter({ source: { data: {} }, self: { data: { __edge: 'left' } } })
    cfg.onDrop({ source: { data: {} }, self: { data: {} } })
    expect(onDrop.mock.calls[0]![1].edge).toBe('left')
    e.dispose()
  })

  it('edge is null when edges are not configured', async () => {
    const { useDroppable } = await import('../use-droppable')
    const el = document.createElement('div')
    const onDrop = vi.fn()
    const e = effect(() => {
      useDroppable({ element: () => el, onDrop })
    })
    await flush()
    live('drop')[0]!.config.onDrop({ source: { data: { id: 'x' } }, self: { data: {} } })
    expect(onDrop).toHaveBeenCalledWith({ id: 'x' }, { edge: null, data: {} })
    e.dispose()
  })
})

// ─── 3–6. useSortable ──────────────────────────────────────────────────────

interface Item {
  id: string
  name: string
}

async function sortable(
  extra: Record<string, unknown> = {},
  container: HTMLElement = document.createElement('div'),
) {
  const { useSortable } = await import('../use-sortable')
  const items = signal<Item[]>([
    { id: 'a', name: 'Alice' },
    { id: 'b', name: 'Bob' },
    { id: 'c', name: 'Carol' },
  ])
  let s!: ReturnType<typeof useSortable<Item>>
  const e = effect(() => {
    s = useSortable<Item>({
      items,
      by: (i) => i.id,
      onReorder: (next) => items.set(next),
      label: (i) => i.name,
      ...extra,
    })
  })
  document.body.appendChild(container)
  s.containerRef(container)
  const els: Record<string, HTMLElement> = {}
  for (const it of items()) {
    const li = document.createElement(container.tagName === 'UL' ? 'li' : 'div')
    container.appendChild(li)
    s.itemRef(it.id)(li)
    els[it.id] = li
  }
  return { s, items, e, container, els }
}

const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
  )

describe('useSortable a11y roles + instructions placement', () => {
  it('keeps a consumer role, gives a non-list container role="list", leaves <ul> alone', async () => {
    const div = document.createElement('div')
    const { s, e, els } = await sortable({}, div)
    expect(div.getAttribute('role')).toBe('list')
    const custom = document.createElement('div')
    custom.setAttribute('role', 'option')
    s.itemRef('a')(custom)
    expect(custom.getAttribute('role')).toBe('option')
    expect(els.b!.getAttribute('role')).toBe('listitem')
    s.containerRef(null)
    expect(div.hasAttribute('role')).toBe(false)
    e.dispose()

    const ul = document.createElement('ul')
    const second = await sortable({}, ul)
    expect(ul.hasAttribute('role')).toBe(false)
    second.e.dispose()
  })

  it('a consumer role changed after mount is not stripped on cleanup', async () => {
    const div = document.createElement('div')
    const { s, e } = await sortable({}, div)
    div.setAttribute('role', 'grid')
    s.containerRef(null)
    expect(div.getAttribute('role')).toBe('grid')
    e.dispose()
  })

  it('a torn-down instructions host is replaced, and the old one cleans up alone', async () => {
    const first = await sortable({}, document.createElement('ul'))
    // A consumer wiping body (test teardown, a micro-frontend remount).
    document.body.innerHTML = ''
    const second = await sortable({}, document.createElement('ul'))
    const hosts = () => document.querySelectorAll('[data-pyreon-sortable-instructions-host]')
    expect(hosts()).toHaveLength(1)
    first.e.dispose()
    expect(hosts()).toHaveLength(1)
    second.e.dispose()
    expect(hosts()).toHaveLength(0)
  })

  it('the instructions node lives outside the container and is removed with it', async () => {
    const ul = document.createElement('ul')
    const { s, e, els } = await sortable({}, ul)
    expect(ul.querySelector('[data-pyreon-sortable-instructions]')).toBeNull()
    expect(ul.children).toHaveLength(3)
    const id = els.a!.getAttribute('aria-describedby')!
    const node = document.getElementById(id)!
    expect(node).not.toBeNull()
    expect(node.textContent).toMatch(/Space or Enter/)
    s.containerRef(null)
    expect(document.getElementById(id)).toBeNull()
    expect(document.querySelector('[data-pyreon-sortable-instructions-host]')).toBeNull()
    e.dispose()
  })
})

describe('useSortable keyboard pickup mode', () => {
  it('Space picks up, arrows move, Enter drops — with announcements', async () => {
    const { s, items, e, els } = await sortable()
    els.a!.focus()
    key(els.a!, ' ')
    expect(s.activeId()).toBe('a')
    expect(announced.at(-1)).toMatch(/Picked up Alice/)
    key(els.a!, 'ArrowDown')
    expect(items().map((i) => i.id)).toEqual(['b', 'a', 'c'])
    expect(announced.at(-1)).toMatch(/Alice.*position 2 of 3/)
    key(els.a!, 'ArrowDown')
    expect(items().map((i) => i.id)).toEqual(['b', 'c', 'a'])
    key(els.a!, 'ArrowDown') // at the end — no-op
    expect(items().map((i) => i.id)).toEqual(['b', 'c', 'a'])
    key(els.a!, 'Enter')
    expect(s.activeId()).toBeNull()
    expect(announced.at(-1)).toMatch(/Dropped Alice at position 3 of 3/)
    // Arrows without a pickup (and without Alt) do nothing.
    key(els.a!, 'ArrowUp')
    expect(items().map((i) => i.id)).toEqual(['b', 'c', 'a'])
    e.dispose()
  })

  it('Escape cancels and restores the original position', async () => {
    const { s, items, e, els } = await sortable()
    els.a!.focus()
    key(els.a!, 'Enter')
    key(els.a!, 'ArrowDown')
    key(els.a!, 'ArrowDown')
    expect(items().map((i) => i.id)).toEqual(['b', 'c', 'a'])
    key(els.a!, 'Escape')
    expect(items().map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(s.activeId()).toBeNull()
    expect(announced.at(-1)).toMatch(/cancelled.*Alice.*position 1 of 3/i)
    e.dispose()
  })

  it('ArrowUp moves while picked, other keys are inert, dispose mid-pickup clears state', async () => {
    const { s, items, e, els } = await sortable()
    els.c!.focus()
    key(els.c!, 'Enter')
    key(els.c!, 'ArrowUp')
    expect(items().map((i) => i.id)).toEqual(['a', 'c', 'b'])
    key(els.c!, 'Tab')
    expect(s.activeId()).toBe('c')
    e.dispose()
    expect(s.activeId()).toBeNull()
  })

  it('Space on a control INSIDE an item does not pick the item up', async () => {
    const { s, e, els } = await sortable()
    const btn = document.createElement('button')
    els.a!.appendChild(btn)
    btn.focus()
    key(btn, ' ')
    expect(s.activeId()).toBeNull()
    e.dispose()
  })

  it('Alt+Arrow still moves directly', async () => {
    const { items, e, els } = await sortable()
    els.b!.focus()
    key(els.b!, 'ArrowUp', { altKey: true })
    expect(items().map((i) => i.id)).toEqual(['b', 'a', 'c'])
    e.dispose()
  })

  it('disabled blocks keyboard reordering and pdnd dragging', async () => {
    const disabled = signal(true)
    const { items, e, els } = await sortable({ disabled: () => disabled() })
    els.a!.focus()
    key(els.a!, ' ')
    key(els.a!, 'ArrowDown')
    key(els.a!, 'ArrowDown', { altKey: true })
    expect(items().map((i) => i.id)).toEqual(['a', 'b', 'c'])
    const drag = live('draggable')[0]!.config
    expect(drag.canDrag()).toBe(false)
    disabled.set(false)
    expect(drag.canDrag()).toBe(true)
    e.dispose()
  })
})

describe('useSortable itemRef / cleanup identity', () => {
  it('a stale row ref(null) does not dispose the NEW row registered under the same key', async () => {
    const { s, e, container } = await sortable()
    const oldRef = s.itemRef('a')
    const oldEl = document.createElement('div')
    oldRef(oldEl)
    const newEl = document.createElement('div')
    container.appendChild(newEl)
    s.itemRef('a')(newEl)
    // The old row's unmount fires AFTER the new row mounted (keyed re-render).
    oldRef(null)
    expect(live('draggable').some((r) => r.config.element === newEl)).toBe(true)
    e.dispose()
  })

  it('a stale handle ref(null) keeps the replacement handle', async () => {
    const { s, e, els } = await sortable()
    const oldHandle = document.createElement('span')
    const oldRef = s.itemHandleRef('a')
    oldRef(oldHandle)
    const newHandle = document.createElement('span')
    s.itemHandleRef('a')(newHandle)
    oldRef(null)
    const reg = live('draggable').find((r) => r.config.element === els.a)!
    expect(reg.config.dragHandle).toBe(newHandle)
    e.dispose()
  })

  it('the focus-restore frame is cancelled when the sortable is disposed', async () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 4242)
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const { e, els } = await sortable()
    els.a!.focus()
    key(els.a!, 'ArrowDown', { altKey: true })
    expect(raf).toHaveBeenCalled()
    e.dispose()
    expect(caf).toHaveBeenCalledWith(4242)
  })
})

// ─── 7. useFileDrop ────────────────────────────────────────────────────────

describe('useFileDrop onReject + wildcards', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type })

  it('reports files rejected by accept and by maxFiles', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    const el = document.createElement('div')
    const onDrop = vi.fn()
    const onReject = vi.fn()
    const e = effect(() => {
      useFileDrop({ element: () => el, accept: ['image/*'], maxFiles: 1, onDrop, onReject })
    })
    await flush()
    const png = file('a.png', 'image/png')
    const png2 = file('b.png', 'image/png')
    const pdf = file('c.pdf', 'application/pdf')
    live('external')[0]!.config.onDrop({ source: { _files: [png, pdf, png2] } })
    expect(onDrop).toHaveBeenCalledWith([png])
    expect(onReject).toHaveBeenCalledWith([pdf], 'accept')
    expect(onReject).toHaveBeenCalledWith([png2], 'maxFiles')
    e.dispose()
  })

  it('"*" and "*/*" accept every file type', async () => {
    const { useFileDrop } = await import('../use-file-drop')
    for (const pattern of ['*', '*/*']) {
      const el = document.createElement('div')
      const onDrop = vi.fn()
      const e = effect(() => {
        useFileDrop({ element: () => el, accept: [pattern], onDrop })
      })
      await flush()
      const f = file('a.bin', 'application/octet-stream')
      live('external')
        .at(-1)!
        .config.onDrop({ source: { _files: [f] } })
      expect(onDrop).toHaveBeenCalledWith([f])
      e.dispose()
    }
  })
})
