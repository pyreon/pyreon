/**
 * #4831 class: an error must reach the `<ErrorBoundary>` that ENCLOSES the
 * code that failed — whenever it fails.
 *
 *  - A `<Defer>` chunk rejects after mount. Its render accessor rethrew from a
 *    reactive re-run, which no boundary sees ("Unhandled effect error", empty
 *    slot). Defer now captures its boundary at setup and hands it the error.
 *  - The boundary used to be the top of a module-level stack read at DISPATCH
 *    time. A boundary stays on that stack until it unmounts, so the "nearest"
 *    boundary was the last one MOUNTED: a component throwing next to a mounted
 *    boundary rendered the sibling's fallback, and an async component's
 *    rejection went to whichever boundary mounted last. The boundary is now
 *    resolved through the context owner chain (the component tree).
 */
import { type ComponentFn, Defer, ErrorBoundary, h, Show, type VNodeChild } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '../index'

let container: HTMLElement
let unmount: () => void = () => {}
let errorSpy: { mock: { calls: unknown[][] }; mockRestore: () => void }

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  unmount()
  unmount = () => {}
  container.remove()
  errorSpy.mockRestore()
})

const tick = () => new Promise((r) => setTimeout(r, 0))

const boundary = (id: string, ...children: VNodeChild[]) =>
  h(ErrorBoundary, {
    fallback: (err: unknown) => h('p', { id }, String(err)),
    children: children.length === 1 ? children[0] : children,
  })

const rejecting = (message: string) => () => Promise.reject(new Error(message))

describe('<Defer> chunk rejection reaches the enclosing <ErrorBoundary> (#4831)', () => {
  it('on a later load (when flips after mount)', async () => {
    const go = signal(false)
    unmount = mount(
      boundary(
        'caught',
        h(Defer, { chunk: rejecting('chunk gone'), when: () => go(), children: (L: ComponentFn) => h(L, null) }),
      ),
      container,
    )
    expect(container.querySelector('#caught')).toBeNull()
    go.set(true)
    await tick()
    expect(container.querySelector('#caught')?.textContent).toBe('Error: chunk gone')
  })

  it('when the trigger is already true at mount', async () => {
    unmount = mount(boundary('caught', h(Defer, { chunk: rejecting('offline'), when: true })), container)
    await tick()
    expect(container.querySelector('#caught')?.textContent).toBe('Error: offline')
  })

  it('on="idle"', async () => {
    unmount = mount(boundary('caught', h(Defer, { chunk: rejecting('idle gone'), on: 'idle' })), container)
    await new Promise((r) => setTimeout(r, 20))
    expect(container.querySelector('#caught')?.textContent).toBe('Error: idle gone')
  })

  it('reset() re-renders the children, so a fresh Defer retries the load', async () => {
    let attempt = 0
    const chunk = () => {
      attempt++
      return attempt === 1
        ? Promise.reject(new Error('first try'))
        : Promise.resolve({ default: () => h('p', { id: 'ok' }, 'loaded') })
    }
    let reset: () => void = () => {}
    unmount = mount(
      h(ErrorBoundary, {
        fallback: (err: unknown, r: () => void) => {
          reset = r
          return h('p', { id: 'caught' }, String(err))
        },
        children: () => h(Defer, { chunk, when: true }),
      }),
      container,
    )
    await tick()
    expect(container.querySelector('#caught')).not.toBeNull()
    reset()
    await tick()
    expect(container.querySelector('#ok')?.textContent).toBe('loaded')
  })

  it('goes to the INNER boundary when boundaries nest', async () => {
    unmount = mount(
      boundary('outer', h('div', null, boundary('inner', h(Defer, { chunk: rejecting('x'), when: true })))),
      container,
    )
    await tick()
    expect(container.querySelector('#inner')).not.toBeNull()
    expect(container.querySelector('#outer')).toBeNull()
  })

  it('does not go to a sibling boundary that mounted after it', async () => {
    const go = signal(false)
    unmount = mount(
      h(
        'div',
        null,
        boundary('own', h(Defer, { chunk: rejecting('mine'), when: () => go() })),
        boundary('sibling', h('span', null, 'ok')),
      ),
      container,
    )
    go.set(true)
    await tick()
    expect(container.querySelector('#own')?.textContent).toBe('Error: mine')
    expect(container.querySelector('#sibling')).toBeNull()
  })

  it('a rejection after the Defer unmounted reaches nothing', async () => {
    let reject!: (e: Error) => void
    const show = signal(true)
    unmount = mount(
      boundary(
        'caught',
        h(Show, {
          when: () => show(),
          children: h(Defer, {
            chunk: () =>
              new Promise<never>((_, r) => {
                reject = r
              }),
            when: true,
          }),
        }),
      ),
      container,
    )
    show.set(false)
    reject(new Error('late'))
    await tick()
    expect(container.querySelector('#caught')).toBeNull()
  })

  it('without a boundary it still surfaces (logged), never silently', async () => {
    unmount = mount(h('div', null, h(Defer, { chunk: rejecting('nobody'), when: true })), container)
    await tick()
    expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('<Defer> failed to load'))).toBe(true)
  })
})

