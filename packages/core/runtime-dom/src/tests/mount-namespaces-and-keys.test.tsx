/**
 * Three mount-path behaviours whose failures are silent by construction.
 *
 * **Namespaces.** An element created with `createElement` instead of
 * `createElementNS` is an `HTMLUnknownElement` that renders NOTHING while
 * still answering `querySelector` and reporting the right `localName` — the
 * shipped `@pyreon/flow` bug, where every edge existed in the DOM and no line
 * was drawn. A count assertion cannot see it; only the namespace can.
 *
 * **Polymorphic text.** A reactive binding whose accessor returns a string
 * today and a VNode tomorrow has to swap between a text node and a mounted
 * subtree, in place, without losing its position among siblings. Getting the
 * swap wrong renders `[object Object]` or strands the previous render.
 *
 * **Keys.** `<For>`'s reconciler has fast paths gated on the key sequence
 * being well-formed. A duplicate or null key is a user mistake the framework
 * cannot fix, so what matters is that it degrades predictably — first-wins,
 * with a warning naming the key — instead of dropping rows or mounting one
 * row's content under another's identity.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MATHML_NS = 'http://www.w3.org/1998/Math/MathML'
const HTML_NS = 'http://www.w3.org/1999/xhtml'

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

describe('elements are created in the right namespace', () => {
  it('creates a plain element in the HTML namespace', () => {
    // The control: without it, "is in namespace X" passes for a build that
    // puts everything in X.
    const dispose = mount(h('div', null, 'x'), container)
    expect(container.firstElementChild?.namespaceURI).toBe(HTML_NS)
    dispose()
  })

  it('creates <svg> and its DESCENDANTS in the SVG namespace', () => {
    // The descendant half is the one that bites: `<path>` is only ever an SVG
    // tag, but a `<title>` or an `<a>` inside `<svg>` is namespace-dependent,
    // and an HTML-namespaced child of an SVG parent draws nothing.
    const dispose = mount(
      h('svg', null, h('g', null, h('path', { d: 'M0 0L1 1' }), h('title', null, 'label'))),
      container,
    )
    const svg = container.querySelector('svg')!
    expect(svg.namespaceURI).toBe(SVG_NS)
    for (const el of svg.querySelectorAll('*')) {
      expect(el.namespaceURI, el.localName).toBe(SVG_NS)
    }
    dispose()
  })

  it('creates <math> and its descendants in the MathML namespace', () => {
    // Same class, the other foreign namespace. `<mi>`/`<mn>`/`<mo>` in the
    // HTML namespace produce a formula that is present and invisible.
    const dispose = mount(
      h('math', null, h('mrow', null, h('mi', null, 'x'), h('mo', null, '+'), h('mn', null, '1'))),
      container,
    )
    const math = container.querySelector('math')!
    expect(math.namespaceURI).toBe(MATHML_NS)
    for (const el of math.querySelectorAll('*')) {
      expect(el.namespaceURI, el.localName).toBe(MATHML_NS)
    }
    dispose()
  })

  it('returns to the HTML namespace AFTER a foreign subtree closes', () => {
    // The depth counter has to come back down. A leaked depth puts every
    // later element on the page into the foreign namespace — a whole-page
    // failure from one `<svg>`, and the first element still looks correct.
    const dispose = mount(
      h('div', null, h('svg', null, h('path', { d: 'M0 0' })), h('p', null, 'after')),
      container,
    )
    expect(container.querySelector('path')?.namespaceURI).toBe(SVG_NS)
    expect(container.querySelector('p')?.namespaceURI, 'back to HTML').toBe(HTML_NS)
    dispose()
  })

  it('returns to HTML after a MATHML subtree closes', () => {
    const dispose = mount(
      h('div', null, h('math', null, h('mi', null, 'x')), h('p', null, 'after')),
      container,
    )
    expect(container.querySelector('mi')?.namespaceURI).toBe(MATHML_NS)
    expect(container.querySelector('p')?.namespaceURI).toBe(HTML_NS)
    dispose()
  })

  it('keeps namespaces straight when the two are SIBLINGS', () => {
    // Two counters, one after the other. A single shared depth would leave
    // the second subtree in the first's namespace.
    const dispose = mount(
      h('div', null, h('svg', null, h('path', { d: 'M0 0' })), h('math', null, h('mi', null, 'x'))),
      container,
    )
    expect(container.querySelector('path')?.namespaceURI).toBe(SVG_NS)
    expect(container.querySelector('mi')?.namespaceURI).toBe(MATHML_NS)
    dispose()
  })
})

describe('a void element warns about children rather than dropping them silently', () => {
  it('names the tag', () => {
    // The browser ignores them, so the markup renders and the content is
    // simply gone. Without the warning the author looks everywhere else.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('div', null, h('br', null, 'ignored')), container)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('br')
    dispose()
  })

  it('stays quiet for a void element with NO children', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('div', null, h('br', null), h('hr', null), h('img', { src: '/x' })), container)
    expect(warn).not.toHaveBeenCalled()
    dispose()
  })
})

describe('a reactive binding swaps between text and a subtree in place', () => {
  it('upgrades from text to a VNODE and back', () => {
    // The documented `_bindText` upgrade: a binding that starts textish and
    // later yields a VNode must MOUNT it, not stringify it. `[object Object]`
    // is what the pre-upgrade version rendered.
    const v = signal<unknown>('plain')
    const dispose = mount(h('div', null, () => v() as never), container)
    expect(container.textContent).toBe('plain')

    v.set(h('b', null, 'rich'))
    expect(container.querySelector('b')?.textContent, 'mounted, not stringified').toBe('rich')
    expect(container.textContent).not.toContain('object Object')

    v.set('plain again')
    expect(container.textContent, 'and back down to text').toBe('plain again')
    expect(container.querySelector('b'), 'the subtree is torn down').toBeNull()
    dispose()
  })

  it('keeps its POSITION among siblings across the swap', () => {
    // The swap replaces a text node with a marker and mounts at the marker.
    // Reading a stale parent — or mounting at the parent's anchor — moves the
    // binding to the end, silently reordering the row.
    const v = signal<unknown>('mid')
    const dispose = mount(
      h('div', null, h('span', null, 'A'), () => v() as never, h('span', null, 'Z')),
      container,
    )
    expect(container.textContent).toBe('AmidZ')
    v.set(h('b', null, 'M'))
    expect(container.textContent, 'still between A and Z').toBe('AMZ')
    v.set('mid')
    expect(container.textContent).toBe('AmidZ')
    dispose()
  })

  it('replaces one subtree with the NEXT without stranding the first', () => {
    const v = signal<unknown>(h('b', null, 'one'))
    const dispose = mount(h('div', null, () => v() as never), container)
    expect(container.querySelectorAll('b').length).toBe(1)
    v.set(h('i', null, 'two'))
    expect(container.querySelector('b'), 'the previous subtree is gone').toBeNull()
    expect(container.querySelector('i')?.textContent).toBe('two')
    dispose()
  })

  it('renders an ARRAY of vnodes, then collapses back to text', () => {
    const v = signal<unknown>([h('b', null, '1'), h('b', null, '2')])
    const dispose = mount(h('div', null, () => v() as never), container)
    expect(container.querySelectorAll('b').length).toBe(2)
    v.set('flat')
    expect(container.querySelectorAll('b').length, 'every node released').toBe(0)
    expect(container.textContent).toBe('flat')
    dispose()
  })

  it('treats null and false as empty text, not as a subtree', () => {
    const v = signal<unknown>('x')
    const dispose = mount(h('div', null, () => v() as never), container)
    for (const empty of [null, false, undefined]) {
      v.set(empty)
      expect(container.textContent, String(empty)).toBe('')
    }
    v.set('back')
    expect(container.textContent).toBe('back')
    dispose()
  })

  it('releases the mounted subtree on DISPOSE, not just on the next flip', () => {
    const v = signal<unknown>(h('b', null, 'x'))
    const dispose = mount(h('div', null, () => v() as never), container)
    dispose()
    expect(container.textContent).toBe('')
    expect(() => v.set('after'), 'and the binding is dead').not.toThrow()
  })
})

describe('<For> degrades predictably on malformed keys', () => {
  const renderList = (rows: () => Array<{ id: unknown; label: string }>) =>
    mount(
      h(
        'ul',
        null,
        h(For as never, {
          each: rows,
          by: (r: { id: unknown }) => r.id,
          children: (r: { label: string }) => h('li', null, r.label),
        }),
      ),
      container,
    )

  it('renders one row per item for well-formed keys', () => {
    // The control.
    const items = signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    const dispose = renderList(() => items())
    expect([...container.querySelectorAll('li')].map((e) => e.textContent)).toEqual(['a', 'b'])
    dispose()
  })

  it('warns and keeps the FIRST row for a duplicate key', () => {
    // Two rows claiming one identity. The reconciler cannot tell them apart,
    // so it keeps one — and says which key, because the data is what needs
    // fixing and the symptom (a row that never updates) points nowhere.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const items = signal([{ id: 1, label: 'a' }, { id: 1, label: 'b' }])
    const dispose = renderList(() => items())
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('Duplicate key'))).toBe(true)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('1')), 'names the key').toBe(true)
    dispose()
  })

  it('warns when `by` returns null or undefined', () => {
    // A `by` reading a field that does not exist yet. Every row then shares
    // the key `undefined`, so the list collapses to one — with no signal at
    // all, that reads as a data-loading bug.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const items = signal([{ id: undefined, label: 'a' }, { id: undefined, label: 'b' }])
    const dispose = renderList(() => items())
    expect(warn.mock.calls.some((c) => String(c[0]).includes('by')), 'names the prop').toBe(true)
    dispose()
  })

  it('still renders after a duplicate is REMOVED', () => {
    // The state after the warning has to be recoverable: fixing the data must
    // fix the list, not leave a poisoned key cache.
    const items = signal([{ id: 1, label: 'a' }, { id: 1, label: 'b' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = renderList(() => items())
    items.set([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    expect([...container.querySelectorAll('li')].map((e) => e.textContent)).toEqual(['a', 'b'])
    warn.mockRestore()
    dispose()
  })
})

describe('<For> insertion and removal keep the DOM in list order', () => {
  const items = signal<Array<{ id: number }>>([])
  const render = () =>
    mount(
      h(
        'ul',
        null,
        h(For as never, {
          each: () => items(),
          by: (r: { id: number }) => r.id,
          children: (r: { id: number }) => h('li', null, String(r.id)),
        }),
      ),
      container,
    )
  const ids = () => [...container.querySelectorAll('li')].map((e) => e.textContent)
  const set = (...n: number[]) => items.set(n.map((id) => ({ id })))

  it('appends at the tail', () => {
    // The contiguous-insertion fast path: every old key survives in order, so
    // nothing may move.
    set(1, 2, 3)
    const dispose = render()
    const firstLi = container.querySelector('li')
    set(1, 2, 3, 4, 5)
    expect(ids()).toEqual(['1', '2', '3', '4', '5'])
    expect(container.querySelector('li'), 'survivors are not remounted').toBe(firstLi)
    dispose()
  })

  it('PREPENDS without moving the survivors', () => {
    set(3, 4)
    const dispose = render()
    const three = container.querySelector('li')
    set(1, 2, 3, 4)
    expect(ids()).toEqual(['1', '2', '3', '4'])
    expect([...container.querySelectorAll('li')][2], 'the same node, moved not rebuilt').toBe(three)
    dispose()
  })

  it('inserts into the MIDDLE at the right index', () => {
    // The shape that once stranded the new row at the tail: a new key whose
    // logical index sits between two survivors' stale positions.
    set(1, 2, 3, 4)
    const dispose = render()
    set(1, 5, 3)
    expect(ids()).toEqual(['1', '5', '3'])
    dispose()
  })

  it('removes a contiguous run', () => {
    set(1, 2, 3, 4, 5)
    const dispose = render()
    set(1, 5)
    expect(ids()).toEqual(['1', '5'])
    dispose()
  })

  it('clears to empty and repopulates', () => {
    set(1, 2, 3)
    const dispose = render()
    set()
    expect(ids()).toEqual([])
    set(9)
    expect(ids()).toEqual(['9'])
    dispose()
  })

  it('REVERSES', () => {
    set(1, 2, 3, 4)
    const dispose = render()
    set(4, 3, 2, 1)
    expect(ids()).toEqual(['4', '3', '2', '1'])
    dispose()
  })

  it('swaps two rows without disturbing the rest', () => {
    set(1, 2, 3, 4, 5)
    const dispose = render()
    set(1, 4, 3, 2, 5)
    expect(ids()).toEqual(['1', '4', '3', '2', '5'])
    dispose()
  })

  it('handles add + remove in the SAME update', () => {
    // A length change, which is what pushes the reconciler off its fast paths
    // and onto the general LIS walk.
    set(1, 2, 3, 4)
    const dispose = render()
    set(1, 5, 3)
    expect(ids()).toEqual(['1', '5', '3'])
    set(7, 1, 3, 8)
    expect(ids()).toEqual(['7', '1', '3', '8'])
    dispose()
  })

  it('removes every row on dispose', () => {
    set(1, 2, 3)
    const dispose = render()
    dispose()
    expect(container.querySelectorAll('li').length).toBe(0)
    expect(container.textContent).toBe('')
  })
})
