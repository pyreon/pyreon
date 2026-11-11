/**
 * Scenario: **virtual list — `@pyreon/virtual` vs `@tanstack/react-virtual`**,
 * in a real browser.
 *
 * Both adapters wrap the same `@tanstack/virtual-core`, so the window math is
 * identical; this times how each adapter surfaces a scroll to the DOM. The
 * package's own comparison (`packages/fundamentals/virtual/bench/virtual-bench.ts`)
 * runs in happy-dom, which has no layout and a JavaScript DOM — fine for the
 * deterministic re-render COUNTS it leads with, not for wall-clock. This
 * scenario is the wall-clock answer.
 *
 * Arms:
 *  - **Pyreon** — idiomatic `@pyreon/virtual`, compiled by the real Pyreon
 *    compiler (`scenario-virtual-pyreon.tsx`).
 *  - **React 19 (react-virtual, memo rows)** — `React.memo` rows, the idiomatic
 *    fast shape. Its scroll response is committed inside `flushSync`.
 *  - **react-window 2**, **virtua (React)** — the two other popular React
 *    virtualizers (own window math; each renders its OWN scroll container, so
 *    the host only bounds it). React commits inside `flushSync`.
 *  - **Solid (solid-virtual)**, **Vue 3 (vue-virtual)** — the TanStack Solid and
 *    Vue adapters (same `virtual-core`). Solid is compiled by the real
 *    `babel-preset-solid`, Vue's template at build time (`vite-rivals.ts`).
 *    Vue's response is committed by awaiting `nextTick()` after EACH scroll
 *    event, so 60 steps are 60 renders, as 60 frames would be.
 *  - **Vue 3 (vue-virtual-scroller)** — `RecycleScroller`. Its scroll listener
 *    defers the window update to `requestAnimationFrame` (an rAF wait inside
 *    the timed window is barred by this suite's protocol), so its scroll ops
 *    apply the offset and call the component's documented, exposed
 *    `updateVisibleItems(false)` — the exact function that rAF callback runs —
 *    then await `nextTick()`. It recycles a pool of views, so its rows are
 *    re-labelled in place rather than created.
 *
 * Every arm is sized to the same window: 15 visible rows plus a 4-row (160px)
 * overscan/buffer each side, where the library exposes the knob (react-window
 * `overscanCount`, virtua `bufferSize`, RecycleScroller `buffer`).
 *
 * A scroll is driven the way the browser delivers one — `scrollTop` set, then a
 * `scroll` event — dispatched synchronously so the adapter's response lands in
 * the timed task (the browser's own deferred scroll event fires later, outside
 * it, and changes nothing because the offset is already applied).
 *
 * Every op VERIFIES the window it should have produced — every one of the 15
 * rows that fill the viewport at the expected offset is in the DOM, and the
 * window is bounded (≤ 60 rows) — outside the timed region. Requiring the whole
 * viewport (not one row) is what fails an arm whose first render waits for a
 * ResizeObserver measurement.
 */
