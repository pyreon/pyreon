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
 *
 * A scroll is driven the way the browser delivers one — `scrollTop` set, then a
 * `scroll` event — dispatched synchronously so the adapter's response lands in
 * the timed task (the browser's own deferred scroll event fires later, outside
 * it, and changes nothing because the offset is already applied).
 *
 * Every op VERIFIES the window it should have produced (the expected row index
 * is in the DOM), outside the timed region.
 */
import { h as ph } from '@pyreon/core'
import { mount as pyreonMount } from '@pyreon/runtime-dom'
import { useVirtualizer as useReactVirtualizer } from '@tanstack/react-virtual'
import * as React from 'react'
import { flushSync } from 'react-dom'
import * as ReactDOM from 'react-dom/client'
import type { BenchSuite } from '../runner'
import { bench } from '../runner'
import { PyreonVirtualList } from './scenario-virtual-pyreon'
import { VIRTUAL_N, VIRTUAL_OVERSCAN, VIRTUAL_ROW, VIRTUAL_VIEWPORT } from './scenario-virtual-data'

export const VIRTUAL_FRAMEWORKS = ['Pyreon', 'React 19 (react-virtual, memo rows)'] as const

const STEPS = 60
const STEP_ROWS = 5
const JUMP_ROW = 5000

interface VirtualTarget {
  mount(scroller: HTMLElement): () => void
  /** Apply a scroll offset and let the adapter respond inside the call. */
  scrollTo(scroller: HTMLElement, y: number): void
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

const hasRow = (scroller: HTMLElement, i: number): boolean =>
  scroller.querySelector(`.row[data-i="${i}"]`) !== null

export async function runVirtual(
  frameworkName: string,
  container: HTMLElement,
): Promise<BenchSuite> {
  const suite: BenchSuite = { framework: frameworkName, container, results: [] }
  const target = frameworkName === 'Pyreon' ? pyreonTarget() : reactTarget()
  const scroller = document.createElement('div')
  scroller.style.cssText = `height:${VIRTUAL_VIEWPORT}px;overflow:auto;position:relative;width:400px`
  container.appendChild(scroller)

  const verifyAt = (row: number) => (): void => {
    if (!hasRow(scroller, row))
      throw new Error(`[virtual] row ${row} is not rendered at scrollTop=${scroller.scrollTop}`)
    const n = scroller.querySelectorAll('.row').length
    if (n === 0 || n > 60)
      throw new Error(`[virtual] ${n} rows rendered — not a virtualized window`)
  }

  // ── Op 1: mount ───────────────────────────────────────────────────────────
  let teardown: (() => void) | null = null
  const clear = (): void => {
    teardown?.()
    teardown = null
    scroller.innerHTML = ''
    scroller.scrollTop = 0
  }
  await bench(
    `mount ${VIRTUAL_N.toLocaleString('en')}-row list`,
    suite,
    () => {
      teardown = target.mount(scroller)
    },
    { reset: clear, verify: verifyAt(0) },
  )
  clear()

  // Steady state for the scroll ops.
  teardown = target.mount(scroller)
  verifyAt(0)()

  // ── Op 2: a run of small scroll steps ─────────────────────────────────────
  await bench(
    `scroll ${STEPS} steps of ${STEP_ROWS} rows`,
    suite,
    () => {
      for (let s = 1; s <= STEPS; s++) target.scrollTo(scroller, s * STEP_ROWS * VIRTUAL_ROW)
    },
    {
      reset: () => target.scrollTo(scroller, 0),
      verify: verifyAt(STEPS * STEP_ROWS),
    },
  )

  // ── Op 3: jump to the middle ──────────────────────────────────────────────
  await bench(
    `jump to row ${JUMP_ROW.toLocaleString('en')}`,
    suite,
    () => {
      target.scrollTo(scroller, JUMP_ROW * VIRTUAL_ROW)
    },
    {
      reset: () => target.scrollTo(scroller, 0),
      verify: verifyAt(JUMP_ROW),
    },
  )
  target.scrollTo(scroller, 0)

  // ── Op 4: unmount ─────────────────────────────────────────────────────────
  await bench(
    'unmount',
    suite,
    () => {
      teardown?.()
      teardown = null
    },
    {
      reset: () => {
        scroller.innerHTML = ''
        scroller.scrollTop = 0
        teardown = target.mount(scroller)
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
