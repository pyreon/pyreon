/**
 * `<For>` hydration when a ROW is not a single element.
 *
 * The adoption scan finds each row by walking the block's top-level siblings
 * for `<!--k:KEY-->` markers, which quietly assumes a row occupies one
 * contiguous, self-contained stretch of that walk. Three ordinary row shapes
 * break that assumption in different directions, and each has its own way of
 * going wrong: a row that renders a nested `<For>` puts that list's OWN
 * block markers into the walk, where reading the inner close as the outer's
 * ends the block early; a row that renders several roots spans a RANGE rather
 * than a node, so a scan that records one node per row loses the rest; and a
 * row that renders nothing at all leaves two adjacent markers with no content
 * between them, which is where "the first node of this row" reads the NEXT
 * row's marker.
 *
 * The visible cost of getting any of these wrong is the same and it is the
 * expensive kind: the server's copy of the list stays on the page beside the
 * client's, so the user sees every row twice and only one of the two responds.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hydrateRoot, mount } from '../index'

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
  document.body.innerHTML = ''
})
const adopted = () => counts['runtime.mountFor.hydrateAdopt'] ?? 0

async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

// ─── A row that renders nothing, on a plain client mount ─────────────────────

describe('a <For> row that renders null, mounted fresh', () => {
  // Hiding a row with `cond ? <Row/> : null` is the ordinary way to filter a
  // list without filtering the data — a permission gate, a search match, a
  // collapsed group. The row-mount path probed the result for a native-item
  // marker before checking it was a value at all, so ONE null row threw inside
  // the `<For>` effect. That is not a broken row, it is a broken LIST: the
  // throw escaped before any row was placed, so the element rendered as its
  // two markers and nothing else, and the only trace was an unhandled effect
  // error in the console. SSR renders the same source correctly, so it was a
  // guaranteed hydration divergence too.
  interface M {
    id: number
    show: boolean
  }
  const app = (rows: () => M[]) =>
    h(
      'div',
      null,
      h(For, {
        each: () => rows(),
        by: (r: M) => r.id,
        children: (r: M) => (r.show ? h('b', { class: 'leaf' }, `r${r.id}`) : null),
      }),
    )
  const mountInto = (rows: M[]) => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    const dispose = mount(app(() => rows) as never, c)
    return { c, dispose }
  }

  it('renders a list with NO null rows — the control', () => {
    const { c, dispose } = mountInto([
      { id: 1, show: true },
      { id: 2, show: true },
    ])
    expect(c.textContent).toBe('r1r2')
    dispose()
  })

  it('renders the OTHER rows when one is null', () => {
    const { c, dispose } = mountInto([
      { id: 1, show: true },
      { id: 2, show: false },
      { id: 3, show: true },
    ])
    expect(c.textContent).toBe('r1r3')
    expect(c.querySelectorAll('.leaf')).toHaveLength(2)
    dispose()
  })

  it('renders when the FIRST row is null', () => {
    const { c, dispose } = mountInto([
      { id: 1, show: false },
      { id: 2, show: true },
    ])
    expect(c.textContent).toBe('r2')
    dispose()
  })

  it('renders when the LAST row is null', () => {
    const { c, dispose } = mountInto([
      { id: 1, show: true },
      { id: 2, show: false },
    ])
    expect(c.textContent).toBe('r1')
    dispose()
  })

  it('renders when EVERY row is null', () => {
    const { c, dispose } = mountInto([
      { id: 1, show: false },
      { id: 2, show: false },
    ])
    expect(c.querySelectorAll('.leaf')).toHaveLength(0)
    dispose()
  })

  it('stays LIVE after a null row', () => {
    // The throw took the effect down with it, so nothing updated afterwards
    // either — the list was not merely empty, it was dead.
    const live = signal<M[]>([
      { id: 1, show: true },
      { id: 2, show: false },
    ])
    const c = document.createElement('div')
    document.body.appendChild(c)
    const dispose = mount(app(() => live()) as never, c)
    expect(c.textContent).toBe('r1')
    live.set([
      { id: 1, show: true },
      { id: 3, show: true },
    ])
    expect(c.textContent).toBe('r1r3')
    dispose()
  })

  it('MATCHES what the server rendered for the same data', () => {
    // The divergence assertion: SSR always rendered these rows, so a client
    // that dropped them could only ever disagree with its own server.
    const rows: M[] = [
      { id: 1, show: true },
      { id: 2, show: false },
      { id: 3, show: true },
    ]
    const { c, dispose } = mountInto(rows)
    return renderToString(app(() => rows) as never).then((html) => {
      const server = document.createElement('div')
      server.innerHTML = html
      expect(c.textContent).toBe(server.textContent)
      dispose()
    })
  })
})

// ─── A row that is itself a <For> ────────────────────────────────────────────

interface Group {
  id: number
  items: string[]
}

/** Groups rendered WITHOUT a wrapper element — the inner list's block markers
 *  therefore land in the outer block's own sibling walk. */