import { h as ph } from '@pyreon/core'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { useVirtualizer as useReactVirtualizer } from '@tanstack/react-virtual'
import { useVirtualizer as useVueVirtualizer } from '@tanstack/vue-virtual'
import * as React from 'react'
import { flushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import { List as RwList } from 'react-window'
import { VList } from 'virtua'
import { RecycleScroller } from 'vue-virtual-scroller'
import { mountList as solidMountList } from 'virtual:rival-solid/virtual-tanstack'
import { render as vueVirtualRender } from 'virtual:rival-vue/virtual-tanstack'
import { render as vueScrollerRender } from 'virtual:rival-vue/virtual-scroller'
import { computed, createApp, defineComponent, nextTick, ref, shallowRef } from 'vue'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import { PyreonVirtualList } from './scenario-virtual-pyreon'
import { VIRTUAL_N, VIRTUAL_OVERSCAN, VIRTUAL_ROW, VIRTUAL_VIEWPORT } from './scenario-virtual-data'

export const VIRTUAL_FRAMEWORKS = [
  'Pyreon',
  'React 19 (react-virtual, memo rows)',
  'React 19 (react-window)',
  'React 19 (virtua)',
  'Solid (solid-virtual)',
  'Vue 3 (vue-virtual)',
  'Vue 3 (vue-virtual-scroller)',
] as const

const STEPS = 60
const STEP_ROWS = 5
const JUMP_ROW = 5000

interface VirtualTarget {
  mount(scroller: HTMLElement): () => void
  /** Apply a scroll offset and let the adapter respond inside the call. */
  scrollTo(scroller: HTMLElement, y: number): void | Promise<void>
  /** Commit after `mount` (Vue: the scheduler's `nextTick`). Inside the timed region. */
  settle?: () => Promise<void>
  /**
   * The library renders its own scroll container inside the host (react-window,
   * virtua's VList, RecycleScroller); the host then only bounds it, and scroll
   * ops target that inner element.
   */
  ownsScroller?: boolean
  /**
   * The first window is rendered by a ResizeObserver callback, not by the mount
   * call (virtua measures its viewport before rendering any item). The timed
   * mount would then hold an empty list, so the mount op is NOT timed for this
   * arm; setup waits for the first window outside every timed region.
   */
  firstWindowDeferred?: boolean
}

const fireScroll = (scroller: HTMLElement, y: number): void => {
  scroller.scrollTop = y
  scroller.dispatchEvent(new Event('scroll'))
}

function pyreonTarget(): VirtualTarget {
  return {
    mount(scroller) {
      return pyreonMount(ph(PyreonVirtualList, { scroller }), scroller)
    },
    scrollTo: fireScroll,
  }
}

function reactTarget(): VirtualTarget {
  const h = React.createElement
  const RowInner = (p: { index: number; transform: string; size: number }) =>
    h(
      'div',
      {
        className: 'row',
        'data-i': String(p.index),
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          transform: p.transform,
          height: p.size,
        },
      },
      `Row ${p.index}`,
    )
  const Row = React.memo(RowInner)
  function List(props: { scroller: HTMLElement }) {
    const v = useReactVirtualizer({
      count: VIRTUAL_N,
      getScrollElement: () => props.scroller,
      estimateSize: () => VIRTUAL_ROW,
      overscan: VIRTUAL_OVERSCAN,
    })
    return h(
      'div',
      { style: { height: v.getTotalSize(), position: 'relative' } },
      v
        .getVirtualItems()
        .map((vi) =>
          h(Row, {
            key: vi.key as React.Key,
            index: vi.index,
            transform: `translateY(${vi.start}px)`,
            size: vi.size,
          }),
        ),
    )
  }
  return {
    mount(scroller) {
      const root = ReactDOM.createRoot(scroller)
      flushSync(() => root.render(h(List, { scroller })))
      return () => root.unmount()
    },
    scrollTo: (scroller, y) => flushSync(() => fireScroll(scroller, y)),
  }
}

// react-window 2 — https://react-window.vercel.app/list/fixed-row-height
// (`<List rowComponent rowCount rowHeight rowProps>`; a pixel `style.height`
// sizes the list without a ResizeObserver pass, as its docs describe).
const RW_ROW_PROPS = {}
function reactWindowTarget(): VirtualTarget {
  const h = React.createElement
  function RowComponent(p: { index: number; style: React.CSSProperties; ariaAttributes: Record<string, unknown> }) {
    return h('div', { ...p.ariaAttributes, className: 'row', 'data-i': String(p.index), style: p.style }, `Row ${p.index}`)
  }
  return {
    ownsScroller: true,
    mount(host) {
      const root = ReactDOM.createRoot(host)
      flushSync(() =>
        root.render(
          h(RwList, {
            rowComponent: RowComponent,
            rowCount: VIRTUAL_N,
            rowHeight: VIRTUAL_ROW,
            rowProps: RW_ROW_PROPS,
            overscanCount: VIRTUAL_OVERSCAN,
            style: { height: VIRTUAL_VIEWPORT, width: 400 },
          } as never),
        ),
      )
      return () => root.unmount()
    },
    scrollTo: (el, y) => flushSync(() => fireScroll(el, y)),
  }
}

