/**
 * Async-component hydration, and the component/element boundary cases the
 * walk has to survive.
 *
 * An async component's output is inlined by `renderToString` and bracketed
 * with `<!--$pas-->` / `<!--$pae-->`, because the client cannot know how many
 * nodes it produced. Hydration advances the parent's cursor past the end
 * marker SYNCHRONOUSLY — so siblings keep hydrating immediately — and then
 * hydrates the resolved subtree into the range once the promise settles.
 *
 * That split is where the interesting failures live, and none of them throws
 * anywhere the reader will look:
 *
 *  - a route unmounted before the promise settles must not hydrate into DOM
 *    that has been torn down, or the removed page's handlers come back;
 *  - a rejected loader (a chunk that 404s after a deploy is the ordinary
 *    cause) must reach an error boundary, not vanish into an unhandled
 *    rejection;
 *  - missing markers must degrade to "leave the SSR DOM alone" with a warning
 *    that names the component, because the alternative is a subtree that is
 *    rendered and completely inert.
 *
 * The component-boundary specs cover the same class one level up: how
 * `children` reaches a component, and whether a `ref` on a hydrated element
 * is wired and released.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { hydrateRoot } from '../hydrate'
import { disableHydrationWarnings } from '../hydration-debug'
import { setupDelegation } from '../delegate'
import { query } from '@pyreon/test-utils'

let container: HTMLElement
const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  setupDelegation(container)
  disableHydrationWarnings()
})
afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

/** SSR markup with an async component's output bracketed by its markers. */
const wrapped = (inner: string) => `<div><!--$pas-->${inner}<!--$pae--></div>`