const groupApp = (groups: () => Group[]) =>
  h(
    'div',
    null,
    h(For, {
      each: () => groups(),
      by: (g2: Group) => g2.id,
      children: (g2: Group) =>
        h(For, {
          each: () => g2.items,
          by: (s: string) => s,
          children: (s: string) => h('b', { class: 'leaf' }, s),
        }),
    }),
  )

describe('a row that renders a nested <For> with no wrapper', () => {
  const groups: Group[] = [
    { id: 1, items: ['a', 'b'] },
    { id: 2, items: ['c'] },
  ]

  it('SSRs every leaf — the control', async () => {
    const host = await ssrInto(groupApp(() => groups))
    expect(host.querySelectorAll('.leaf')).toHaveLength(3)
  })

  it('hydrates to the same leaf COUNT', async () => {
    // Reading the inner block's close as the outer's ends the outer early, so
    // the groups past that point are mounted fresh beside their server copies.
    const host = await ssrInto(groupApp(() => groups))
    const dispose = hydrateRoot(host, groupApp(() => groups))
    expect(host.querySelectorAll('.leaf')).toHaveLength(3)
    expect(host.textContent).toBe('abc')
    dispose()
  })

  it('stays reactive at the OUTER level', async () => {
    const live = signal<Group[]>([{ id: 1, items: ['a'] }])
    const host = await ssrInto(groupApp(() => live()))
    const dispose = hydrateRoot(host, groupApp(() => live()))
    live.set([
      { id: 1, items: ['a'] },
      { id: 2, items: ['z'] },
    ])
    expect(host.textContent).toBe('az')
    dispose()
  })

  it('REMOVES a whole group without stranding its leaves', async () => {
    const live = signal<Group[]>(groups)
    const host = await ssrInto(groupApp(() => live()))
    const dispose = hydrateRoot(host, groupApp(() => live()))
    live.set([groups[1] as Group])
    expect(host.querySelectorAll('.leaf')).toHaveLength(1)
    expect(host.textContent).toBe('c')
    dispose()
  })

  it('handles a group whose inner list is EMPTY', async () => {
    // Two adjacent block markers with nothing between them.
    const withEmpty: Group[] = [
      { id: 1, items: [] },
      { id: 2, items: ['c'] },
    ]
    const host = await ssrInto(groupApp(() => withEmpty))
    const dispose = hydrateRoot(host, groupApp(() => withEmpty))
    expect(host.querySelectorAll('.leaf')).toHaveLength(1)
    expect(host.textContent).toBe('c')
    dispose()
  })
})

// ─── A row with several roots ────────────────────────────────────────────────

interface Pair {
  id: number
  a: string
  b: string
}
const pairApp = (pairs: () => Pair[]) =>
  h(
    'div',
    null,
    h(For, {
      each: () => pairs(),
      by: (p: Pair) => p.id,
      children: (p: Pair) => [h('dt', { class: 'k' }, p.a), h('dd', { class: 'v' }, p.b)],
    }),
  )