// virtua — https://github.com/inokawa/virtua#react (`<VList data style>{(item, i) => …}</VList>`,
// the lazy render-prop form for large lists; `itemSize` is its documented hint
// for fixed-size items).
const VIRTUA_DATA = Array.from({ length: VIRTUAL_N }, (_, i) => i)
function virtuaTarget(): VirtualTarget {
  const h = React.createElement
  const renderItem = (i: number) =>
    h('div', { key: i, className: 'row', 'data-i': String(i), style: { height: VIRTUAL_ROW } }, `Row ${i}`)
  return {
    ownsScroller: true,
    firstWindowDeferred: true,
    mount(host) {
      const root = ReactDOM.createRoot(host)
      flushSync(() =>
        root.render(
          h(VList, {
            data: VIRTUA_DATA,
            itemSize: VIRTUAL_ROW,
            bufferSize: VIRTUAL_OVERSCAN * VIRTUAL_ROW,
            style: { height: VIRTUAL_VIEWPORT, width: 400 },
            children: renderItem,
          } as never),
        ),
      )
      return () => root.unmount()
    },
    scrollTo: (el, y) => flushSync(() => fireScroll(el, y)),
  }
}

function solidVirtualTarget(): VirtualTarget {
  return {
    mount: (scroller) => solidMountList(scroller, VIRTUAL_N, VIRTUAL_ROW, VIRTUAL_OVERSCAN),
    scrollTo: fireScroll,
  }
}

function vueVirtualTarget(): VirtualTarget {
  return {
    mount(scroller) {
      const List = defineComponent({
        setup() {
          // Docs pattern: options in a `computed`, scroll element from a getter.
          const v = useVueVirtualizer(
            computed(() => ({
              count: VIRTUAL_N,
              getScrollElement: () => scroller,
              estimateSize: () => VIRTUAL_ROW,
              overscan: VIRTUAL_OVERSCAN,
            })),
          )
          return { v }
        },
        render: vueVirtualRender,
      })
      const app = createApp(List)
      app.mount(scroller)
      return () => app.unmount()
    },
    settle: () => nextTick(),
    scrollTo: async (el, y) => {
      fireScroll(el, y)
      await nextTick()
    },
  }
}

let vvsCssInjected = false
async function ensureVvsCss(): Promise<void> {
  if (vvsCssInjected) return
  vvsCssInjected = true
  await import('vue-virtual-scroller/dist/vue-virtual-scroller.css')
}
const VVS_ITEMS = Array.from({ length: VIRTUAL_N }, (_, i) => ({ id: i }))
function vueScrollerTarget(): VirtualTarget {
  let exposed: { updateVisibleItems: (itemsChanged: boolean) => unknown } | null = null
  return {
    ownsScroller: true,
    mount(host) {
      const App = defineComponent({
        components: { RecycleScroller },
        setup() {
          const scroller = ref<typeof exposed>(null)
          const items = shallowRef(VVS_ITEMS)
          return { scroller, items }
        },
        mounted() {
          exposed = (this as unknown as { scroller: typeof exposed }).scroller
        },
        render: vueScrollerRender,
      })
      const app = createApp(App)
      app.mount(host)
      return () => {
        app.unmount()
        exposed = null
      }
    },
    settle: () => nextTick(),
    scrollTo: async (el, y) => {
      el.scrollTop = y
      exposed!.updateVisibleItems(false)
      await nextTick()
    },
  }
}

const hasRow = (scroller: HTMLElement, i: number): boolean =>
  scroller.querySelector(`.row[data-i="${i}"]`) !== null

/** The element that actually scrolls: the host, or the library's own container inside it. */
function scrollElementOf(host: HTMLElement, owns: boolean | undefined): HTMLElement {
  if (!owns) return host
  for (const el of host.querySelectorAll<HTMLElement>('*')) {
    const o = getComputedStyle(el).overflowY
    if (o === 'auto' || o === 'scroll') return el
  }
  throw new Error('[virtual] no scroll container rendered inside the host')
}

function targetFor(frameworkName: string): VirtualTarget {
  switch (frameworkName) {
    case 'Pyreon':
      return pyreonTarget()
    case 'React 19 (react-virtual, memo rows)':
      return reactTarget()
    case 'React 19 (react-window)':
      return reactWindowTarget()
    case 'React 19 (virtua)':
      return virtuaTarget()
    case 'Solid (solid-virtual)':
      return solidVirtualTarget()
    case 'Vue 3 (vue-virtual)':
      return vueVirtualTarget()
    case 'Vue 3 (vue-virtual-scroller)':
      return vueScrollerTarget()
    default:
      throw new Error(`[virtual] unknown framework: ${frameworkName}`)
  }
}