describe('the nearest boundary is the ENCLOSING one, not the last one mounted', () => {
  it('a component throwing next to a mounted boundary does not render its fallback', () => {
    const Thrower = () => {
      throw new Error('boom')
    }
    unmount = mount(h('div', null, boundary('sibling', h('span', null, 'ok')), h(Thrower, null)), container)
    expect(container.querySelector('#sibling')).toBeNull()
  })

  it('a throw inside a later-shown subtree goes to its own boundary', () => {
    const show = signal(false)
    const Thrower = () => {
      throw new Error('late boom')
    }
    unmount = mount(
      h(
        'div',
        null,
        boundary('own', h(Show, { when: () => show(), children: () => h(Thrower, null) })),
        boundary('sibling', h('span', null, 'ok')),
      ),
      container,
    )
    show.set(true)
    expect(container.querySelector('#own')?.textContent).toBe('Error: late boom')
    expect(container.querySelector('#sibling')).toBeNull()
  })

  it('an async component rejection goes to its own boundary, not one mounted after it', async () => {
    const Async = (() => Promise.reject(new Error('async gone'))) as unknown as ComponentFn
    unmount = mount(
      h('div', null, boundary('own', h(Async, null)), boundary('sibling', h('span', null, 'ok'))),
      container,
    )
    await tick()
    expect(container.querySelector('#own')?.textContent).toBe('Error: async gone')
    expect(container.querySelector('#sibling')).toBeNull()
  })

  it('a fallback that throws goes to the outer boundary', () => {
    const Thrower = () => {
      throw new Error('inner')
    }
    unmount = mount(
      boundary(
        'outer',
        h(ErrorBoundary, {
          fallback: () => h(Thrower, null),
          children: h(Thrower, null),
        }),
      ),
      container,
    )
    expect(container.querySelector('#outer')?.textContent).toBe('Error: inner')
  })
})

describe("the boundary's own render is contained", () => {
  it('a throw from the children expression itself goes to this boundary', () => {
    const items = signal<string[] | null>(['a'])
    unmount = mount(
      boundary('own', () => (items() as string[]).length),
      container,
    )
    expect(container.textContent).toBe('1')
    items.set(null)
    expect(container.querySelector('#own')?.textContent).toContain('TypeError')
  })

  it('a fallback that rethrows (NotFoundBoundary-style) goes to the outer boundary', () => {
    const Thrower = () => {
      throw new Error('real bug')
    }
    unmount = mount(
      boundary(
        'outer',
        h(ErrorBoundary, {
          fallback: (err: unknown) => {
            throw err
          },
          children: h(Thrower, null),
        }),
      ),
      container,
    )
    expect(container.querySelector('#outer')?.textContent).toBe('Error: real bug')
  })
})