describe('an async component hydrates its SSR range once it settles', () => {
  it('attaches handlers to the SERVER nodes, not to fresh ones', () => {
    // The control, and the whole product: SSR already painted the subtree, so
    // hydration exists to make it live. Mounting a copy would double the DOM;
    // doing nothing leaves a page that renders and does not respond.
    const clicks: number[] = []
    const Async = async () => {
      await tick()
      return h('button', { class: 'go', onClick: () => clicks.push(1) }, 'go')
    }
    container.innerHTML = wrapped('<button class="go">go</button>')
    const serverBtn = container.querySelector('.go')
    const dispose = hydrateRoot(container, h('div', null, h(Async as never, null)))
    return tick(20).then(() => {
      expect(container.querySelectorAll('.go').length, 'not duplicated').toBe(1)
      expect(container.querySelector('.go'), 'the SERVER node is adopted').toBe(serverBtn)
      ;(query<HTMLElement>(container, '.go')).click()
      expect(clicks, 'and it is live').toEqual([1])
      dispose()
    })
  })

  it('keeps hydrating SIBLINGS without waiting for the promise', () => {
    // The cursor advances past the end marker synchronously. If it waited, a
    // page with one slow async component would leave everything after it
    // inert until that component resolved — the page looks finished and half
    // of it does nothing.
    const clicks: string[] = []
    const Async = async () => {
      await tick(50)
      return h('span', null, 'late')
    }
    container.innerHTML =
      '<div><!--$pas--><span>late</span><!--$pae--><button class="sib">s</button></div>'
    const dispose = hydrateRoot(
      container,
      h(
        'div',
        null,
        h(Async as never, null),
        h('button', { class: 'sib', onClick: () => clicks.push('sib') }, 's'),
      ),
    )
    ;(query<HTMLElement>(container, '.sib')).click()
    expect(clicks, 'the sibling is live before the promise settles').toEqual(['sib'])
    return tick(80).then(() => dispose())
  })

  it('does NOT hydrate after being disposed mid-flight', () => {
    // Navigate away while the chunk is still loading. Hydrating into a torn
    // down range re-attaches the removed page's handlers to detached nodes and
    // keeps its whole closure alive.
    const clicks: number[] = []
    const Async = async () => {
      await tick(30)
      return h('button', { class: 'go', onClick: () => clicks.push(1) }, 'go')
    }
    container.innerHTML = wrapped('<button class="go">go</button>')
    const dispose = hydrateRoot(container, h('div', null, h(Async as never, null)))
    dispose()
    return tick(60).then(() => {
      expect(container.querySelector('.go'), 'the range is gone').toBeNull()
      expect(clicks, 'and nothing was bound into it').toEqual([])
    })
  })

  it('tolerates a loader that resolves to NOTHING', () => {
    // `async () => { … }` with no return, or a guard that returns null. There
    // is no subtree to hydrate; the SSR range is simply left as it is.
    const Async = async () => {
      await tick()
      return null
    }
    container.innerHTML = wrapped('')
    const dispose = hydrateRoot(container, h('div', null, h(Async as never, null)))
    return tick(20).then(() => {
      expect(() => dispose()).not.toThrow()
    })
  })

  it('routes a REJECTED loader to an ErrorBoundary', () => {
    // The chunk-404-after-deploy case. Swallowing it leaves a blank region
    // with no explanation anywhere; an unhandled rejection points at the
    // framework rather than at the boundary the app already wrote.
    const Async = async () => {
      await tick()
      throw new Error('chunk 404')
    }
    container.innerHTML = wrapped('<span>x</span>')
    const dispose = hydrateRoot(
      container,
      h(
        'div',
        null,
        h(ErrorBoundary as never, {
          fallback: () => h('p', { class: 'boom' }, 'failed'),
          children: h(Async as never, null),
        }),
      ),
    )
    return tick(30).then(() => {
      expect(container.querySelector('.boom'), 'the boundary rendered').not.toBeNull()
      dispose()
    })
  })

  it('logs rather than throwing when there is no boundary to catch a rejection', () => {
    // Without this the page dies on an unhandled rejection whose stack points
    // into the hydration walk, several frames from the loader that failed.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Async = async () => {
      await tick()
      throw new Error('nope')
    }
    container.innerHTML = wrapped('<span>x</span>')
    const dispose = hydrateRoot(container, h('div', null, h(Async as never, null)))
    return tick(30).then(() => {
      expect(err, 'the failure is reported').toHaveBeenCalled()
      expect(String(err.mock.calls[0]?.[0]), 'and names the component').toContain('Async')
      dispose()
    })
  })

  it('warns and leaves the SSR DOM ALONE when the markers are missing', () => {
    // Server and client on different versions. The subtree stays rendered and
    // inert, which is the least-bad outcome — but only if the warning names
    // the component, because "some part of my page does not respond" is
    // otherwise unsearchable.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Async = async () => {
      await tick()
      return h('span', null, 'x')
    }
    container.innerHTML = '<div><span>x</span></div>'
    const dispose = hydrateRoot(container, h('div', null, h(Async as never, null)))
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('markers')
    return tick(20).then(() => {
      expect(container.querySelector('span'), 'the server DOM is untouched').not.toBeNull()
      dispose()
    })
  })

  it('handles NESTED async components without crossing their ranges', () => {
    // The end-marker scan is depth-aware. Matching the first `$pae` would end
    // the outer component at the inner one's boundary and leave every node
    // after it to the wrong owner.
    const Inner = async () => {
      await tick()
      return h('em', { class: 'inner' }, 'i')
    }
    const Outer = async () => {
      await tick()
      return h('div', { class: 'outer' }, h(Inner as never, null), h('b', { class: 'tail' }, 't'))
    }
    container.innerHTML =
      '<div><!--$pas--><div class="outer"><!--$pas--><em class="inner">i</em><!--$pae-->' +
      '<b class="tail">t</b></div><!--$pae--></div>'
    const dispose = hydrateRoot(container, h('div', null, h(Outer as never, null)))
    return tick(40).then(() => {
      expect(container.querySelectorAll('.inner').length, 'no duplication').toBe(1)
      expect(container.querySelectorAll('.tail').length).toBe(1)
      dispose()
    })
  })
})

