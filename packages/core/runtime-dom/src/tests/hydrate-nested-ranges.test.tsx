/**
 * Hydration when the SSR ranges NEST or the client's shape has moved.
 *
 * The walker locates each construct by scanning for its own comment markers,
 * and every scan of that kind has the same failure mode: an INNER construct's
 * closing marker read as the outer one's. The block then ends early, the
 * cursor lands mid-subtree, and every following sibling mismatches — a single
 * off-by-one that corrupts the rest of the page rather than the one row that
 * caused it.
 *
 * Nesting is not an edge case here. A list of cards each containing a list of
 * tags is the shape, and an async component rendering another async component
 * is what a route that awaits its layout produces.
 *
 * The second half is what happens when the client DISAGREES with the server:
 * a different key set, a row that renders nothing. The contract is a BAIL —
 * fall back to mounting fresh and drop the server's copy — and the thing that
 * must never happen is adopting half of it, which shows the user both.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot } from '../index'

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
  vi.restoreAllMocks()
})
const adopted = () => counts['runtime.mountFor.hydrateAdopt'] ?? 0

/** SSR a tree, park it in a live container, and hand it back for hydration. */
async function ssrInto(vnode: unknown): Promise<HTMLElement> {
  const html = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

// ─── Nested <For> ────────────────────────────────────────────────────────────

interface Card {
  id: number
  /** An ACCESSOR, not an array: a surviving keyed row is never re-rendered,
   *  so a plain array on the item would be frozen at its first value by
   *  design — the inner list has to carry its own reactive source. */
  tags: () => string[]
}

/** A list of cards, each card its own list of tags — nested `<For>` blocks. */
const nestedApp = (cards: () => Card[]) =>
  h(
    'div',
    null,
    h(For, {
      each: () => cards(),
      by: (c: Card) => c.id,
      children: (c: Card) =>
        h(
          'section',
          { class: 'card' },
          h(For, {
            each: () => c.tags(),
            by: (t: string) => t,
            children: (t: string) => h('span', { class: 'tag' }, t),
          }),
        ),
    }),
  )

/** A fixed-tag card, for the shapes that never mutate the inner list. */
const card = (id: number, tags: string[]): Card => ({ id, tags: () => tags })

describe('a <For> nested inside a <For>', () => {
  const cards: Card[] = [card(1, ['a', 'b']), card(2, ['c'])]

  it('SSRs both levels', async () => {
    // The control: without this, every assertion below could pass against a
    // server that rendered nothing.
    const host = await ssrInto(nestedApp(() => cards))
    expect(host.querySelectorAll('.card')).toHaveLength(2)
    expect(host.querySelectorAll('.tag')).toHaveLength(3)
  })

  it('hydrates to the SAME node count — the inner block does not close the outer', async () => {
    // If the inner `<!--/pyreon-for-->` were read as the outer's, the outer
    // block would end after card 1 and card 2's server DOM would be left
    // stranded beside a freshly mounted copy.
    const host = await ssrInto(nestedApp(() => cards))
    const dispose = hydrateRoot(host, nestedApp(() => cards))
    expect(host.querySelectorAll('.card')).toHaveLength(2)
    expect(host.querySelectorAll('.tag')).toHaveLength(3)
    expect(host.textContent).toBe('abc')
    dispose()
  })

  it('keeps node IDENTITY at BOTH levels', async () => {
    // Adoption is the whole point: a rebuilt subtree loses focus, scroll and
    // any listener a non-Pyreon script attached.
    const host = await ssrInto(nestedApp(() => cards))
    const cardsBefore = Array.from(host.querySelectorAll('.card'))
    const tagsBefore = Array.from(host.querySelectorAll('.tag'))
    const dispose = hydrateRoot(host, nestedApp(() => cards))
    expect(Array.from(host.querySelectorAll('.card'))).toEqual(cardsBefore)
    expect(Array.from(host.querySelectorAll('.tag'))).toEqual(tagsBefore)
    dispose()
  })

  it('stays reactive at the INNER level after hydrating', async () => {
    // Adopting DOM without wiring it is the silent half of a hydration bug:
    // the page looks right and never updates again.
    const tags = signal<string[]>(['a'])
    const one: Card[] = [{ id: 1, tags: () => tags() }]
    const host = await ssrInto(nestedApp(() => one))
    const dispose = hydrateRoot(host, nestedApp(() => one))
    tags.set(['a', 'z'])
    expect(host.textContent).toBe('az')
    dispose()
  })

  it('stays reactive at the OUTER level after hydrating', async () => {
    const live = signal<Card[]>([card(1, ['a'])])
    const host = await ssrInto(nestedApp(() => live()))
    const dispose = hydrateRoot(host, nestedApp(() => live()))
    live.set([card(1, ['a']), card(2, ['q'])])
    expect(host.querySelectorAll('.card')).toHaveLength(2)
    expect(host.textContent).toBe('aq')
    dispose()
  })

  it('removes a whole nested card without stranding its tags', async () => {
    // The marker of an outer row travels and dies with the row; a depth bug
    // here leaves the inner block's markers (and its DOM) behind.
    const live = signal<Card[]>(cards)
    const host = await ssrInto(nestedApp(() => live()))
    const dispose = hydrateRoot(host, nestedApp(() => live()))
    live.set([cards[1] as Card])
    expect(host.querySelectorAll('.card')).toHaveLength(1)
    expect(host.querySelectorAll('.tag')).toHaveLength(1)
    expect(host.textContent).toBe('c')
    dispose()
  })

  it('handles an outer row whose inner list is EMPTY', async () => {
    // An empty inner block is markers with nothing between them — the shape
    // that makes a "first node of the range" read land on the closing marker.
    const withEmpty: Card[] = [card(1, []), card(2, ['c'])]
    const host = await ssrInto(nestedApp(() => withEmpty))
    const dispose = hydrateRoot(host, nestedApp(() => withEmpty))
    expect(host.querySelectorAll('.card')).toHaveLength(2)
    expect(host.textContent).toBe('c')
    dispose()
  })
})

// ─── Client/server disagreement ──────────────────────────────────────────────

interface Row {
  id: number
}
const rowApp = (rows: () => Row[]) =>
  h(
    'div',
    null,
    h(For, {
      each: () => rows(),
      by: (r: Row) => r.id,
      children: (r: Row) => h('b', null, `r${r.id}`),
    }),
  )

describe('the client disagrees with the server', () => {
  it('ADOPTS when the keys match — the control for every bail below', async () => {
    const host = await ssrInto(rowApp(() => [{ id: 1 }, { id: 2 }]))
    const before = Array.from(host.querySelectorAll('b'))
    const dispose = hydrateRoot(host, rowApp(() => [{ id: 1 }, { id: 2 }]))
    expect(Array.from(host.querySelectorAll('b'))).toEqual(before)
    expect(adopted(), 'adoption ran').toBe(1)
    dispose()
  })

  it('renders the CLIENT truth when the keys differ', async () => {
    // The server said 1,2; the client says 7,8. Adopting by position would
    // paint the server's labels under the client's data.
    const host = await ssrInto(rowApp(() => [{ id: 1 }, { id: 2 }]))
    const dispose = hydrateRoot(host, rowApp(() => [{ id: 7 }, { id: 8 }]))
    expect(host.textContent).toBe('r7r8')
    dispose()
  })

  it('leaves NO stranded server rows behind after that bail', async () => {
    // The failure that matters is not "it re-rendered", it is "it rendered
    // both" — the user sees every row twice.
    const host = await ssrInto(rowApp(() => [{ id: 1 }, { id: 2 }]))
    const dispose = hydrateRoot(host, rowApp(() => [{ id: 7 }, { id: 8 }]))
    expect(host.querySelectorAll('b')).toHaveLength(2)
    dispose()
  })

  it('renders the client truth when the client has FEWER rows', async () => {
    const host = await ssrInto(rowApp(() => [{ id: 1 }, { id: 2 }, { id: 3 }]))
    const dispose = hydrateRoot(host, rowApp(() => [{ id: 1 }]))
    expect(host.querySelectorAll('b')).toHaveLength(1)
    expect(host.textContent).toBe('r1')
    dispose()
  })

  it('renders the client truth when the client has MORE rows', async () => {
    const host = await ssrInto(rowApp(() => [{ id: 1 }]))
    const dispose = hydrateRoot(host, rowApp(() => [{ id: 1 }, { id: 2 }]))
    expect(host.querySelectorAll('b')).toHaveLength(2)
    expect(host.textContent).toBe('r1r2')
    dispose()
  })

  it('renders the client truth when the ORDER differs', async () => {
    // Same keys, different order — the one disagreement adoption could
    // plausibly "fix" by reordering, and must not attempt blind.
    const host = await ssrInto(rowApp(() => [{ id: 1 }, { id: 2 }]))
    const dispose = hydrateRoot(host, rowApp(() => [{ id: 2 }, { id: 1 }]))
    expect(host.textContent).toBe('r2r1')
    expect(host.querySelectorAll('b')).toHaveLength(2)
    dispose()
  })

  it('stays REACTIVE after a bail', async () => {
    // A bail is a fallback, not a degraded mode. If the fresh mount forgot to
    // wire the rows, the page would be correct exactly once.
    const live = signal<Row[]>([{ id: 7 }])
    const host = await ssrInto(rowApp(() => [{ id: 1 }]))
    const dispose = hydrateRoot(host, rowApp(() => live()))
    expect(host.textContent).toBe('r7')
    live.set([{ id: 7 }, { id: 9 }])
    expect(host.textContent).toBe('r7r9')
    dispose()
  })

  it('survives a key containing the marker DELIMITER', async () => {
    // Row markers are `<!--k:KEY-->`. A key carrying a colon, a comment
    // terminator or a percent sign is where a parser that concatenates and
    // re-splits comes apart — and keys are user data.
    const keys = ['a:b', 'x--y', '100%', '<!--']
    const app = (ks: string[]) =>
      h(
        'div',
        null,
        h(For, {
          each: () => ks,
          by: (k: string) => k,
          children: (k: string) => h('b', null, k),
        }),
      )
    const host = await ssrInto(app(keys))
    const before = Array.from(host.querySelectorAll('b'))
    const dispose = hydrateRoot(host, app(keys))
    expect(host.querySelectorAll('b')).toHaveLength(4)
    expect(Array.from(host.querySelectorAll('b'))).toEqual(before)
    expect(host.textContent).toBe(keys.join(''))
    dispose()
  })
})

// ─── Nested async components ─────────────────────────────────────────────────

describe('an async component inside an async component', () => {
  const Inner = async () => {
    await Promise.resolve()
    return h('i', { class: 'inner' }, 'inner')
  }
  const Outer = async () => {
    await Promise.resolve()
    return h('section', { class: 'outer' }, h(Inner as never, null), h('u', null, 'tail'))
  }
  const app = () => h('div', null, h(Outer as never, null), h('p', null, 'after'))

  it('SSRs both levels', async () => {
    const host = await ssrInto(app())
    expect(host.querySelector('.inner')?.textContent).toBe('inner')
    expect(host.querySelector('p')?.textContent).toBe('after')
  })

  it('hydrates without duplicating either level', async () => {
    // The inner component's closing sentinel must not be read as the outer's:
    // the outer range would end early, and the sibling after it would be
    // hydrated against the wrong node.
    const host = await ssrInto(app())
    const dispose = hydrateRoot(host, app())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelectorAll('.outer')).toHaveLength(1)
    expect(host.querySelectorAll('.inner')).toHaveLength(1)
    expect(host.querySelectorAll('p')).toHaveLength(1)
    dispose()
  })

  it('leaves the SIBLING AFTER the async range intact', async () => {
    // This is the assertion an off-by-one on the closing marker actually
    // breaks — the async subtree looks fine and its neighbour is the casualty.
    const host = await ssrInto(app())
    const pBefore = host.querySelector('p')
    const dispose = hydrateRoot(host, app())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(host.querySelector('p')).toBe(pBefore)
    expect(host.querySelector('p')?.textContent).toBe('after')
    dispose()
  })
})
