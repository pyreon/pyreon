/**
 * Teardown against a parent that is not a live document, the precompiled
 * event binder's non-delegated half, and the reconciler's refusal to align a
 * mixed keyed/keyless list.
 *
 * These are the paths a shape most apps never write reaches — building
 * off-DOM, hovering a hydrated row, forgetting a key on one item of a list.
 * Each one is a second implementation of something the common path already
 * does, which is exactly where two implementations drift, and none of them
 * announces itself when it breaks: an off-DOM teardown throws mid-dispose, a
 * hydrated hover handler silently never binds, a misaligned list renders the
 * wrong row's content under the right row's key.
 */
import { For, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setValue, hydrateRoot, mount } from '../index'
import { query } from '@pyreon/test-utils'

let container: HTMLElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('tearing down after the DOM has already gone', () => {
  // A teardown that races an outer removal is ordinary, not exotic: an
  // ancestor unmounts first (a route change, a `<Show>` flipping, a parent
  // element replaced wholesale), so by the time an inner disposer runs its
  // node has no parent at all. Every remover in the mount pipeline has to
  // notice that — one that reaches for `removeChild` on a null parent throws
  // MID-DISPOSE, which is worse than the leak it was avoiding: the disposers
  // queued after it never run, so the effects, listeners and refs they own
  // survive the unmount.

  const detachAll = () => {
    while (container.firstChild) container.firstChild.remove()
  }

  it('disposes a TEXT child whose parent was emptied first', () => {
    const dispose = mount('hello', container)
    expect(container.textContent).toBe('hello')
    detachAll()
    expect(() => dispose()).not.toThrow()
  })

  it('disposes an ELEMENT that was removed first', () => {
    const dispose = mount(h('div', { class: 'gone' }, 'x'), container)
    ;(query<HTMLElement>(container, '.gone')).remove()
    expect(() => dispose()).not.toThrow()
  })

  it('disposes a whole SUBTREE whose root was removed first', () => {
    const dispose = mount(h('ul', null, h('li', null, 'a'), h('li', null, 'b')), container)
    ;(query(container, 'ul')).remove()
    expect(() => dispose()).not.toThrow()
  })

  it('still RELEASES a ref when the element was removed first', () => {
    // The ref release sits beside the DOM removal. A remover that throws on a
    // detached node takes the release with it, and a ref left pointing at a
    // discarded element pins that whole subtree for as long as whoever holds
    // the ref lives.
    const ref: { current: Element | null } = { current: null }
    const dispose = mount(h('div', { ref }), container)
    expect(ref.current).not.toBeNull()
    ;(ref.current as HTMLElement).remove()
    dispose()
    expect(ref.current, 'released even though the node had gone').toBeNull()
  })

  it('still runs a COMPONENT cleanup when its element was removed first', () => {
    const seen: string[] = []
    const Comp = () => h('div', { ref: (el: Element | null) => seen.push(el ? 'in' : 'out') }, 'c')
    const dispose = mount(h(Comp, null), container)
    expect(seen).toEqual(['in'])
    detachAll()
    dispose()
    expect(seen, 'the cleanup ran despite the detach').toEqual(['in', 'out'])
  })

  it('still disposes a reactive BINDING when its node was removed first', () => {
    // The assertion that matters: a throw here would leave the effect
    // subscribed, so the signal keeps a dead subtree alive and every later
    // write does work nobody can see.
    const v = signal('a')
    const dispose = mount(h('div', { class: 'r' }, () => v()), container)
    const el = query<HTMLElement>(container, '.r')
    expect(el.textContent).toBe('a')
    el.remove()
    expect(() => dispose()).not.toThrow()
    v.set('b')
    expect(el.textContent, 'the binding is gone, not merely orphaned').toBe('a')
  })

  it('is idempotent — a second dispose after a detach does nothing', () => {
    const dispose = mount(h('div', null, 'x'), container)
    detachAll()
    dispose()
    expect(() => dispose()).not.toThrow()
  })
})