describe('a row that renders SEVERAL roots', () => {
  const pairs: Pair[] = [
    { id: 1, a: 'k1', b: 'v1' },
    { id: 2, a: 'k2', b: 'v2' },
  ]

  it('SSRs both roots of every row — the control', async () => {
    const host = await ssrInto(pairApp(() => pairs))
    expect(host.querySelectorAll('.k')).toHaveLength(2)
    expect(host.querySelectorAll('.v')).toHaveLength(2)
  })

  it('hydrates without duplicating the second root', async () => {
    // A row is a RANGE here, not a node. A scan that records only its first
    // node leaves every `<dd>` outside the row it belongs to — so removing the
    // row later leaves the `<dd>` behind, and hydrating it mounts a second one.
    const host = await ssrInto(pairApp(() => pairs))
    const dispose = hydrateRoot(host, pairApp(() => pairs))
    expect(host.querySelectorAll('.k')).toHaveLength(2)
    expect(host.querySelectorAll('.v')).toHaveLength(2)
    expect(host.textContent).toBe('k1v1k2v2')
    dispose()
  })

  it('REMOVES both roots when the row goes', async () => {
    // The assertion that catches a row range recorded one node short.
    const live = signal<Pair[]>(pairs)
    const host = await ssrInto(pairApp(() => live()))
    const dispose = hydrateRoot(host, pairApp(() => live()))
    live.set([pairs[1] as Pair])
    expect(host.querySelectorAll('.k')).toHaveLength(1)
    expect(host.querySelectorAll('.v'), 'the dd went with its dt').toHaveLength(1)
    expect(host.textContent).toBe('k2v2')
    dispose()
  })

  it('REORDERS both roots together', async () => {
    const live = signal<Pair[]>(pairs)
    const host = await ssrInto(pairApp(() => live()))
    const dispose = hydrateRoot(host, pairApp(() => live()))
    live.set([pairs[1] as Pair, pairs[0] as Pair])
    expect(host.textContent, 'each dd follows its own dt').toBe('k2v2k1v1')
    dispose()
  })
})

// ─── A row that renders nothing ──────────────────────────────────────────────

interface Maybe {
  id: number
  show: boolean
}
const maybeApp = (rows: () => Maybe[]) =>
  h(
    'div',
    null,
    h(For, {
      each: () => rows(),
      by: (r: Maybe) => r.id,
      children: (r: Maybe) => (r.show ? h('b', { class: 'leaf' }, `r${r.id}`) : null),
    }),
  )

describe('a row that renders NOTHING', () => {
  const rows: Maybe[] = [
    { id: 1, show: true },
    { id: 2, show: false },
    { id: 3, show: true },
  ]

  it('SSRs only the visible rows — the control', async () => {
    const host = await ssrInto(maybeApp(() => rows))
    expect(host.querySelectorAll('.leaf')).toHaveLength(2)
  })

  it('hydrates without duplicating the visible rows', async () => {
    // An empty row is two adjacent markers. "The first node of this row" then
    // reads the NEXT row's marker, and every row after it is off by one — the
    // block bails and the client's copy lands beside the server's.
    const host = await ssrInto(maybeApp(() => rows))
    const dispose = hydrateRoot(host, maybeApp(() => rows))
    expect(host.querySelectorAll('.leaf')).toHaveLength(2)
    expect(host.textContent).toBe('r1r3')
    dispose()
  })

  it('keeps the empty row\'s POSITION for the row that replaces it', async () => {
    // A surviving key is never re-rendered — that is the keyed contract, and
    // it means an empty row stays empty until its identity changes. What must
    // hold is that its placeholder held the SLOT: the replacement lands
    // between its neighbours rather than being appended at the end, which is
    // what an empty row recorded with no anchor of its own would do.
    const live = signal<Maybe[]>(rows)
    const host = await ssrInto(maybeApp(() => live()))
    const dispose = hydrateRoot(host, maybeApp(() => live()))
    live.set([
      { id: 1, show: true },
      { id: 20, show: true },
      { id: 3, show: true },
    ])
    expect(host.textContent, 'in its own position, not appended').toBe('r1r20r3')
    dispose()
  })

  it('handles EVERY row being empty', async () => {
    const allEmpty: Maybe[] = [
      { id: 1, show: false },
      { id: 2, show: false },
    ]
    const host = await ssrInto(maybeApp(() => allEmpty))
    const dispose = hydrateRoot(host, maybeApp(() => allEmpty))
    expect(host.querySelectorAll('.leaf')).toHaveLength(0)
    expect(adopted, 'no throw').toBeDefined()
    dispose()
  })

  it('removes an empty row without disturbing its neighbours', async () => {
    const live = signal<Maybe[]>(rows)
    const host = await ssrInto(maybeApp(() => live()))
    const dispose = hydrateRoot(host, maybeApp(() => live()))
    live.set([rows[0] as Maybe, rows[2] as Maybe])
    expect(host.textContent).toBe('r1r3')
    expect(host.querySelectorAll('.leaf')).toHaveLength(2)
    dispose()
  })
})
