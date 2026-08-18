import { describe, expect, it } from 'vitest'
import { h } from '@pyreon/core'
import { QueryClient, QueryClientProvider } from '@pyreon/query'
import { mount } from '@pyreon/runtime-dom'
import { z } from 'zod'
import { defineFeature } from '../define-feature'
import type { CellContext } from '../table-render'

const schema = z.object({
  id: z.number(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
})
type Row = z.infer<typeof schema>

const ROWS: Row[] = [
  { id: 1, title: 'Beta', status: 'draft' },
  { id: 2, title: 'Alpha', status: 'published' },
  { id: 3, title: 'Gamma', status: 'draft' },
]

function fetcherFor(rows: Row[]) {
  return (async () =>
    new Response(JSON.stringify(rows), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch
}

function makeFeature(rows: Row[] = ROWS) {
  return defineFeature<Row>({
    name: `t${Math.floor(performance.now() * 1000)}`,
    api: '/api/rows',
    schema,
    fetcher: fetcherFor(rows),
    initialValues: { id: 0, title: '', status: 'draft' },
  })
}

/** Mount under a QueryClient and wait for the list query to settle. */
async function renderTable(cmp: () => unknown) {
  const host = document.createElement('div')
  const client = new QueryClient()
  mount(h(QueryClientProvider, { client }, h(cmp as never, null)), host)
  await new Promise((r) => setTimeout(r, 40))
  return host
}

const texts = (host: HTMLElement, sel: string) =>
  [...host.querySelectorAll(sel)].map((n) => (n.textContent ?? '').trim())

describe('feature.Table', () => {
  it('renders a header per schema column and a row per record', async () => {
    const F = makeFeature()
    const host = await renderTable(() => {
      const t = F.useTable(ROWS)
      return h(F.Table, { of: t })
    })
    expect(host.querySelectorAll('thead th')).toHaveLength(3)
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(texts(host, 'tbody tr:first-child td')).toContain('Beta')
  })

  it('accepts a per-column cell renderer — the escape hatch', async () => {
    const F = makeFeature()
    const host = await renderTable(() => {
      const t = F.useTable(ROWS)
      return h(F.Table, {
        of: t,
        cell: {
          status: (ctx: CellContext<Row>) => h('span', { class: 'badge' }, `[${String(ctx.value)}]`),
        },
      })
    })
    const badges = host.querySelectorAll('.badge')
    expect(badges).toHaveLength(3)
    expect(badges[0]!.textContent).toBe('[draft]')
    // untouched columns still render normally
    expect(texts(host, 'td[data-col=title]')).toEqual(['Beta', 'Alpha', 'Gamma'])
  })

  it('hands the whole row to a cell renderer, not just the value', async () => {
    const F = makeFeature()
    const host = await renderTable(() => {
      const t = F.useTable(ROWS)
      return h(F.Table, {
        of: t,
        cell: { title: (ctx: CellContext<Row>) => h('i', null, `${ctx.row.id}:${String(ctx.value)}`) },
      })
    })
    expect(texts(host, 'td[data-col=title] i')).toEqual(['1:Beta', '2:Alpha', '3:Gamma'])
  })

  it('re-renders rows when the sort signal changes — the keyed-freeze trap', async () => {
    const F = makeFeature()
    let api!: ReturnType<typeof F.useTable>
    const host = await renderTable(() => {
      api = F.useTable(ROWS)
      return h(F.Table, { of: api })
    })
    expect(texts(host, 'td[data-col=title]')).toEqual(['Beta', 'Alpha', 'Gamma'])

    api.sorting.set([{ id: 'title', desc: false }])
    await new Promise((r) => setTimeout(r, 20))
    expect(texts(host, 'td[data-col=title]')).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('updates the SORT INDICATOR in a reused <th> — the exact freeze this guards', async () => {
    const F = makeFeature()
    let api!: ReturnType<typeof F.useTable>
    const host = await renderTable(() => {
      api = F.useTable(ROWS)
      return h(F.Table, { of: api })
    })
    const th = () => host.querySelectorAll('thead th')[1]!.textContent ?? ''
    expect(th()).not.toContain('↑')

    api.sorting.set([{ id: 'title', desc: false }])
    await new Promise((r) => setTimeout(r, 20))
    expect(th()).toContain('↑')

    api.sorting.set([{ id: 'title', desc: true }])
    await new Promise((r) => setTimeout(r, 20))
    expect(th()).toContain('↓')
  })

  it('renders `empty` when there are no rows', async () => {
    const F = makeFeature([])
    const host = await renderTable(() => {
      const t = F.useTable([])
      return h(F.Table, { of: t, empty: 'Nothing here' })
    })
    expect(host.querySelector('[data-empty]')).not.toBeNull()
    expect(host.textContent).toContain('Nothing here')
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('sortable={false} drops the handler and the indicator', async () => {
    const F = makeFeature()
    let api!: ReturnType<typeof F.useTable>
    const host = await renderTable(() => {
      api = F.useTable(ROWS)
      return h(F.Table, { of: api, sortable: false })
    })
    expect(host.querySelector('th[data-sortable]')).toBeNull()
    api.sorting.set([{ id: 'title', desc: false }])
    await new Promise((r) => setTimeout(r, 20))
    expect(host.querySelectorAll('thead th')[1]!.textContent).not.toContain('↑')
  })
})
