/**
 * Hydrating markup an OLDER server produced — no `<!--$-->` range markers.
 *
 * This is not a museum path. HTML is the most cacheable thing a deploy emits:
 * a CDN, a service worker or a prerendered file can serve a page rendered by
 * the previous release to a client bundle from this one, and the client has to
 * attach to it rather than blank the page. The marker-less walk is what that
 * costs, and it is also where a server/client TEXT divergence surfaces —
 * a timestamp, a locale-formatted number, anything the two sides compute
 * independently.
 *
 * The contract in every case below is the same and it has three parts, all of
 * which have to hold together: the CLIENT's value wins (the server's copy is
 * the stale one), the divergence is REPORTED rather than absorbed, and the
 * surrounding siblings keep their order — because the failure that actually
 * costs a page is not the one wrong word, it is a recovery that appends at the
 * parent instead of the cursor and shuffles everything after it.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot } from '../index'

let warn: { mock: { calls: unknown[][] } }
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as unknown as typeof warn
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** Park hand-written (marker-less) server HTML in a live container. */
const serverHtml = (html: string): HTMLElement => {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

const mismatches = () =>
  warn.mock.calls.filter((c: unknown[]) => String(c[0]).toLowerCase().includes('hydration')).length

describe('a reactive text binding against marker-less server HTML', () => {
  it('ADOPTS a matching text node silently', () => {
    // The control. Every assertion below is about a DIVERGENCE, and a walker
    // that warned on agreement too would make the warning worthless.
    const host = serverHtml('<div class="a">abc</div>')
    const before = host.querySelector('.a')?.firstChild
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 'abc'))
    expect(host.querySelector('.a')?.textContent).toBe('abc')
    expect(host.querySelector('.a')?.firstChild, 'same text node').toBe(before)
    expect(mismatches()).toBe(0)
    dispose()
  })

  it('stays LIVE after adopting', () => {
    // Adopting DOM without binding it is the silent half of every hydration
    // bug: the page looks right and never changes again.
    const v = signal('abc')
    const host = serverHtml('<div class="a">abc</div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => v()))
    v.set('zzz')
    expect(host.querySelector('.a')?.textContent).toBe('zzz')
    dispose()
  })

  it('lets the CLIENT value win when the server text differs', () => {
    // A server-rendered timestamp against a client-rendered one. The server's
    // is the stale value by construction.
    const host = serverHtml('<div class="a">STALE</div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 'FRESH'))
    expect(host.querySelector('.a')?.textContent).toBe('FRESH')
    dispose()
  })

  it('REPORTS that divergence instead of absorbing it', () => {
    // Silently correcting is how a whole class of these ships unnoticed: the
    // page is right, so nobody learns the two renderers disagree.
    const host = serverHtml('<div class="a">STALE</div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 'FRESH'))
    expect(mismatches()).toBeGreaterThan(0)
    dispose()
  })

  it('stays LIVE after correcting a diverged value', () => {
    const v = signal('FRESH')
    const host = serverHtml('<div class="a">STALE</div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => v()))
    v.set('NEWER')
    expect(host.querySelector('.a')?.textContent).toBe('NEWER')
    dispose()
  })

  it('keeps the FOLLOWING SIBLING in place through that correction', () => {
    // The expensive failure. Recovering at the parent's anchor rather than at
    // the cursor puts the corrected text after everything that follows it, so
    // one wrong word reorders the rest of the element.
    const host = serverHtml('<div class="a">STALE<b class="tail">T</b></div>')
    const dispose = hydrateRoot(
      host,
      h('div', { class: 'a' }, () => 'FRESH', h('b', { class: 'tail' }, 'T')),
    )
    expect(host.querySelector('.a')?.textContent).toBe('FRESHT')
    expect((host.querySelector('.a') as HTMLElement).lastElementChild?.className).toBe('tail')
    dispose()
  })

  it('SPLITS a merged text node and leaves the remainder for its sibling', () => {
    // The HTML parser merges adjacent text, so two bindings that rendered
    // "ab" and "cd" arrive as one "abcd" node. Consuming the whole node for
    // the first binding would swallow the second's text.
    const host = serverHtml('<div class="a">abcd</div>')
    const dispose = hydrateRoot(
      host,
      h('div', { class: 'a' }, () => 'ab', () => 'cd'),
    )
    expect(host.querySelector('.a')?.textContent).toBe('abcd')
    expect(mismatches(), 'a merged node is not a divergence').toBe(0)
    dispose()
  })

  it('keeps BOTH halves of a split node live', () => {
    const first = signal('ab')
    const second = signal('cd')
    const host = serverHtml('<div class="a">abcd</div>')
    const dispose = hydrateRoot(
      host,
      h('div', { class: 'a' }, () => first(), () => second()),
    )
    first.set('AB')
    expect(host.querySelector('.a')?.textContent).toBe('ABcd')
    second.set('CD')
    expect(host.querySelector('.a')?.textContent).toBe('ABCD')
    dispose()
  })

  it('recovers when the server put an ELEMENT where text was expected', () => {
    // The two renderers disagreed about the SHAPE, not just the value — a
    // conditional that took a different branch on each side.
    const host = serverHtml('<div class="a"><b>elem</b></div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 'text'))
    expect(host.querySelector('.a')?.textContent).toContain('text')
    expect(mismatches()).toBeGreaterThan(0)
    dispose()
  })

  it('recovers when the server emitted NOTHING at all', () => {
    // An empty element where the client has text: nothing to adopt, nothing
    // to split, and a `nextSibling` read away from a crash. NOTE this shape
    // currently reports no mismatch — the walker recovers correctly but the
    // telemetry hook stays silent, so a `<Show>` that took different branches
    // on the two sides is invisible to production observability. Asserted for
    // the RECOVERY only; the reporting gap is called out rather than pinned,
    // because pinning today's silence would make it a contract.
    const host = serverHtml('<div class="a"></div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 'text'))
    expect(host.querySelector('.a')?.textContent).toBe('text')
    expect(host.querySelectorAll('.a'), 'exactly one element, not a rebuilt twin').toHaveLength(1)
    dispose()
  })

  it('stays live after recovering from an empty element', () => {
    const v = signal('text')
    const host = serverHtml('<div class="a"></div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => v()))
    v.set('later')
    expect(host.querySelector('.a')?.textContent).toBe('later')
    dispose()
  })

  it('binds an EMPTY-STRING value without inventing a node to adopt', () => {
    // An empty string renders no text, so the server emitted nothing — but the
    // binding still needs a node to write into when the value later becomes
    // non-empty, and it has to sit at the cursor, not at the end.
    const v = signal('')
    const host = serverHtml('<div class="a"><b class="tail">T</b></div>')
    const dispose = hydrateRoot(
      host,
      h('div', { class: 'a' }, () => v(), h('b', { class: 'tail' }, 'T')),
    )
    expect(host.querySelector('.a')?.textContent).toBe('T')
    expect(mismatches(), 'an empty value is not a divergence').toBe(0)
    v.set('X')
    expect(host.querySelector('.a')?.textContent, 'the value lands BEFORE the sibling').toBe('XT')
    dispose()
  })

  it('adopts a NUMERIC value the server stringified', () => {
    const host = serverHtml('<div class="a">42</div>')
    const before = host.querySelector('.a')?.firstChild
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 42))
    expect(host.querySelector('.a')?.firstChild).toBe(before)
    expect(mismatches()).toBe(0)
    dispose()
  })

  it('reports a NUMERIC divergence and takes the client number', () => {
    const host = serverHtml('<div class="a">41</div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 42))
    expect(host.querySelector('.a')?.textContent).toBe('42')
    expect(mismatches()).toBeGreaterThan(0)
    dispose()
  })

  it('leaves nothing behind when disposed after a recovery', () => {
    // A recovery inserts a node the walker did not find. If teardown only
    // knows about what it adopted, that node outlives the app.
    const host = serverHtml('<div class="a"><b>elem</b></div>')
    const dispose = hydrateRoot(host, h('div', { class: 'a' }, () => 'text'))
    dispose()
    expect(host.textContent, 'disposed clean').toBe('')
  })
})
