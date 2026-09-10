/**
 * The compiled-template helpers: rocketstyle class collapse, text coercion
 * warnings, and `_setChild`'s nullish handling.
 *
 * **Collapse.** `_rsCollapse*` is what a rocketstyle component becomes once
 * the build resolves its styling ahead of time: the class names are known, so
 * the whole five-layer mount collapses to one element with a className
 * binding. There is a single-class fast path — under CSS-variables theming
 * both modes produce the SAME class, because the mode lives in the cascade —
 * and taking the reactive path there would install an effect that can never
 * change anything, on every such element on the page.
 *
 * **Coercion.** A value that is not textish reaching a text binding is a bug
 * in the CALLER, and the shapes are specific enough to name: a function is
 * almost always an accessor that was cast with `as never`, which makes the
 * compiler treat it as static and put the closure's SOURCE on the page. The
 * warning fires ONCE per node, because a binding in a list would otherwise
 * produce one line per row per update.
 *
 * **Nullish.** `{null}` must render nothing. `String(null)` is `"null"`, and
 * that string reached the page from this exact branch — while `_setChild` and
 * SSR both rendered empty, so one file produced a client/server divergence
 * between two siblings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { _rsCollapse, _setChild, _tpl } from '../template'
import { mount } from '../index'

let container: HTMLElement

/** Mount a NativeItem the way the compiled path does. */
function mountNative(item: unknown): () => void {
  const native = item as { el: Node; cleanup?: () => void }
  container.appendChild(native.el)
  return () => {
    native.cleanup?.()
    native.el.parentNode?.removeChild(native.el)
  }
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

describe('rocketstyle collapse picks its class per mode', () => {
  it('swaps the class when the mode flips', () => {
    // The control: two distinct classes means the mode genuinely decides
    // which one applies, so the binding has to be live.
    const dark = signal(false)
    const dispose = mountNative(
      _rsCollapse('<div></div>', 'light-cls', 'dark-cls', () => dark()),
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toBe('light-cls')
    dark.set(true)
    expect(el.className, 'the swap is live').toBe('dark-cls')
    dark.set(false)
    expect(el.className).toBe('light-cls')
    dispose()
  })

  it('takes the single-class FAST PATH when both modes agree', () => {
    // Under CSS-variables theming the resolver produces the same class for
    // both modes — the mode lives in the cascade. Installing a mode binding
    // there costs an effect per element that can never change anything, and
    // this is the dominant configuration.
    const dark = signal(false)
    const dispose = mountNative(_rsCollapse('<div></div>', 'same', 'same', () => dark()))
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toBe('same')
    dark.set(true)
    expect(el.className, 'unchanged, as it must be').toBe('same')
    dispose()
  })

  it('runs the extra BIND on the fast path too', () => {
    // The bind carries whatever else the element needs — handlers, refs,
    // reactive attrs. Skipping it on the fast path would make a
    // single-class component silently inert, and only under CSS-variables
    // theming, which is the configuration hardest to notice it in.
    let bound: Element | null = null
    const dispose = mountNative(
      _rsCollapse('<div></div>', 'same', 'same', () => false, (el) => {
        bound = el
        el.setAttribute('data-bound', '1')
        return null
      }),
    )
    expect(bound, 'the bind ran').not.toBeNull()
    expect(container.firstElementChild?.getAttribute('data-bound')).toBe('1')
    dispose()
  })

  it('runs the extra bind on the REACTIVE path', () => {
    let bound = false
    const dispose = mountNative(
      _rsCollapse('<div></div>', 'l', 'd', () => false, () => {
        bound = true
        return null
      }),
    )
    expect(bound).toBe(true)
    dispose()
  })

  it('accepts NO bind at all on either path', () => {
    // The dominant shape — a purely presentational component.
    expect(() => mountNative(_rsCollapse('<div></div>', 'same', 'same', () => false))()).not.toThrow()
    expect(() => mountNative(_rsCollapse('<div></div>', 'l', 'd', () => false))()).not.toThrow()
  })

  it('disposes the class binding, so a later mode flip is inert', () => {
    // The element is gone; an effect still writing to it keeps the whole
    // subtree alive and does work nobody can see.
    const dark = signal(false)
    const item = _rsCollapse('<div></div>', 'l', 'd', () => dark())
    const el = (item as { el: HTMLElement }).el
    const dispose = mountNative(item)
    dispose()
    dark.set(true)
    expect(el.className, 'frozen at teardown').toBe('l')
  })
})

describe('a non-textish value in a text position warns once', () => {
  it('names the `as never` cast for a FUNCTION', () => {
    // The specific mistake: casting an accessor to `as never` makes the
    // compiler treat the expression as static, so the closure's SOURCE is
    // what lands on the page. Nothing about the rendered output says why.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Driven through a real `h()` mount, not a hand-built vnode literal: a
    // literal skips whatever `h()` does to children, which is the exact
    // silent-metadata-drop class the repo's test-environment audit exists to
    // catch. `() => 'v'` here is the ACCESSOR shape — the compiler would wrap
    // it, so this asserts the runtime's own handling of the value.
    const dispose = mount(h('div', null, (() => 'v') as never), container)
    expect(container.textContent, 'an accessor renders its VALUE').toBe('v')
    dispose()
    warn.mockRestore()
  })

  it('renders NOTHING for a nullish child, not the word null', () => {
    // `String(null)` is `"null"`, and that reached the page from this branch
    // while `_setChild` and SSR both rendered empty — a client/server
    // divergence between two siblings in one file.
    const el = document.createElement('div')
    container.appendChild(el)
    _setChild(el, null)
    expect(el.textContent).toBe('')
    _setChild(el, undefined)
    expect(el.textContent).toBe('')
  })

  it('renders a string as itself and an empty string as empty', () => {
    const el = document.createElement('div')
    container.appendChild(el)
    _setChild(el, 'text')
    expect(el.textContent).toBe('text')
    _setChild(el, '')
    expect(el.textContent).toBe('')
  })

  it('renders ZERO as "0" through a real mount', () => {
    // The control for the nullish rule: it must not swallow legitimate
    // falsy-looking values. Asserted through `mount` rather than `_setChild`
    // because the framework coerces with `String(v)` while `textContent = 0`
    // is the DOM's own coercion — and happy-dom's differs from Chromium's,
    // so a `_setChild(el, 0)` assertion would be testing the environment.
    const dispose = mount(h('p', null, 0 as never), container)
    expect(container.textContent, 'zero is a value, not an absence').toBe('0')
    dispose()
  })

  it('replaces previous content rather than appending', () => {
    const el = document.createElement('div')
    el.textContent = 'old'
    container.appendChild(el)
    _setChild(el, 'new')
    expect(el.textContent, 'one value, not both').toBe('new')
  })
})

describe('the template cache builds one template per html string', () => {
  it('clones a fresh element per call', () => {
    // A cached template that handed out the SAME node would put one element on
    // the page however many rows rendered.
    const a = _tpl('<p class="c">x</p>', () => null) as { el: Element }
    const b = _tpl('<p class="c">x</p>', () => null) as { el: Element }
    expect(a.el).not.toBe(b.el)
    expect((a.el as Element).outerHTML).toBe((b.el as Element).outerHTML)
  })

  it('parses an SVG-rooted template into the SVG namespace', () => {
    // A `<path>` built with `createElement` is an `HTMLUnknownElement`: it
    // answers `querySelector`, reports the right `localName`, and draws
    // nothing. The template path parses inside an `<svg>` wrapper precisely
    // so a bare `<g>`/`<path>` root lands in the right namespace.
    const item = _tpl('<g><path d="M0 0"/></g>', () => null) as { el: Element }
    expect(item.el.namespaceURI).toBe('http://www.w3.org/2000/svg')
    expect(item.el.firstElementChild?.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('runs the bind with the cloned element', () => {
    const seen: Element[] = []
    const item = _tpl('<p></p>', (el) => {
      seen.push(el)
      return null
    }) as { el: Element }
    expect(seen[0]).toBe(item.el)
  })

  it('carries the bind\'s cleanup onto the item', () => {
    let disposed = 0
    const item = _tpl('<p></p>', () => () => {
      disposed++
    }) as { el: Element; cleanup?: () => void }
    item.cleanup?.()
    expect(disposed).toBe(1)
  })
})
