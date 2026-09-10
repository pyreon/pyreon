/**
 * What a component does when it fails — including the async ones.
 *
 * A component that throws is not an edge case; it is the normal end state of a
 * bad prop, a failed fetch, or a route module that would not load. What
 * separates a framework that is debuggable from one that is not is entirely in
 * these paths: whether the error reaches an `ErrorBoundary`, whether an
 * unhandled one says which component and why, and — the part that is easiest
 * to get wrong — whether a failure that arrives LATE, after the component has
 * already been unmounted, quietly does nothing instead of writing into DOM that
 * no longer exists.
 *
 * Async components make that last one routine rather than rare: a route
 * component's promise settles after the user has already navigated away, every
 * time they navigate quickly.
 */
import { ErrorBoundary, h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot, mount } from '../index'

let container: HTMLElement
let errors: string[]
beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  errors = []
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map((x) => String(x)).join(' '))
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/** Let a resolved/rejected promise chain settle. */
const settle = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

describe('a component that throws during setup', () => {
  it('reports the component NAME and the error', () => {
    // Without the name, an unhandled throw is a stack trace through framework
    // frames and nothing that points at the user's file.
    const Boom = () => {
      throw new Error('kaboom')
    }
    Object.defineProperty(Boom, 'name', { value: 'Boom' })
    mount(h(Boom, null), container)
    expect(errors.join('\n')).toContain('Boom')
    expect(errors.join('\n')).toContain('kaboom')
  })

  it('renders a dev overlay carrying the message', () => {
    // The overlay is what the developer sees in the page when nothing catches
    // the throw — a blank screen with a console entry is strictly worse.
    const Boom = () => {
      throw new Error('kaboom')
    }
    mount(h(Boom, null), container)
    expect(container.textContent).toContain('kaboom')
  })

  it('survives a NON-Error being thrown', () => {
    // `throw 'a string'` is legal JavaScript and common in hand-written guard
    // code. Reading `.message` and `.stack` off it yields undefined, so an
    // overlay built from them says "undefined" where the reason should be —
    // the diagnostic failing at exactly the moment it is needed.
    const Boom = () => {
      throw 'plain string failure'
    }
    mount(h(Boom, null), container)
    expect(container.textContent).toContain('plain string failure')
    expect(container.textContent, 'no undefined in the overlay').not.toContain('undefined')
  })

  it('survives a thrown object with no message or stack', () => {
    const Boom = () => {
      throw { code: 'E_NOPE' }
    }
    mount(h(Boom, null), container)
    expect(container.textContent).not.toContain('undefined')
  })

  it('hands the throw to an ErrorBoundary instead of the overlay', () => {
    // The control for every "unhandled" assertion above: when something DOES
    // catch, the overlay must not also appear.
    const Boom = () => {
      throw new Error('caught')
    }
    mount(
      h(ErrorBoundary, { fallback: () => h('p', { class: 'fb' }, 'handled') }, h(Boom, null)),
      container,
    )
    expect(container.querySelector('.fb')?.textContent).toBe('handled')
    expect(container.textContent, 'no overlay beside the fallback').not.toContain('caught')
  })

  it('leaves the overlay behind only until it is disposed', () => {
    const Boom = () => {
      throw new Error('kaboom')
    }
    const dispose = mount(h(Boom, null), container)
    expect(container.textContent).toContain('kaboom')
    dispose()
    expect(container.textContent, 'disposed clean').toBe('')
  })
})

describe('an async component whose promise REJECTS', () => {
  it('reports the rejection with the component name', async () => {
    const Slow = async () => {
      await Promise.resolve()
      throw new Error('fetch failed')
    }
    Object.defineProperty(Slow, 'name', { value: 'Slow' })
    mount(h(Slow as never, null), container)
    await settle()
    expect(errors.join('\n')).toContain('Slow')
    expect(errors.join('\n')).toContain('fetch failed')
  })

  it('routes the rejection to an ErrorBoundary', async () => {
    // A route component that fails to load is the reason boundaries exist. If
    // an async rejection cannot reach one, every boundary in the app is
    // decorative for exactly the failure it was put there for.
    const Slow = async () => {
      await Promise.resolve()
      throw new Error('load failed')
    }
    mount(
      h(
        ErrorBoundary,
        { fallback: () => h('p', { class: 'fb' }, 'retry') },
        h(Slow as never, null),
      ),
      container,
    )
    await settle()
    expect(container.querySelector('.fb')?.textContent).toBe('retry')
  })

  it('says NOTHING when the component was unmounted first', async () => {
    // Navigating away before the promise settles. Reporting then is noise
    // about work nobody is waiting for — and worse, it is indistinguishable in
    // the console from a failure the user is actually looking at.
    const Slow = async () => {
      await Promise.resolve()
      await Promise.resolve()
      throw new Error('too late')
    }
    const dispose = mount(h(Slow as never, null), container)
    dispose()
    await settle()
    expect(errors.join('\n'), 'no report for a dead component').not.toContain('too late')
  })

  it('does not touch the DOM when it resolves after unmount', async () => {
    const Slow = async () => {
      await Promise.resolve()
      await Promise.resolve()
      return h('p', { class: 'late' }, 'late')
    }
    const dispose = mount(h(Slow as never, null), container)
    dispose()
    await settle()
    expect(container.querySelector('.late'), 'nothing was mounted into a dead tree').toBeNull()
    expect(container.innerHTML, 'and the placeholder went with it').toBe('')
  })
})

