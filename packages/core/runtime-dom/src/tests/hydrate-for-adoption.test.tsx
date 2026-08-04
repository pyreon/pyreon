/**
 * Regression lock — keyed `<For>` hydration ADOPTION.
 *
 * Pre-fix, a hydrating `<For>` did a correctness-first SWAP: mount fresh rows,
 * remove the SSR block ("True keyed ADOPTION via the <!--k:KEY--> markers is a
 * perf follow-up" — this is that follow-up). Now, when the client's first
 * items align 1:1 with the SSR rows (count, keys, order), each row's vnode
 * hydrates IN PLACE against its marker-bounded DOM range; any mismatch bails
 * to the swap. The load-bearing assertion is NODE IDENTITY: a pre-hydration
 * element must be the SAME object post-hydration.
 *
 * Bisect-verified: forcing `tryAdoptSsrRows` to return false (swap-always)
 * fails every identity + hydrateAdopt-counter spec below while the
 * behavior/mismatch specs still pass (the bail path IS the old behavior);
 * restored, all pass.
 */
import { For, h } from '@pyreon/core'
import { createSelector, signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot } from '../index'

// ─── Local counter sink ──────────────────────────────────────────────────────
const g = globalThis as { __pyreon_count__?: ((name: string, n?: number) => void) | undefined }
let counts: Record<string, number>
let prevSink: typeof g.__pyreon_count__
beforeEach(() => {
  counts = {}
  prevSink = g.__pyreon_count__
  g.__pyreon_count__ = (name, n = 1) => {
    counts[name] = (counts[name] ?? 0) + n
  }
})
afterEach(() => {
  g.__pyreon_count__ = prevSink
})
const adopted = () => counts['runtime.mountFor.hydrateAdopt'] ?? 0

interface RowData {
  id: number
  label: ReturnType<typeof signal<string>>
}

const makeApp = (
  rows: () => RowData[],
  isSelected: (id: number) => boolean = () => false,
  onSelect: (id: number) => void = () => {},
) =>
  h(
    'div',
    null,
    h(For, {
      each: () => rows(),
      by: (r: RowData) => r.id,
      children: (r: RowData) =>
        h(
          'b',
          { class: () => (isSelected(r.id) ? 'sel' : ''), onClick: () => onSelect(r.id) },
          () => r.label(),
        ),
    }),
  )

const mk = (ids: number[]): RowData[] => ids.map((id) => ({ id, label: signal(`L${id}`) }))

