import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'

// Real-Chromium coverage for clearing a `<For>` whose rows hold a reactive
// range (a conditional cell). The rows' cleanups run inside the bulk-detach
// window, so neither a row's branch nor its range marker is removed from the
// live table one by one: the single `replaceChildren` empties it. happy-dom
// implements `replaceChildren` as a `removeChild` loop, so the removal count is
// only meaningful here. Full matrix (compiled rows, keyed `.map()`, ownership):
// for-clear-bulk-dom-ops.test.tsx.
//
// Bisect-verified: running the clear's cleanups outside the window fails the
// removal assertion with `expected 900 to be +0` — 300 rows x (the h()-built
// `<tr>`, the branch, the range marker).

type Row = { id: number; done: ReturnType<typeof signal<boolean>> }

function mountRows(n: number) {
  const rows = signal<Row[]>([])
  const mk = (id: number): Row => ({ id, done: signal(id % 2 === 0) })
  const { container, unmount } = mountInBrowser(
    h(
      'table',
      null,
      h(
        'tbody',
        null,
        For({
          each: rows,
          by: (r: Row) => r.id,
          children: (r: Row) =>
            h('tr', null, h('td', null, () => (r.done() ? h('span', { class: 'done' }, 'done') : h('em', null, 'todo')))),
        }),
      ),
    ),
  )
  rows.set(Array.from({ length: n }, (_, i) => mk(i + 1)))
  return { rows, mk, container, unmount }
}

function countLiveRemovals(fn: () => void): number {
  const proto = Node.prototype as unknown as { removeChild: <T extends Node>(c: T) => T }
  const real = proto.removeChild
  let live = 0
  proto.removeChild = function <T extends Node>(this: Node, c: T): T {
    if (this.isConnected) live++
    return real.call(this, c) as T
  }
  try {
    fn()
  } finally {
    proto.removeChild = real
  }
  return live
}

describe('runtime-dom <For> — clear of rows with a conditional cell (real Chromium)', () => {
  it('clears 300 rows with zero live removeChild and an empty, reusable list', async () => {
    const { rows, mk, container, unmount } = mountRows(300)
    await flush()
    expect(container.querySelectorAll('tr')).toHaveLength(300)
    expect(container.querySelectorAll('span.done')).toHaveLength(150)

    const kept = rows.peek()
    expect(countLiveRemovals(() => rows.set([]))).toBe(0)
    await flush()
    expect(container.querySelectorAll('tr')).toHaveLength(0)
    expect(container.querySelector('tbody')?.childNodes).toHaveLength(2) // the list's markers

    // The cleared rows' conditional cells are disposed: flipping them renders nothing.
    for (const r of kept) r.done.set(!r.done.peek())
    await flush()
    expect(container.querySelectorAll('tr')).toHaveLength(0)

    // The list keeps working after the clear, branches included.
    rows.set([mk(1001), mk(1002)])
    await flush()
    expect(container.querySelectorAll('tr')).toHaveLength(2)
    expect(container.querySelectorAll('span.done')).toHaveLength(1)
    rows.peek()[0]!.done.set(true)
    await flush()
    expect(container.querySelectorAll('span.done')).toHaveLength(2)
    unmount()
  })
})