/** Rows that fill the viewport. */
const VISIBLE = Math.ceil(VIRTUAL_VIEWPORT / VIRTUAL_ROW)

export async function runVirtual(
  frameworkName: string,
  container: HTMLElement,
): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const target = targetFor(frameworkName)
  if (frameworkName === 'Vue 3 (vue-virtual-scroller)') await ensureVvsCss()
  const scroller = document.createElement('div')
  scroller.style.cssText = target.ownsScroller
    ? `height:${VIRTUAL_VIEWPORT}px;overflow:hidden;position:relative;width:400px`
    : `height:${VIRTUAL_VIEWPORT}px;overflow:auto;position:relative;width:400px`
  container.appendChild(scroller)
  const el = (): HTMLElement => scrollElementOf(scroller, target.ownsScroller)

  const verifyAt = (row: number) => (): void => {
    for (let i = row; i < row + VISIBLE; i++) {
      if (!hasRow(scroller, i))
        throw new Error(`[virtual] row ${i} (of the viewport at row ${row}) is not rendered (scrollTop=${scroller.scrollTop}, inner scroll container: ${target.ownsScroller ? 'yes' : 'no'})`)
    }
    const n = scroller.querySelectorAll('.row').length
    if (n > 60) throw new Error(`[virtual] ${n} rows rendered — not a virtualized window`)
  }

  /** Untimed: wait (≤ 60 frames) for a deferred first window. */
  const firstWindow = async (): Promise<void> => {
    if (!target.firstWindowDeferred) return
    for (let f = 0; f < 60 && !hasRow(scroller, VISIBLE - 1); f++)
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
  }

  // ── Op 1: mount ───────────────────────────────────────────────────────────
  let teardown: (() => void) | null = null
  const clear = (): void => {
    teardown?.()
    teardown = null
    scroller.innerHTML = ''
    scroller.scrollTop = 0
  }
  if (!target.firstWindowDeferred) {
    await bench(
      `mount ${VIRTUAL_N.toLocaleString('en')}-row list`,
      suite,
      async () => {
        teardown = target.mount(scroller)
        await target.settle?.()
      },
      { reset: clear, verify: verifyAt(0) },
    )
    clear()
  }

  // Steady state for the scroll ops.
  teardown = target.mount(scroller)
  await target.settle?.()
  await firstWindow()
  verifyAt(0)()
  // Resolved once, outside every timed region (it walks computed styles).
  const sEl = el()

  // ── Op 2: a run of small scroll steps ─────────────────────────────────────
  await bench(
    `scroll ${STEPS} steps of ${STEP_ROWS} rows`,
    suite,
    async () => {
      for (let s = 1; s <= STEPS; s++) await target.scrollTo(sEl, s * STEP_ROWS * VIRTUAL_ROW)
    },
    {
      reset: () => target.scrollTo(sEl, 0),
      verify: verifyAt(STEPS * STEP_ROWS),
    },
  )

  // ── Op 3: jump to the middle ──────────────────────────────────────────────
  await bench(
    `jump to row ${JUMP_ROW.toLocaleString('en')}`,
    suite,
    async () => {
      await target.scrollTo(sEl, JUMP_ROW * VIRTUAL_ROW)
    },
    {
      reset: () => target.scrollTo(sEl, 0),
      verify: verifyAt(JUMP_ROW),
    },
  )
  await target.scrollTo(sEl, 0)

  // ── Op 4: unmount ─────────────────────────────────────────────────────────
  await bench(
    'unmount',
    suite,
    () => {
      teardown?.()
      teardown = null
    },
    {
      reset: async () => {
        scroller.innerHTML = ''
        scroller.scrollTop = 0
        teardown = target.mount(scroller)
        await target.settle?.()
        await firstWindow()
        verifyAt(0)()
      },
      verify: () => {
        if (scroller.querySelectorAll('.row').length !== 0)
          throw new Error('[virtual] rows survived unmount')
      },
    },
  )
  clear()
  scroller.remove()
  return suite
}