describe('the precompiled row binder for a NON-delegated event', () => {
  // A hydrated `<For>` applies one precompiled binder per row instead of
  // re-deriving the event name N times. That binder is a SECOND
  // implementation of the runtime's own event application, and it splits
  // again by whether the event is delegated — so the non-delegated half
  // (`mouseenter` does not bubble, so it cannot be delegated) is a quarter of
  // the surface that only a hovered, hydrated list ever reaches.
  interface Row {
    id: number
  }
  const app = (rows: Row[], onEnter: unknown) =>
    h(
      'div',
      null,
      h(For, {
        each: () => rows,
        by: (r: Row) => r.id,
        children: (r: Row) => h('b', { class: 'row', onMouseEnter: onEnter }, `r${r.id}`),
      }),
    )

  const hydrated = async (rows: Row[], onEnter: unknown) => {
    const html = await renderToString(app(rows, () => {}) as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const dispose = hydrateRoot(host, app(rows, onEnter) as never)
    return { host, dispose }
  }

  const rows: Row[] = [{ id: 1 }, { id: 2 }]

  it('BINDS the handler on every hydrated row', () => {
    // The control. A binder that silently bound nothing would pass any
    // assertion about the DOM.
    return hydrated(rows, () => {}).then(({ host, dispose }) => {
      expect(host.querySelectorAll('.row')).toHaveLength(2)
      dispose()
    })
  })

  it('DELIVERS a non-delegated event to the hydrated row', async () => {
    const hits: string[] = []
    const { host, dispose } = await hydrated(rows, (e: Event) => {
      hits.push((e.currentTarget as HTMLElement).textContent ?? '')
    })
    const [first, second] = Array.from(host.querySelectorAll('.row')) as HTMLElement[]
    first?.dispatchEvent(new MouseEvent('mouseenter'))
    second?.dispatchEvent(new MouseEvent('mouseenter'))
    expect(hits).toEqual(['r1', 'r2'])
    dispose()
  })

  it('REMOVES the listener when the hydrated row goes away', async () => {
    // A real `addEventListener` (not a delegated expando) is only released by
    // an explicit remove; a missed one keeps the handler's closure — and the
    // row it captured — alive for the page's lifetime.
    const hits: number[] = []
    const { host, dispose } = await hydrated(rows, () => hits.push(1))
    const first = query<HTMLElement>(host, '.row')
    first.dispatchEvent(new MouseEvent('mouseenter'))
    dispose()
    first.dispatchEvent(new MouseEvent('mouseenter'))
    expect(hits, 'no delivery after teardown').toEqual([1])
  })

  it('WARNS instead of binding a non-function handler', async () => {
    // `onMouseEnter={someString}` binds a value the browser will try to call
    // on every hover. The runtime path refuses it; the row binder is a
    // separate refusal, and an unchecked one throws once per hover with no
    // hint about which prop is at fault.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host, dispose } = await hydrated(rows, 'handleEnter()')
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('onMouseEnter'))).toBe(true)
    const first = query<HTMLElement>(host, '.row')
    expect(() => first.dispatchEvent(new MouseEvent('mouseenter'))).not.toThrow()
    dispose()
  })
})

describe('a keyed list where SOME items have no key', () => {
  // Forgetting one key in a `.map()` is the commonest list mistake there is.
  // The insertion fast path aligns items to keys BY INDEX, so a keyless item
  // shifts every key after it — the reconciler must refuse the fast path
  // rather than move the wrong rows. The visible failure of getting this
  // wrong is content appearing under the wrong row.
  interface Item {
    id: number
    text: string
    keyed: boolean
  }
  const render = (items: () => Item[]) =>
    h('ul', null, () =>
      items().map((i) =>
        i.keyed ? h('li', { key: i.id }, i.text) : h('li', null, i.text),
      ),
    )

  const item = (id: number, keyed = true): Item => ({ id, text: `t${id}`, keyed })

  it('renders a fully-keyed list, then grows it', () => {
    // The control: the fast path this suite is about must actually work.
    const items = signal<Item[]>([item(1), item(2)])
    const dispose = mount(render(() => items()), container)
    expect(container.textContent).toBe('t1t2')
    items.set([item(1), item(2), item(3)])
    expect(container.textContent).toBe('t1t2t3')
    dispose()
  })

  it('grows a MIXED list without misplacing anything', () => {
    const items = signal<Item[]>([item(1), item(2, false)])
    const dispose = mount(render(() => items()), container)
    expect(container.textContent).toBe('t1t2')
    items.set([item(1), item(2, false), item(3)])
    expect(container.textContent, 'appended in order').toBe('t1t2t3')
    dispose()
  })

  it('inserts into the MIDDLE of a mixed list without misplacing anything', () => {
    const items = signal<Item[]>([item(1), item(3, false)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1), item(2), item(3, false)])
    expect(container.textContent).toBe('t1t2t3')
    dispose()
  })

  it('grows a list where the KEYLESS item is first', () => {
    const items = signal<Item[]>([item(1, false), item(2)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1, false), item(2), item(3)])
    expect(container.textContent).toBe('t1t2t3')
    dispose()
  })

  it('grows a list where NOTHING is keyed', () => {
    const items = signal<Item[]>([item(1, false), item(2, false)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1, false), item(2, false), item(3, false)])
    expect(container.textContent).toBe('t1t2t3')
    dispose()
  })

  it('SHRINKS a mixed list correctly', () => {
    const items = signal<Item[]>([item(1), item(2, false), item(3)])
    const dispose = mount(render(() => items()), container)
    expect(container.textContent).toBe('t1t2t3')
    items.set([item(1), item(3)])
    expect(container.textContent).toBe('t1t3')
    dispose()
  })

  it('REORDERS a mixed list correctly', () => {
    const items = signal<Item[]>([item(1), item(2, false), item(3)])
    const dispose = mount(render(() => items()), container)
    items.set([item(3), item(2, false), item(1)])
    expect(container.textContent).toBe('t3t2t1')
    dispose()
  })

  it('does not DROP the item whose key went missing', () => {
    // The insidious half. A list that starts fully keyed is reconciled by key
    // forever, and a keyless vnode is invisible to every path that does so —
    // so losing ONE key silently deletes that row while its neighbours stay
    // put. The user sees a list with a hole in it and nothing in the console.
    const items = signal<Item[]>([item(1), item(2), item(3)])
    const dispose = mount(render(() => items()), container)
    expect(container.textContent).toBe('t1t2t3')
    items.set([item(1), item(2, false), item(3)])
    expect(container.textContent, 'the middle row survives losing its key').toBe('t1t2t3')
    expect(container.querySelectorAll('li')).toHaveLength(3)
    dispose()
  })

  it('recovers the row when the key comes BACK', () => {
    const items = signal<Item[]>([item(1), item(2), item(3)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1), item(2, false), item(3)])
    items.set([item(1), item(2), item(3)])
    expect(container.textContent).toBe('t1t2t3')
    expect(container.querySelectorAll('li')).toHaveLength(3)
    dispose()
  })

  it('keeps UPDATING while the list is keyless', () => {
    // Falling back must not mean falling asleep: the list still has to track
    // its source, or the page freezes at whatever the last keyed render was.
    const items = signal<Item[]>([item(1), item(2)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1, false), item(2, false)])
    expect(container.textContent).toBe('t1t2')
    items.set([item(3, false), item(4, false)])
    expect(container.textContent).toBe('t3t4')
    expect(container.querySelectorAll('li'), 'no leftovers from the previous render').toHaveLength(2)
    dispose()
  })

  it('leaves NOTHING behind when a keyless list is disposed', () => {
    // The fallback owns DOM the keyed cache never hears about, so its teardown
    // is a second, separate contract — one that is easy to write and forget.
    const items = signal<Item[]>([item(1), item(2)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1, false), item(2, false)])
    expect(container.querySelectorAll('li')).toHaveLength(2)
    dispose()
    expect(container.querySelectorAll('li'), 'disposed clean').toHaveLength(0)
  })

  it('empties correctly from the keyless state', () => {
    const items = signal<Item[]>([item(1), item(2)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1, false), item(2, false)])
    items.set([])
    expect(container.querySelectorAll('li')).toHaveLength(0)
    items.set([item(9)])
    expect(container.textContent, 'and refills as a keyed list').toBe('t9')
    dispose()
  })

  it('goes from fully-keyed to fully-keyless and back', () => {
    // Toggling the key on the same data is what a refactor mid-session looks
    // like; neither direction may strand a row.
    const items = signal<Item[]>([item(1), item(2)])
    const dispose = mount(render(() => items()), container)
    items.set([item(1, false), item(2, false)])
    expect(container.textContent).toBe('t1t2')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    items.set([item(1), item(2)])
    expect(container.textContent).toBe('t1t2')
    expect(container.querySelectorAll('li')).toHaveLength(2)
    dispose()
  })
})

