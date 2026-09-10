/**
 * Prop application at the seams: foreign-namespace attributes, the
 * `value` default, spread refs, and non-function handlers.
 *
 * Each of these is a place where the DOM has two spellings and only one is
 * correct, and where the wrong one produces markup that LOOKS right.
 *
 *  - `xlink:href` on an `<svg>` child is a QUALIFIED name. Setting it with
 *    plain `setAttribute` stores a literal attribute called `"xlink:href"` in
 *    no namespace: it serializes identically, `getAttribute` returns it, and
 *    the browser ignores it, so the `<use>` renders nothing.
 *  - `input.value` is a non-reflecting property. Assigning it without also
 *    establishing the default leaves `form.reset()` clearing a field the
 *    server had filled — behaviour that differs between a hydrated page and a
 *    client-navigated one, from the same markup.
 *  - A spread carrying a `ref` is the compiled path's own contract: the ref is
 *    not a DOM attribute, so `applyProps` skips it and the caller must wire it
 *    — and release it, or a removed subtree stays pinned.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'
import { foreignAttrNamespace } from '../props'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

describe('foreign-namespace attributes resolve their namespace', () => {
  it('resolves xlink and xml prefixes on an SVG element', () => {
    // The control for the refusals below.
    const svg = document.createElementNS(SVG_NS, 'use')
    expect(foreignAttrNamespace(svg, 'xlink:href')).toBe(XLINK_NS)
    expect(foreignAttrNamespace(svg, 'xml:lang')).toBe(XML_NS)
  })

  it('resolves NOTHING for an HTML element', () => {
    // The prefix only means something inside foreign content. Namespacing it
    // on an HTML element would produce an attribute the HTML serializer and
    // the CSS attribute selectors both fail to match.
    const div = document.createElement('div')
    expect(foreignAttrNamespace(div, 'xlink:href')).toBeNull()
  })

  it('resolves nothing for an attribute that does not start with x', () => {
    // The hot path: one character compare, so the common attribute never
    // touches the lookup table.
    const svg = document.createElementNS(SVG_NS, 'use')
    expect(foreignAttrNamespace(svg, 'href')).toBeNull()
    expect(foreignAttrNamespace(svg, 'class')).toBeNull()
  })

  it('resolves nothing for an UNKNOWN x-prefixed attribute', () => {
    const svg = document.createElementNS(SVG_NS, 'use')
    expect(foreignAttrNamespace(svg, 'xfoo:bar')).toBeNull()
    expect(foreignAttrNamespace(svg, 'x-custom')).toBeNull()
  })

  it('sets xlink:href in its real namespace when mounted', () => {
    // The end-to-end half. `getAttribute` answers either way, so the
    // assertion has to be `getAttributeNS` — the same distinction that made
    // the SVG-namespace bug invisible to a `querySelector` count.
    const dispose = mount(
      h('svg', null, h('use', { 'xlink:href': '#icon' })),
      container,
    )
    const use = container.querySelector('use')!
    expect(use.getAttributeNS(XLINK_NS, 'href'), 'namespaced, not literal').toBe('#icon')
    dispose()
  })

  it('sets a plain attribute on an SVG element normally', () => {
    const dispose = mount(h('svg', null, h('path', { d: 'M0 0' })), container)
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M0 0')
    dispose()
  })

  it('removes a namespaced attribute when the value goes null', () => {
    // Removal matches by QUALIFIED name, so the plain `removeAttribute` is
    // correct here — but only if it actually runs.
    const href = signal<string | undefined>('#a')
    const dispose = mount(
      h('svg', null, h('use', { 'xlink:href': () => href() })),
      container,
    )
    const use = container.querySelector('use')!
    expect(use.getAttributeNS(XLINK_NS, 'href')).toBe('#a')
    href.set(undefined)
    expect(use.hasAttribute('xlink:href'), 'gone, not the string "undefined"').toBe(false)
    dispose()
  })
})

describe('an input value establishes its reset default', () => {
  it('sets the property AND the default on first application', () => {
    // SSR can only express this as an attribute, and the client sets a
    // non-reflecting property. Without establishing the default, the same
    // markup gives a hydrated page and a client-navigated page different
    // `form.reset()` behaviour.
    const dispose = mount(h('input', { value: 'seed' }), container)
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('seed')
    expect(input.defaultValue, 'the reset target is established').toBe('seed')
    dispose()
  })

  it('does NOT drag the default along with later writes', () => {
    // The load-bearing half. A controlled input rewrites `value` on every
    // keystroke; moving the default with it turns `form.reset()` into a no-op.
    const v = signal('seed')
    const dispose = mount(h('input', { value: () => v() }), container)
    const input = container.querySelector('input') as HTMLInputElement
    v.set('typed by the user')
    expect(input.value).toBe('typed by the user')
    expect(input.defaultValue, 'the reset target stays put').toBe('seed')
    dispose()
  })

  it('establishes the default for a TEXTAREA too', () => {
    const dispose = mount(h('textarea', { value: 'body' }), container)
    const ta = container.querySelector('textarea') as HTMLTextAreaElement
    expect(ta.value).toBe('body')
    expect(ta.defaultValue).toBe('body')
    dispose()
  })

  it('does NOT touch the default on a non-input element', () => {
    // `value` is a legitimate property on several elements — `<option>`,
    // `<progress>`, `<li>` — where it REFLECTS and no default exists. Running
    // the input-only path there would set a property the element does not
    // have.
    const dispose = mount(h('option', { value: 'o' }, 'label'), container)
    const opt = container.querySelector('option') as HTMLOptionElement
    expect(opt.value).toBe('o')
    dispose()
  })
})

describe('a spread on a DOM element wires and releases its ref', () => {
  it('fires a CALLBACK ref and nulls it on unmount', () => {
    // The spread path skips `ref` as a DOM prop and wires it separately —
    // which is exactly how it once got dropped entirely on the compiled path,
    // silently, leaving every measurement at zero.
    const seen: Array<Element | null> = []
    const props = { class: 'x', ref: (el: Element | null) => seen.push(el) }
    const dispose = mount(h('div', { ...props }), container)
    expect(seen[0], 'the mounted element').toBe(container.firstElementChild)
    dispose()
    expect(seen[1], 'released').toBeNull()
  })

  it('fires an OBJECT ref and nulls it', () => {
    const ref: { current: Element | null } = { current: null }
    const dispose = mount(h('div', { class: 'x', ref }), container)
    expect(ref.current).toBe(container.firstElementChild)
    dispose()
    expect(ref.current, 'an unreleased ref pins the whole subtree').toBeNull()
  })

  it('applies the other props alongside the ref', () => {
    const ref: { current: Element | null } = { current: null }
    const dispose = mount(h('div', { class: 'x', id: 'y', ref }), container)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('class')).toBe('x')
    expect(el.getAttribute('id')).toBe('y')
    dispose()
  })

  it('handles a props object with NO ref at all', () => {
    // The dominant case, and the one the disposer contract has to keep cheap:
    // the caller calls the returned disposer unconditionally, so a static
    // spread must hand back something callable rather than null.
    const dispose = mount(h('div', { class: 'x' }), container)
    expect(() => dispose()).not.toThrow()
  })
})

describe('a non-function event handler is refused, loudly', () => {
  it('warns and binds nothing for a string handler', () => {
    // `onClick="doThing()"` — the HTML habit. Binding it would add a listener
    // that throws on every click; silently ignoring it leaves a dead control.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('button', { onClick: 'doThing()' as never }, 'go'), container)
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('onClick')
    warn.mockRestore()
    dispose()
  })

  it('warns for an OBJECT handler', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('button', { onClick: { handleEvent: () => {} } as never }, 'go'), container)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    dispose()
  })

  it('stays SILENT for a nullish handler', () => {
    // `onClick={cond ? fn : undefined}` is the intended conditional-handler
    // shape. Warning on it would make the check noise and train people to
    // ignore it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(
      h('div', null, h('button', { onClick: undefined }, 'a'), h('button', { onClick: null as never }, 'b')),
      container,
    )
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    dispose()
  })

  it('stays silent for a real function', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(h('button', { onClick: () => {} }, 'go'), container)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    dispose()
  })
})
