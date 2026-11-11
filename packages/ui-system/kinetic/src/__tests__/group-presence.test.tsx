/**
 * Keyed presence for `kinetic(tag).group()` and `<TransitionGroup>`, driven
 * through the real runtime (`mount` + `h()`), not by calling the renderer and
 * inspecting what it returns.
 *
 * The bug this locks (#4359): both renderers returned an accessor that rebuilt
 * EVERY row on each change. A removed row came back as a fresh, initially
 * hidden item, which never unmounts, so it stayed in the DOM for good; rows
 * that stayed lost their transition state; added rows showed no enter state.
 * Both now keep one row per key (`group-presence.ts`) and render the rows with
 * `<For>`.
 *
 * Real-Chromium coverage of the same flows, through the real compiler, is in
 * `group-and-stagger.browser.test.tsx`.
 */
import type { VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { mount } from '@pyreon/runtime-dom'
import kinetic from '../kinetic'
import TransitionGroup from '../TransitionGroup'

let reducedMotion = false
vi.mock('../useReducedMotion', () => ({
  useReducedMotion: () => () => reducedMotion,
}))

beforeEach(() => {
  vi.useFakeTimers()
  reducedMotion = false
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type Item = { id: string }
const ids = (items: string[]): Item[] => items.map((id) => ({ id }))

const Group = kinetic('ul')
  .enterClass({ active: 'g-enter', from: 'g-enter-from', to: 'g-enter-to' })
  .leaveClass({ active: 'g-leave', from: 'g-leave-from', to: 'g-leave-to' })
  .config({ timeout: 300 })
  .group()

const rows = (root: Element) =>
  Array.from(root.querySelectorAll('li')).map((li) => li.getAttribute('data-id'))

const mountGroup = (initial: string[], extra: Record<string, unknown> = {}) => {
  const items = signal(ids(initial))
  const root = document.createElement('div')
  document.body.appendChild(root)
  const dispose = mount(
    h(Group, { 'data-testid': 'list', ...extra }, () =>
      items().map((item) => h('li', { key: item.id, 'data-id': item.id }, item.id)),
    ),
    root,
  )
  return {
    items,
    root,
    dispose: () => {
      dispose()
      root.remove()
    },
  }
}

describe('kinetic(tag).group() — keyed presence', () => {
  it('renders the initial keyed children inside the tag', () => {
    const { root, dispose } = mountGroup(['a', 'b', 'c'])
    expect(root.querySelector('ul')?.getAttribute('data-testid')).toBe('list')
    expect(rows(root)).toEqual(['a', 'b', 'c'])
    dispose()
  })

  it('a removed row animates out, then unmounts', () => {
    const onAfterLeave = vi.fn()
    const { items, root, dispose } = mountGroup(['a', 'b', 'c'], { onAfterLeave })
    items.set(ids(['a', 'c']))
    // Still in the DOM while it leaves, with the leave state applied.
    const leaving = query<HTMLElement>(root, '[data-id="b"]')
    expect(leaving).not.toBeNull()
    expect(leaving.classList.contains('g-leave')).toBe(true)
    vi.advanceTimersByTime(400)
    expect(rows(root)).toEqual(['a', 'c'])
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('an added row enters at its position', () => {
    const { items, root, dispose } = mountGroup(['a', 'c'])
    items.set(ids(['a', 'b', 'c']))
    expect(rows(root)).toEqual(['a', 'b', 'c'])
    const added = query<HTMLElement>(root, '[data-id="b"]')
    expect(added.classList.contains('g-enter')).toBe(true)
    expect(added.classList.contains('g-enter-from')).toBe(true)
    vi.advanceTimersByTime(20)
    expect(added.classList.contains('g-enter-to')).toBe(true)
    // Rows that did not change were not animated.
    expect(root.querySelector('[data-id="a"]')?.classList.contains('g-enter')).toBe(false)
    dispose()
  })

  it('rows that stay keep their element across changes and a reorder', () => {
    const { items, root, dispose } = mountGroup(['a', 'b', 'c'])
    const a = root.querySelector('[data-id="a"]')
    const c = root.querySelector('[data-id="c"]')
    items.set(ids(['c', 'a', 'b', 'd']))
    expect(rows(root)).toEqual(['c', 'a', 'b', 'd'])
    expect(root.querySelector('[data-id="a"]')).toBe(a)
    expect(root.querySelector('[data-id="c"]')).toBe(c)
    dispose()
  })

  it('a leaving row stays where it was while the others move', () => {
    const { items, root, dispose } = mountGroup(['a', 'b', 'c'])
    items.set(ids(['c', 'a']))
    // b preceded c before the change; it leaves in front of c.
    expect(rows(root)).toEqual(['b', 'c', 'a'])
    vi.advanceTimersByTime(400)
    expect(rows(root)).toEqual(['c', 'a'])
    dispose()
  })

  it('a key that comes back while leaving re-enters the same row', () => {
    const { items, root, dispose } = mountGroup(['a', 'b'])
    const b = query<HTMLElement>(root, '[data-id="b"]')
    items.set(ids(['a']))
    expect(b.classList.contains('g-leave')).toBe(true)
    items.set(ids(['a', 'b']))
    vi.advanceTimersByTime(400)
    expect(rows(root)).toEqual(['a', 'b'])
    expect(root.querySelector('[data-id="b"]')).toBe(b)
    dispose()
  })

  it('accepts the compiler-forwarded shape: an accessor returning the user accessor', () => {
    const items = signal(ids(['a', 'b']))
    const root = document.createElement('div')
    const dispose = mount(
      h(
        Group,
        null,
        (() => () =>
          items().map((item) =>
            h('li', { key: item.id, 'data-id': item.id }, item.id),
          )) as unknown as () => VNode[],
      ),
      root,
    )
    expect(rows(root)).toEqual(['a', 'b'])
    items.set(ids(['b']))
    vi.advanceTimersByTime(400)
    expect(rows(root)).toEqual(['b'])
    dispose()
  })

  it('a child without a key is tracked by position, with a dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = document.createElement('div')
    const dispose = mount(h(Group, null, [h('li', null, 'x'), h('li', null, 'y')]), root)
    expect(root.querySelectorAll('li').length).toBe(2)
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('has no `key`')).length).toBe(1)
    warn.mockRestore()
    dispose()
  })

  it('duplicate keys render once, with a dev warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const root = document.createElement('div')
    const dispose = mount(
      h(Group, null, [
        h('li', { key: 'a', 'data-id': 'a' }, '1'),
        h('li', { key: 'a', 'data-id': 'a' }, '2'),
      ]),
      root,
    )
    expect(rows(root)).toEqual(['a'])
    expect(warn.mock.calls.some((c) => String(c[0]).includes('duplicate key "a"'))).toBe(true)
    warn.mockRestore()
    dispose()
  })

  it('with reduced motion a removed row unmounts at once', () => {
    reducedMotion = true
    const onAfterLeave = vi.fn()
    const { items, root, dispose } = mountGroup(['a', 'b'], { onAfterLeave })
    items.set(ids(['a']))
    expect(rows(root)).toEqual(['a'])
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
    items.set(ids(['a', 'b']))
    expect(rows(root)).toEqual(['a', 'b'])
    dispose()
  })

  it('unmounting the group mid-leave leaves nothing behind', () => {
    const { items, root, dispose } = mountGroup(['a', 'b'])
    items.set(ids(['a']))
    dispose()
    expect(root.querySelectorAll('li').length).toBe(0)
    vi.advanceTimersByTime(400)
  })
})

describe('<TransitionGroup> — keyed presence', () => {
  const mountTG = (initial: string[], onAfterLeave?: () => void) => {
    const items = signal(ids(initial))
    const root = document.createElement('div')
    const dispose = mount(
      h(
        'ul',
        null,
        h(
          TransitionGroup,
          {
            enter: 't-enter',
            leave: 't-leave',
            timeout: 300,
            ...(onAfterLeave ? { onAfterLeave } : {}),
          },
          () => items().map((item) => h('li', { key: item.id, 'data-id': item.id }, item.id)),
        ),
      ),
      root,
    )
    return { items, root, dispose }
  }

  it('a removed child animates out, then unmounts', () => {
    const onAfterLeave = vi.fn()
    const { items, root, dispose } = mountTG(['a', 'b', 'c'], onAfterLeave)
    items.set(ids(['a', 'c']))
    expect(root.querySelector('[data-id="b"]')?.classList.contains('t-leave')).toBe(true)
    vi.advanceTimersByTime(400)
    expect(rows(root)).toEqual(['a', 'c'])
    expect(onAfterLeave).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('an added child enters; staying children keep their element', () => {
    const { items, root, dispose } = mountTG(['a', 'c'])
    const a = root.querySelector('[data-id="a"]')
    items.set(ids(['a', 'b', 'c']))
    expect(rows(root)).toEqual(['a', 'b', 'c'])
    expect(root.querySelector('[data-id="b"]')?.classList.contains('t-enter')).toBe(true)
    expect(root.querySelector('[data-id="a"]')).toBe(a)
    dispose()
  })

  it('static array children render', () => {
    const root = document.createElement('div')
    const dispose = mount(
      h(TransitionGroup, null, [h('p', { key: 1 }, 'one'), h('p', { key: 2 }, 'two')]),
      root,
    )
    expect(root.querySelectorAll('p').length).toBe(2)
    dispose()
  })
})