describe('`_setValue` on an element that is not a form control', () => {
  it('assigns the property and leaves the default alone', () => {
    // The compiler routes `value` by NAME, so `<progress value={x}>` reaches
    // the same helper `<input value={x}>` does. `progress` has no
    // `defaultValue`, and writing one would invent a property the element does
    // not have — which is how a "reset" reads a value nothing can restore.
    const el = document.createElement('progress')
    _setValue(el, 0.25)
    expect((el as HTMLProgressElement).value).toBeCloseTo(0.25)
    expect((el as unknown as { defaultValue?: unknown }).defaultValue).toBeUndefined()
  })

  it('updates on a second write', () => {
    const el = document.createElement('progress')
    _setValue(el, 0.25)
    _setValue(el, 0.75)
    expect((el as HTMLProgressElement).value).toBeCloseTo(0.75)
  })

  it('clears an <option> value to empty for a nullish write', () => {
    const el = document.createElement('option')
    _setValue(el, 'a')
    expect((el as HTMLOptionElement).value).toBe('a')
    _setValue(el, null)
    expect((el as HTMLOptionElement).value).toBe('')
  })
})

describe('a style prop that is neither a string nor an object', () => {
  it('does not write the coerced number as CSS', () => {
    // `style={0}` is what a `cond && styleObj` produces when `cond` is `0`.
    // `String(0)` is not valid CSS, so writing it can only corrupt the
    // declaration — the honest outcome is to leave the element unstyled.
    const dispose = mount(h('div', { class: 'n', style: 0 as never }, 'x'), container)
    const el = query<HTMLElement>(container, '.n')
    expect(el.getAttribute('style') ?? '').toBe('')
    dispose()
  })

  it('does not write a boolean as CSS', () => {
    const dispose = mount(h('div', { class: 'b', style: true as never }, 'x'), container)
    const el = query<HTMLElement>(container, '.b')
    expect(el.getAttribute('style') ?? '').toBe('')
    dispose()
  })

  it('still applies a real style object after a degenerate one', () => {
    // The control: refusing garbage must not latch the element into a state
    // where a later, valid style is also ignored.
    const s = signal<unknown>(0)
    const dispose = mount(h('div', { class: 's', style: () => s() }, 'x'), container)
    const el = query<HTMLElement>(container, '.s')
    s.set({ color: 'rgb(1, 2, 3)' })
    expect(el.style.color).toBe('rgb(1, 2, 3)')
    dispose()
  })
})
