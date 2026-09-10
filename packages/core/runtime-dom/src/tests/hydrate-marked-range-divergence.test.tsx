/**
 * Divergence inside a MARKED accessor range, and inside a `<For>` block whose
 * markers do not say what the client expects.
 *
 * These are the modern SSR shapes — every function child is bracketed by
 * `<!--$-->…<!--/$-->`, every keyed row by `<!--k:KEY-->` — so this is the path
 * a current server/client pair actually takes when the two disagree. They
 * disagree routinely: a timestamp, a locale, a random id, a feature flag read
 * from a cookie on one side and a store on the other, or simply a CDN serving
 * a page rendered before the last deploy.
 *
 * The adopt path is deliberately NOT gated on the value matching — it takes the
 * server's node and lets the binding write the client's value over it, so
 * recovery is a text write rather than a rebuild. That is the right trade, and
 * it is only safe while the divergence is still REPORTED: correcting silently
 * is how a whole class of these ships unnoticed, because the page ends up
 * right and nobody learns the two renderers disagree.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot } from '../index'
import { query } from '@pyreon/test-utils'

let warn: { mock: { calls: unknown[][] } }
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as unknown as typeof warn
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const mismatches = () =>
  warn.mock.calls.filter((c: unknown[]) => String(c[0]).toLowerCase().includes('hydration')).length

/** SSR a tree, optionally tamper with the markup, and park it live. */
async function ssrInto(vnode: unknown, tamper?: (html: string) => string): Promise<HTMLElement> {
  const raw = await renderToString(vnode as never)
  const host = document.createElement('div')
  host.innerHTML = tamper ? tamper(raw) : raw
  document.body.appendChild(host)
  return host
}

describe('a marked accessor range whose text diverged', () => {
  // A SIBLING keeps the accessor from being the element's sole child, which is
  // the shape whose markers the server elides.
  const app = (value: () => string) => h('div', { class: 'a' }, h('b', null, 's'), value)

  it('ADOPTS the server text node when the values agree', async () => {
    // The control. Adoption is the point: rebuilding loses focus, scroll and
    // anything a non-Pyreon script attached.
    const host = await ssrInto(app(() => 'SAME'))
    const before = Array.from(host.querySelector('.a')?.childNodes ?? []).find(
      (n) => n.nodeType === 3 && n.textContent === 'SAME',
    )
    const dispose = hydrateRoot(host, app(() => 'SAME'))
    expect(host.querySelector('.a')?.textContent).toBe('sSAME')
    expect(
      Array.from(host.querySelector('.a')?.childNodes ?? []).includes(before as ChildNode),
      'same text node',
    ).toBe(true)
    expect(mismatches()).toBe(0)
    dispose()
  })

  it('takes the CLIENT value when they diverge', async () => {
    const host = await ssrInto(app(() => 'FRESH'), (h2) => h2.replace('FRESH', 'STALE'))
    expect(host.textContent, 'the server really said STALE').toContain('STALE')
    const dispose = hydrateRoot(host, app(() => 'FRESH'))
    expect(host.querySelector('.a')?.textContent).toBe('sFRESH')
    dispose()
  })

  it('REPORTS that divergence', async () => {
    // The load-bearing half. Without it the page is right and the disagreement
    // between the two renderers is invisible — including to the production
    // telemetry hook that exists for exactly this.
    const host = await ssrInto(app(() => 'FRESH'), (h2) => h2.replace('FRESH', 'STALE'))
    const dispose = hydrateRoot(host, app(() => 'FRESH'))
    expect(mismatches()).toBeGreaterThan(0)
    dispose()
  })

  it('ADOPTS the node rather than rebuilding it, even when correcting', async () => {
    // The design choice this path exists to make: correct in place. A rebuild
    // here would be the cheapest possible implementation and would throw away
    // the node's identity for a one-character difference.
    const host = await ssrInto(app(() => 'FRESH'), (h2) => h2.replace('FRESH', 'STALE'))
    const el = query<HTMLElement>(host, '.a')
    const before = Array.from(el.childNodes).find((n) => n.nodeType === 3)
    const dispose = hydrateRoot(host, app(() => 'FRESH'))
    const after = Array.from(el.childNodes).find((n) => n.nodeType === 3)
    expect(after, 'the same node, rewritten').toBe(before)
    dispose()
  })

  it('stays LIVE after correcting', async () => {
    const v = signal('FRESH')
    const host = await ssrInto(app(() => 'FRESH'), (h2) => h2.replace('FRESH', 'STALE'))
    const dispose = hydrateRoot(host, app(() => v()))
    v.set('NEWER')
    expect(host.querySelector('.a')?.textContent).toBe('sNEWER')
    dispose()
  })

  it('keeps the SIBLING in place through the correction', async () => {
    const host = await ssrInto(app(() => 'FRESH'), (h2) => h2.replace('FRESH', 'STALE'))
    const bBefore = host.querySelector('b')
    const dispose = hydrateRoot(host, app(() => 'FRESH'))
    expect(host.querySelector('b'), 'adopted, not rebuilt').toBe(bBefore)
    expect(host.querySelector('.a')?.firstChild, 'and still first').toBe(bBefore)
    dispose()
  })
})