/** SSR the app, inject into a container, return it. */
async function ssrInto(rows: RowData[]): Promise<HTMLElement> {
  const html = await renderToString(
    makeApp(
      () => rows,
      () => false,
    ),
  )
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('For hydration — keyed adoption', () => {
  it('ADOPTS the SSR rows: pre-hydration nodes keep their identity', async () => {
    const ssrRows = mk([1, 2, 3])
    const host = await ssrInto(ssrRows)
    const before = Array.from(host.querySelectorAll('b'))
    expect(before).toHaveLength(3)

    const clientRows = signal(mk([1, 2, 3]))
    const dispose = hydrateRoot(host, makeApp(() => clientRows()))
    const after = Array.from(host.querySelectorAll('b'))
    expect(after).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(after[i]).toBe(before[i]) // same node objects
    expect(adopted()).toBe(1)
    // k: markers removed
    expect(host.innerHTML).not.toContain('k:')
    dispose()
  })

  it('adopted rows are REACTIVE: label flip + selector class patch in place', async () => {
    const host = await ssrInto(mk([1, 2]))
    const clientRows = signal(mk([1, 2]))
    const selectedId = signal<number | null>(null)
    const isSelected = createSelector(selectedId)
    const dispose = hydrateRoot(
      host,
      makeApp(
        () => clientRows(),
        isSelected,
        (id) => selectedId.set(id),
      ),
    )
    const bs = host.querySelectorAll('b')
    clientRows()[0]!.label.set('CHANGED')
    expect(bs[0]!.textContent).toBe('CHANGED')
    selectedId.set(2)
    expect(bs[1]!.className).toBe('sel')
    expect(adopted()).toBe(1)
    dispose()
  })

  it('adopted entries feed the normal reconciler: append, remove, reorder after hydration', async () => {
    const host = await ssrInto(mk([1, 2, 3]))
    const clientRows = signal(mk([1, 2, 3]))
    const dispose = hydrateRoot(host, makeApp(() => clientRows()))
    const texts = () => Array.from(host.querySelectorAll('b')).map((b) => b.textContent)
    expect(adopted()).toBe(1)

    clientRows.set([...clientRows(), ...mk([4])]) // append (insertFast territory)
    expect(texts()).toEqual(['L1', 'L2', 'L3', 'L4'])
    const shrunk = [...clientRows()]
    shrunk.splice(1, 1) // remove id 2
    clientRows.set(shrunk)
    expect(texts()).toEqual(['L1', 'L3', 'L4'])
    clientRows.set([...clientRows()].reverse()) // reorder
    expect(texts()).toEqual(['L4', 'L3', 'L1'])
    dispose()
  })

  it('BAILS to swap on key mismatch (different ids) — DOM matches CLIENT items', async () => {
    const host = await ssrInto(mk([1, 2, 3]))
    const clientRows = signal(mk([1, 99, 3])) // middle key differs
    const dispose = hydrateRoot(host, makeApp(() => clientRows()))
    expect(Array.from(host.querySelectorAll('b')).map((b) => b.textContent)).toEqual([
      'L1',
      'L99',
      'L3',
    ])
    expect(adopted()).toBe(0)
    dispose()
  })

  it('BAILS on count mismatch (SSR 3 rows, client 2) — no duplicates, no leftovers', async () => {
    const host = await ssrInto(mk([1, 2, 3]))
    const clientRows = signal(mk([1, 2]))
    const dispose = hydrateRoot(host, makeApp(() => clientRows()))
    expect(host.querySelectorAll('b')).toHaveLength(2)
    expect(adopted()).toBe(0)
    dispose()
  })

  it('BAILS on reordered keys — DOM ends in client order', async () => {
    const host = await ssrInto(mk([1, 2, 3]))
    const clientRows = signal(mk([3, 2, 1]))
    const dispose = hydrateRoot(host, makeApp(() => clientRows()))
    expect(Array.from(host.querySelectorAll('b')).map((b) => b.textContent)).toEqual([
      'L3',
      'L2',
      'L1',
    ])
    expect(adopted()).toBe(0)
    dispose()
  })

  it('adopts STRING keys with characters the marker encoding escapes', async () => {
    interface SRow {
      id: string
      label: ReturnType<typeof signal<string>>
    }
    const mkS = (ids: string[]): SRow[] => ids.map((id) => ({ id, label: signal(`v-${id}`) }))
    const app = (rows: () => SRow[]) =>
      h(
        'div',
        null,
        h(For, {
          each: () => rows(),
          by: (r: SRow) => r.id,
          children: (r: SRow) => h('b', null, () => r.label()),
        }),
      )
    const ssrRows = mkS(['a-b', 'c d', 'x--><y'])
    const html = await renderToString(app(() => ssrRows))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const before = Array.from(host.querySelectorAll('b'))

    const clientRows = signal(mkS(['a-b', 'c d', 'x--><y']))
    const dispose = hydrateRoot(host, app(() => clientRows()))
    const after = Array.from(host.querySelectorAll('b'))
    expect(after).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(after[i]).toBe(before[i])
    expect(adopted()).toBe(1)
    dispose()
  })

  it('nested <For> — outer AND inner blocks adopt', async () => {
    interface Group {
      id: number
      items: ReturnType<typeof signal<RowData[]>>
    }
    const mkG = (): Group[] => [
      { id: 1, items: signal(mk([11, 12])) },
      { id: 2, items: signal(mk([21])) },
    ]
    const app = (groups: () => Group[]) =>
      h(
        'div',
        null,
        h(For, {
          each: () => groups(),
          by: (gr: Group) => gr.id,
          children: (gr: Group) =>
            h(
              'section',
              null,
              h(For, {
                each: () => gr.items(),
                by: (r: RowData) => r.id,
                children: (r: RowData) => h('b', null, () => r.label()),
              }),
            ),
        }),
      )
    const html = await renderToString(app(mkG))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const before = Array.from(host.querySelectorAll('b'))
    expect(before).toHaveLength(3)

    const clientGroups = signal(mkG())
    const dispose = hydrateRoot(host, app(() => clientGroups()))
    const after = Array.from(host.querySelectorAll('b'))
    expect(after).toHaveLength(3)
    for (let i = 0; i < 3; i++) expect(after[i]).toBe(before[i])
    expect(adopted()).toBe(3) // outer + 2 inner blocks
    dispose()
  })
})