describe('an async component that resolves', () => {
  it('mounts its result — the control', async () => {
    const Slow = async () => {
      await Promise.resolve()
      return h('p', { class: 'ok' }, 'done')
    }
    const dispose = mount(h(Slow as never, null), container)
    await settle()
    expect(container.querySelector('.ok')?.textContent).toBe('done')
    dispose()
  })

  it('mounts NOTHING for a null result without leaving a hole', async () => {
    const Slow = async () => {
      await Promise.resolve()
      return null
    }
    const dispose = mount(h(Slow as never, null), container)
    await settle()
    expect(container.querySelectorAll('*')).toHaveLength(0)
    dispose()
    expect(container.innerHTML).toBe('')
  })

  it('routes a throw from MOUNTING the resolved value to a boundary', async () => {
    // The promise kept its side of the bargain; the value it produced did not.
    // This is a different code path from the rejection above and has its own
    // way of missing the boundary.
    const Bad = () => {
      throw new Error('child exploded')
    }
    const Slow = async () => {
      await Promise.resolve()
      return h(Bad, null)
    }
    mount(
      h(
        ErrorBoundary,
        { fallback: () => h('p', { class: 'fb' }, 'caught') },
        h(Slow as never, null),
      ),
      container,
    )
    await settle()
    expect(container.querySelector('.fb')?.textContent).toBe('caught')
  })

  it('reports an unhandled throw from mounting the resolved value', async () => {
    const Bad = () => {
      throw new Error('child exploded')
    }
    const Slow = async () => {
      await Promise.resolve()
      return h(Bad, null)
    }
    const dispose = mount(h(Slow as never, null), container)
    await settle()
    expect(errors.join('\n')).toContain('child exploded')
    dispose()
  })

  it('disposes cleanly when its placeholder was already removed', async () => {
    // An ancestor emptied the parent while the promise was in flight, so the
    // placeholder this component would remove is already gone. Reaching for
    // its parent unconditionally throws inside the disposer, which strands
    // every cleanup queued behind it.
    const Slow = async () => {
      await Promise.resolve()
      return h('p', { class: 'ok' }, 'done')
    }
    const dispose = mount(h(Slow as never, null), container)
    while (container.firstChild) container.firstChild.remove()
    expect(() => dispose()).not.toThrow()
    await settle()
  })
})

describe('an async component in a HYDRATED tree', () => {
  // Hydration has its own copy of the async-component lifecycle, and its own
  // copy of the late-settle guard. A route component whose promise resolves
  // after the user has navigated away is not rare on a hydrated page — it is
  // what every fast navigation looks like — and the tree it would write into
  // has already been disposed.
  const ssrInto = async (vnode: unknown) => {
    const html = await renderToString(vnode as never)
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    return host
  }

  it('mounts its result when it settles while attached — the control', async () => {
    const Slow = async () => {
      await Promise.resolve()
      return h('p', { class: 'ok' }, 'done')
    }
    const host = await ssrInto(h('div', null, h(Slow as never, null)))
    const dispose = hydrateRoot(host, h('div', null, h(Slow as never, null)))
    await settle()
    expect(host.querySelector('.ok')?.textContent).toBe('done')
    dispose()
  })

  it('says NOTHING when it rejects after the tree was disposed', async () => {
    // The server rendered fine — this is a client-only failure, which is the
    // realistic shape: the data the client re-fetches is not the data the
    // server already had.
    const Ok = async () => {
      await Promise.resolve()
      return h('p', { class: 'ok' }, 'done')
    }
    const Failing = async () => {
      await Promise.resolve()
      await Promise.resolve()
      throw new Error('too late')
    }
    const host = await ssrInto(h('div', null, h(Ok as never, null)))
    const dispose = hydrateRoot(host, h('div', null, h(Failing as never, null)))
    dispose()
    await settle()
    expect(errors.join('\n'), 'no report for a dead tree').not.toContain('too late')
  })

  it('REPORTS a client-only rejection while the tree is alive', async () => {
    // The control for the guard above: silencing a late rejection must not
    // silence a live one.
    const Ok = async () => {
      await Promise.resolve()
      return h('p', { class: 'ok' }, 'done')
    }
    const Failing = async () => {
      await Promise.resolve()
      throw new Error('client only')
    }
    const host = await ssrInto(h('div', null, h(Ok as never, null)))
    const dispose = hydrateRoot(host, h('div', null, h(Failing as never, null)))
    await settle()
    expect(errors.join('\n')).toContain('client only')
    dispose()
  })

  it('writes NOTHING when it resolves after the tree was disposed', async () => {
    const Slow = async () => {
      await Promise.resolve()
      await Promise.resolve()
      return h('p', { class: 'late' }, 'late')
    }
    const host = await ssrInto(h('div', null, h(Slow as never, null)))
    const dispose = hydrateRoot(host, h('div', null, h(Slow as never, null)))
    dispose()
    await settle()
    expect(host.querySelector('.late')).toBeNull()
  })
})