describe('a <For> block whose ENCODED row keys diverged', () => {
  // Keys are user data, so they routinely contain characters the marker
  // grammar has to escape — a slug, an email, a path. The encoded form is a
  // second comparison path, and one that a same-length key set reaches only
  // after the cheap checks pass.
  const app = (keys: () => string[]) =>
    h(
      'div',
      null,
      h(For, {
        each: () => keys(),
        by: (k: string) => k,
        children: (k: string) => h('b', { class: 'row' }, k),
      }),
    )

  it('ADOPTS when the encoded keys match — the control', async () => {
    const keys = ['a b', 'c/d']
    const host = await ssrInto(app(() => keys))
    const before = Array.from(host.querySelectorAll('.row'))
    const dispose = hydrateRoot(host, app(() => keys))
    expect(Array.from(host.querySelectorAll('.row'))).toEqual(before)
    dispose()
  })

  it('renders the CLIENT rows when the encoded keys differ', async () => {
    // Same count, same shape, different identities — the case a length check
    // cannot see and only the key comparison catches.
    const host = await ssrInto(app(() => ['a b', 'c/d']))
    const dispose = hydrateRoot(host, app(() => ['x y', 'z/w']))
    expect(host.textContent).toBe('x yz/w')
    expect(host.querySelectorAll('.row'), 'no stranded server rows').toHaveLength(2)
    dispose()
  })

  it('stays reactive after that bail', async () => {
    const live = signal(['x y'])
    const host = await ssrInto(app(() => ['a b']))
    const dispose = hydrateRoot(host, app(() => live()))
    live.set(['x y', 'q r'])
    expect(host.textContent).toBe('x yq r')
    dispose()
  })

  it('renders the client rows when only ONE encoded key differs', async () => {
    const host = await ssrInto(app(() => ['a b', 'same']))
    const dispose = hydrateRoot(host, app(() => ['x y', 'same']))
    expect(host.textContent).toBe('x ysame')
    expect(host.querySelectorAll('.row')).toHaveLength(2)
    dispose()
  })
})

describe('a <For> block whose end marker is missing', () => {
  it('still renders the client list', async () => {
    // Truncated markup — a stream that died, a sanitizer that stripped
    // comments, a CDN that rewrote the page. The block cannot be parsed, so
    // adoption is impossible; rendering the client's list anyway is the only
    // outcome that leaves the user with a working page.
    const app = (n: number) =>
      h(
        'div',
        null,
        h(For, {
          each: () => Array.from({ length: n }, (_, i) => i),
          by: (i: number) => i,
          children: (i: number) => h('b', { class: 'row' }, `r${i}`),
        }),
      )
    const host = await ssrInto(app(2), (h2) => h2.replace('<!--/pyreon-for-->', ''))
    const dispose = hydrateRoot(host, app(2))
    expect(host.textContent).toBe('r0r1')
    expect(host.querySelectorAll('.row'), 'exactly one copy').toHaveLength(2)
    dispose()
  })

  it('still renders when the row markers are gone', async () => {
    const app = (n: number) =>
      h(
        'div',
        null,
        h(For, {
          each: () => Array.from({ length: n }, (_, i) => i),
          by: (i: number) => i,
          children: (i: number) => h('b', { class: 'row' }, `r${i}`),
        }),
      )
    const host = await ssrInto(app(2), (h2) => h2.replace(/<!--k:\d+-->/g, ''))
    const dispose = hydrateRoot(host, app(2))
    expect(host.textContent).toBe('r0r1')
    expect(host.querySelectorAll('.row')).toHaveLength(2)
    dispose()
  })
})
