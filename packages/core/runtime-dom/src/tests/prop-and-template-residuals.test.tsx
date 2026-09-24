/**
 * The prop and template paths a spread, a non-delegated event or a swap
 * reaches — and nothing else does.
 *
 * Each of these is a second implementation of something the ordinary path
 * already does, reached only by a shape most apps do not write. That is what
 * makes them worth pinning: the common path is exercised constantly, so a
 * divergence between the two survives every test that only drives the common
 * one.
 *
 *  - A DOM-element spread wires its `ref` through `applyPropsWithRef`, not
 *    through `mountElement` — a different function, with its own release.
 *  - A NON-delegated event (`mouseenter` does not bubble) takes the
 *    `addEventListener` branch rather than the delegated-expando one, and each
 *    branch validates its handler separately.
 *  - `value` on an element that is not an input reaches the same normalizer
 *    and must NOT establish a reset default there — those elements have none.
 *  - A text binding that receives a non-textish value warns ONCE per node,
 *    because a binding in a list would otherwise produce one line per row per
 *    update and drown the console it is trying to reach.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _applyProps, _bindText, _setChildAt, _setValue, mount } from '../index'
import { query } from '@pyreon/test-utils'

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

describe('a DOM-element spread wires its ref through its own path', () => {
  it('fires a CALLBACK ref and releases it', () => {
    // The control for the object form below.
    const seen: Array<Element | null> = []
    const el = document.createElement('div')
    container.appendChild(el)
    const dispose = _applyProps(el, { class: 'x', ref: (e: Element | null) => seen.push(e) })
    expect(seen[0]).toBe(el)
    dispose()
    expect(seen[1], 'released').toBeNull()
  })

  it('fires an OBJECT ref and NULLS it', () => {
    // `useRef`-style. An unreleased object ref pins the element and its whole
    // subtree for as long as whatever holds the ref survives — and a spread
    // is exactly where a ref is easiest to forget, because it is not visibly
    // a prop at the call site.
    const ref: { current: Element | null } = { current: null }
    const el = document.createElement('div')
    container.appendChild(el)
    const dispose = _applyProps(el, { class: 'x', ref })
    expect(ref.current).toBe(el)
    dispose()
    expect(ref.current).toBeNull()
  })

  it('applies the OTHER props alongside the ref', () => {
    const ref: { current: Element | null } = { current: null }
    const el = document.createElement('div')
    container.appendChild(el)
    const dispose = _applyProps(el, { class: 'x', id: 'y', ref })
    expect(el.getAttribute('class')).toBe('x')
    expect(el.getAttribute('id')).toBe('y')
    dispose()
  })

  it('returns a CALLABLE disposer for a spread with no ref', () => {
    // The compiler captures this as `const __dN = _applyProps(...)` and calls
    // `__dN()` unconditionally, so returning null would throw at teardown for
    // the commonest spread there is.
    const el = document.createElement('div')
    container.appendChild(el)
    expect(() => _applyProps(el, { class: 'x' })()).not.toThrow()
  })

  it('returns a callable disposer for a NULLISH spread source', () => {
    // `{...(cond ? obj : null)}` is legal JSX. Reading `.ref` off null would
    // throw during mount, taking the page rather than the prop.
    const el = document.createElement('div')
    container.appendChild(el)
    expect(() => _applyProps(el, null as never)()).not.toThrow()
  })

  it('releases its reactive bindings on dispose', () => {
    const title = signal('one')
    const el = document.createElement('div')
    container.appendChild(el)
    const dispose = _applyProps(el, { title: () => title() })
    expect(el.getAttribute('title')).toBe('one')
    title.set('two')
    expect(el.getAttribute('title')).toBe('two')
    dispose()
    title.set('three')
    expect(el.getAttribute('title'), 'frozen after teardown').toBe('two')
  })
})

describe('a NON-delegated event takes its own binding branch', () => {
  it('binds a real handler and releases it', () => {
    // `mouseenter` does not bubble, so it cannot be delegated — it gets a real
    // `addEventListener`, and that branch has its own validation and its own
    // removal. A leaked listener here keeps the handler's closure alive for
    // the life of the page.
    const hits: number[] = []
    const dispose = mount(
      h('div', { class: 't', onMouseEnter: () => hits.push(1) }, 'x'),
      container,
    )
    const el = query<HTMLElement>(container, '.t')
    el.dispatchEvent(new MouseEvent('mouseenter'))
    expect(hits).toEqual([1])
    dispose()
  })

  it('stops delivering after unmount', () => {
    const hits: number[] = []
    const dispose = mount(
      h('div', { class: 't', onMouseEnter: () => hits.push(1) }, 'x'),
      container,
    )
    const el = query<HTMLElement>(container, '.t')
    el.dispatchEvent(new MouseEvent('mouseenter'))
    dispose()
    el.dispatchEvent(new MouseEvent('mouseenter'))
    expect(hits, 'the listener was removed, not just orphaned').toEqual([1])
  })

  it('WARNS for a non-function handler on this branch too', () => {
    // Each branch validates separately, so covering only the delegated one
    // leaves the other free to bind a string as a listener — which throws on
    // every event rather than at bind time.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('div', { onMouseEnter: 'doThing()' as never }, 'x'), container)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('onMouseEnter')
    dispose()
  })

  it('stays silent for a nullish handler on this branch', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('div', { onMouseEnter: undefined }, 'x'), container)
    expect(warn).not.toHaveBeenCalled()
    dispose()
  })
})

describe('`value` on an element that has no reset default', () => {
  it('sets the property WITHOUT establishing a default', () => {
    // `<progress value>` reflects and has no `defaultValue`. Running the
    // input-only path there would write a property the element does not have.
    const dispose = mount(h('progress', { value: 0.5, max: 1 }), container)
    const el = query(container, 'progress')
    expect(el.value).toBeCloseTo(0.5)
    expect((el as unknown as { defaultValue?: unknown }).defaultValue).toBeUndefined()
    dispose()
  })

  it('sets `value` on an <li>, which reflects as an attribute', () => {
    const dispose = mount(h('ol', null, h('li', { value: 3 }, 'third')), container)
    const li = query(container, 'li')
    expect(li.value).toBe(3)
    dispose()
  })

  it('CLEARS the field when a bound value goes nullish', () => {
    // The clear-the-field flow: `value={draft()}` with `draft` going
    // `string | undefined`. `value` is a live PROPERTY, so clearing it means
    // assigning '' — `removeAttribute` leaves what the user typed on screen,
    // which is a "Clear" button that visibly does nothing.
    const v = signal<string | undefined>('typed')
    const dispose = mount(h('input', { value: () => v() }), container)
    const input = query(container, 'input')
    expect(input.value).toBe('typed')
    v.set(undefined)
    expect(input.value).toBe('')
    dispose()
  })

  it('KEEPS the reset default when a bound value goes nullish', () => {
    // The other half. The `value` ATTRIBUTE *is* `defaultValue`, so reaching
    // for `removeAttribute` to clear the field also destroys what
    // `form.reset()` restores — one wrong branch, two wrong outcomes.
    const v = signal<string | undefined>('typed')
    const dispose = mount(h('input', { value: () => v() }), container)
    const input = query(container, 'input')
    expect(input.defaultValue).toBe('typed')
    v.set(undefined)
    expect(input.defaultValue, 'reset still restores the real first value').toBe('typed')
    dispose()
  })

  it('matches the COMPILED path on that same transition', () => {
    // The compiled path routes `value` to `_setValue`, which carries its own
    // nullish branch; the h() path reaches a generic nullish branch first.
    // Two implementations of one prop is exactly where they drift, and the
    // drift is invisible until an app is built with the compiler on.
    const v = signal<string | undefined>('typed')
    const dispose = mount(h('input', { value: () => v() }), container)
    const viaH = query(container, 'input')

    const compiled = document.createElement('input')
    _setValue(compiled, 'typed')

    v.set(undefined)
    _setValue(compiled, undefined)

    expect(viaH.value, 'value').toBe(compiled.value)
    expect(viaH.defaultValue, 'defaultValue').toBe(compiled.defaultValue)
    dispose()
  })

  it('does not let a NULLISH first application consume the default slot', () => {
    // The default is established once. Spending that on a nullish initial
    // value — which is ordinary while data loads — would leave `form.reset()`
    // restoring an empty field forever.
    const v = signal<string | undefined>(undefined)
    const dispose = mount(h('input', { value: () => v() }), container)
    const input = query(container, 'input')
    expect(input.value).toBe('')
    v.set('loaded')
    expect(input.value).toBe('loaded')
    expect(input.defaultValue, 'the real first value became the default').toBe('loaded')
    dispose()
  })
})

describe('a text binding handed something that is not text', () => {
  it('warns ONCE per node, not once per update', () => {
    // A binding in a list would otherwise emit one line per row per update and
    // drown the console it is trying to reach — so the node is flagged after
    // the first warning.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const v = signal<unknown>(() => 'accessor')
    const node = document.createTextNode('')
    const detached = document.createElement('div')
    detached.appendChild(node)
    const dispose = _bindText(v as never, node)
    const first = warn.mock.calls.length
    v.set(() => 'accessor again')
    v.set(() => 'and again')
    expect(first, 'it warned').toBeGreaterThan(0)
    expect(warn.mock.calls.length, 'and only once for this node').toBe(first)
    dispose?.()
  })

  it('names the `as never` cast, which is the actual mistake', () => {
    // Casting an accessor to `as never` makes the compiler treat it as static,
    // so the closure's SOURCE lands on the page. Nothing about the rendered
    // output points at the cast.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const node = document.createTextNode('')
    document.createElement('div').appendChild(node)
    const dispose = _bindText(signal<unknown>(() => 'x') as never, node)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('as never'))).toBe(true)
    dispose?.()
  })

  it('stays SILENT for ordinary textish values', () => {
    // The control: a warning that fires for strings and numbers is noise, and
    // noise is what stops the real one being read.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const v = signal<unknown>('text')
    const node = document.createTextNode('')
    document.createElement('div').appendChild(node)
    const dispose = _bindText(v as never, node)
    v.set(42)
    v.set(true)
    v.set(null)
    expect(warn).not.toHaveBeenCalled()
    dispose?.()
  })
})

describe('a static child written at a compiled placeholder', () => {
  const withPlaceholder = (): { parent: HTMLElement; placeholder: ChildNode } => {
    const parent = document.createElement('div')
    parent.innerHTML = '<b>before</b><!><i>after</i>'
    container.appendChild(parent)
    return { parent, placeholder: parent.childNodes[1] as ChildNode }
  }

  it('replaces the placeholder with the value', () => {
    // The control.
    const { parent, placeholder } = withPlaceholder()
    _setChildAt(parent, placeholder, 'middle')
    expect(parent.textContent).toBe('beforemiddleafter')
  })

  it('renders a NULLISH value as empty, not as the word "null"', () => {
    // `String(null)` is `"null"`, and that string reached the page from this
    // exact branch — while `_setChild` and SSR both rendered nothing, so one
    // file produced a client/server divergence between two siblings.
    const { parent, placeholder } = withPlaceholder()
    _setChildAt(parent, placeholder, null)
    expect(parent.textContent, 'nothing, in place').toBe('beforeafter')
  })

  it('renders undefined as empty too', () => {
    const { parent, placeholder } = withPlaceholder()
    _setChildAt(parent, placeholder, undefined)
    expect(parent.textContent).toBe('beforeafter')
  })

  it('keeps SIBLING ORDER — the value lands where the placeholder was', () => {
    // The placeholder marks a position in a mixed-content element. Appending
    // instead would silently move the value past every following sibling.
    const { parent, placeholder } = withPlaceholder()
    _setChildAt(parent, placeholder, 'X')
    expect(parent.textContent).toBe('beforeXafter')
  })

  it('MOUNTS a VNode value rather than stringifying it', () => {
    const { parent, placeholder } = withPlaceholder()
    _setChildAt(parent, placeholder, h('em', { class: 'v' }, 'rich'))
    expect(parent.querySelector('.v')?.textContent).toBe('rich')
    expect(parent.textContent).not.toContain('object Object')
  })
})