describe('children reach a component the same way they do on mount', () => {
  it('passes a SINGLE child as the value, not as a one-element array', () => {
    // The documented merge: one child arrives as itself. A component doing
    // `props.children.type` — which is most wrappers — breaks on an array,
    // and only for the single-child case, which is the common one.
    let seen: unknown
    const Wrapper = (props: { children?: unknown }) => {
      seen = props.children
      return h('div', null, props.children as never)
    }
    container.innerHTML = '<div><span>one</span></div>'
    const dispose = hydrateRoot(
      container,
      h(Wrapper as never, null, h('span', null, 'one')),
    )
    expect(Array.isArray(seen), 'one child is not an array').toBe(false)
    dispose()
  })

  it('passes SEVERAL children as an array', () => {
    let seen: unknown
    const Wrapper = (props: { children?: unknown }) => {
      seen = props.children
      return h('div', null, props.children as never)
    }
    container.innerHTML = '<div><span>a</span><span>b</span></div>'
    const dispose = hydrateRoot(
      container,
      h(Wrapper as never, null, h('span', null, 'a'), h('span', null, 'b')),
    )
    expect(Array.isArray(seen)).toBe(true)
    expect((seen as unknown[]).length).toBe(2)
    dispose()
  })

  it('does not overwrite an EXPLICIT children prop', () => {
    // `h(Comp, { children: x })` is the shape a render-prop API uses. Letting
    // the positional merge win would silently discard it.
    let seen: unknown
    const Wrapper = (props: { children?: unknown }) => {
      seen = props.children
      return h('div', null, 'fixed')
    }
    container.innerHTML = '<div>fixed</div>'
    const dispose = hydrateRoot(container, h(Wrapper as never, { children: 'explicit' }))
    expect(seen).toBe('explicit')
    dispose()
  })

  it('passes NO children as undefined', () => {
    let seen: unknown = 'unset'
    const Wrapper = (props: { children?: unknown }) => {
      seen = props.children
      return h('div', null, 'x')
    }
    container.innerHTML = '<div>x</div>'
    const dispose = hydrateRoot(container, h(Wrapper as never, null))
    expect(seen).toBeUndefined()
    dispose()
  })
})

describe('a ref on a hydrated element is wired and released', () => {
  it('gives a CALLBACK ref the adopted server node', () => {
    // A ref that fires with a fresh node instead of the server's means the
    // consumer measures or observes something that is not on the page.
    const seen: Array<Element | null> = []
    container.innerHTML = '<div><p class="t">x</p></div>'
    const server = container.querySelector('.t')
    const dispose = hydrateRoot(
      container,
      h('div', null, h('p', { class: 't', ref: (el: Element | null) => seen.push(el) }, 'x')),
    )
    expect(seen[0], 'the adopted node itself').toBe(server)
    dispose()
    expect(seen[1], 'and released on teardown').toBeNull()
  })

  it('gives an OBJECT ref the adopted node and nulls it', () => {
    const ref: { current: Element | null } = { current: null }
    container.innerHTML = '<div><p class="t">x</p></div>'
    const server = container.querySelector('.t')
    const dispose = hydrateRoot(container, h('div', null, h('p', { class: 't', ref }, 'x')))
    expect(ref.current).toBe(server)
    dispose()
    expect(ref.current, 'released — an unreleased ref pins the subtree').toBeNull()
  })

  it('wires a ref on the ROOT element too', () => {
    const ref: { current: Element | null } = { current: null }
    container.innerHTML = '<p class="r">x</p>'
    const dispose = hydrateRoot(container, h('p', { class: 'r', ref }, 'x'))
    expect(ref.current).toBe(container.querySelector('.r'))
    dispose()
    expect(ref.current).toBeNull()
  })
})

describe('a keyed array inside a reactive accessor', () => {
  it('hydrates its rows and stays reactive', () => {
    // An accessor returning a keyed array declines the plain adopt path and
    // hands off to the keyed reconciler instead — mounting it through the
    // non-keyed branch gives the rows no per-key cache, so every later render
    // rebuilds the whole list.
    const rows = signal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ])
    container.innerHTML = '<div><li>a</li><li>b</li></div>'
    const dispose = hydrateRoot(
      container,
      h('div', null, () => rows().map((r) => h('li', { key: r.id }, r.label))),
    )
    expect(container.querySelectorAll('li').length).toBe(2)
    rows.set([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ])
    expect(container.querySelectorAll('li').length, 'the list is live').toBe(3)
    dispose()
  })

  it('leaves no server rows behind when it takes over', () => {
    // The duplication shape: mounting fresh rows while the server's stay
    // renders the list twice.
    const rows = signal([{ id: 1, label: 'a' }])
    container.innerHTML = '<div><li>stale</li><li>rows</li></div>'
    const dispose = hydrateRoot(
      container,
      h('div', null, () => rows().map((r) => h('li', { key: r.id }, r.label))),
    )
    expect(container.querySelectorAll('li').length, 'exactly the client rows').toBe(1)
    dispose()
  })

  it('removes every row on dispose', () => {
    const rows = signal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }])
    container.innerHTML = '<div><li>a</li><li>b</li></div>'
    const dispose = hydrateRoot(
      container,
      h('div', null, () => rows().map((r) => h('li', { key: r.id }, r.label))),
    )
    dispose()
    expect(container.querySelectorAll('li').length).toBe(0)
  })
})
