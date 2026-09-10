/**
 * How mounting fails, and how a keyed ARRAY accessor reconciles.
 *
 * **Failure surface.** A component that throws during setup must not take the
 * page with it: the throw goes to an `ErrorBoundary` when one exists, and in
 * dev — when none does — an overlay is inserted AT THE MOUNT POINT carrying
 * the component name, the message and the stack. That overlay is the only
 * thing standing between "a component threw on line 40" and a blank region
 * with a console the author may not have open. Everything about it is
 * dev-only, so nothing here reaches production.
 *
 * **Keyed arrays.** `{() => items().map(i => <li key={i.id}/>)}` is the shape
 * most apps write before they reach for `<For>`, and it goes through a
 * DIFFERENT reconciler from `<For>` — `mountKeyedList`, with its own
 * contiguous-insertion fast path, its own duplicate handling and its own key
 * validation. Every bug class the `<For>` path has, this one has separately,
 * and its fast paths bail on shapes the general path handles: a keyless
 * vnode in the list, a duplicate key, a missing suffix anchor. A bail is
 * correct; accepting one of those shapes silently mounts a row under another
 * row's identity, so it never updates again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary, h, onMount, Portal } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})
afterEach(() => {
  container.remove()
  vi.restoreAllMocks()
})

describe('a component that throws during setup', () => {
  const Boom = () => {
    throw new Error('setup exploded')
  }

  it('reaches an ErrorBoundary and renders its fallback', () => {
    // The control, and the path an app is expected to use.
    const dispose = mount(
      h(ErrorBoundary as never, {
        fallback: () => h('p', { class: 'fb' }, 'caught'),
        children: h(Boom as never, null),
      }),
      container,
    )
    expect(container.querySelector('.fb')?.textContent).toBe('caught')
    dispose()
  })

  it('shows a dev overlay when NOTHING catches it', () => {
    // Without this the region is simply blank. The overlay puts the failure
    // where the component should have been, which is the only place the
    // author is already looking.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = mount(h('div', null, h(Boom as never, null)), container)
    const overlay = container.querySelector('pre')
    expect(overlay, 'an overlay is inserted at the mount point').toBeTruthy()
    expect(overlay?.textContent, 'naming the component').toContain('Boom')
    expect(overlay?.textContent, 'and the message').toContain('setup exploded')
    err.mockRestore()
    dispose()
  })

  it('puts the overlay at the mount POSITION, not at the end', () => {
    // A failure reported at the bottom of the page sends the reader to the
    // wrong component.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = mount(
      h('div', null, h('span', { class: 'a' }, 'a'), h(Boom as never, null), h('span', { class: 'z' }, 'z')),
      container,
    )
    const kids = [...(container.firstElementChild as Element).children].map((e) =>
      e.tagName.toLowerCase(),
    )
    expect(kids, 'between its siblings').toEqual(['span', 'pre', 'span'])
    err.mockRestore()
    dispose()
  })

  it('removes the overlay on dispose', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = mount(h('div', null, h(Boom as never, null)), container)
    dispose()
    expect(container.querySelector('pre')).toBeNull()
    err.mockRestore()
  })

  it('does NOT show an overlay when a boundary handled it', () => {
    // Two reports for one failure — the fallback AND a red block — makes the
    // boundary look broken.
    const dispose = mount(
      h(ErrorBoundary as never, {
        fallback: () => h('p', { class: 'fb' }, 'caught'),
        children: h(Boom as never, null),
      }),
      container,
    )
    expect(container.querySelector('pre')).toBeNull()
    dispose()
  })

  it('keeps mounting the SIBLINGS after a throw', () => {
    // A failure is per-component. Abandoning the mount would take out the
    // whole page for one bad component.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispose = mount(
      h('div', null, h(Boom as never, null), h('span', { class: 'after' }, 'ok')),
      container,
    )
    expect(container.querySelector('.after')?.textContent).toBe('ok')
    err.mockRestore()
    dispose()
  })
})

describe('an async component render', () => {
  const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

  it('mounts the resolved output at its placeholder', () => {
    const Async = async () => {
      await tick()
      return h('span', { class: 'late' }, 'done')
    }
    const dispose = mount(h('div', null, h(Async as never, null)), container)
    expect(container.querySelector('.late'), 'nothing renders while awaiting').toBeNull()
    return tick(20).then(() => {
      expect(container.querySelector('.late')?.textContent).toBe('done')
      dispose()
    })
  })

  it('does NOT mount after being disposed mid-flight', () => {
    // Navigating away before the promise settles. Mounting into a torn-down
    // parent leaves DOM nobody owns.
    const Async = async () => {
      await tick(30)
      return h('span', { class: 'late' }, 'done')
    }
    const dispose = mount(h('div', null, h(Async as never, null)), container)
    dispose()
    return tick(60).then(() => {
      expect(container.querySelector('.late')).toBeNull()
    })
  })

  it('routes a REJECTED async render to a boundary', () => {
    const Async = async () => {
      await tick()
      throw new Error('async boom')
    }
    const dispose = mount(
      h(ErrorBoundary as never, {
        fallback: () => h('p', { class: 'fb' }, 'caught'),
        children: h(Async as never, null),
      }),
      container,
    )
    return tick(30).then(() => {
      expect(container.querySelector('.fb')).not.toBeNull()
      dispose()
    })
  })

  it('logs when nothing catches an async rejection', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Async = async () => {
      await tick()
      throw new Error('async boom')
    }
    const dispose = mount(h('div', null, h(Async as never, null)), container)
    return tick(30).then(() => {
      expect(err).toHaveBeenCalled()
      expect(String(err.mock.calls[0]?.[0])).toContain('Async')
      dispose()
    })
  })

  it('tolerates an async component resolving to nothing', () => {
    const Async = async () => {
      await tick()
      return null
    }
    const dispose = mount(h('div', null, h(Async as never, null)), container)
    return tick(20).then(() => expect(() => dispose()).not.toThrow())
  })
})

describe('a component returning something unrenderable warns', () => {
  it('names the component for a plain object', () => {
    // `return { data }` instead of JSX. Without the warning the region is
    // empty and nothing says why.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Bad = () => ({ notA: 'vnode' }) as never
    const dispose = mount(h('div', null, h(Bad as never, null)), container)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('Bad'))).toBe(true)
    warn.mockRestore()
    dispose()
  })

  it('stays quiet for every LEGITIMATE return shape', () => {
    // A component may return a vnode, a string, null, an accessor or an array
    // of children. Warning on any of these would make the check noise.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const shapes = [
      () => h('span', null, 'v'),
      () => 'text',
      () => null,
      () => () => 'accessor',
      () => [h('b', null, '1'), h('b', null, '2')],
    ]
    for (const C of shapes) {
      mount(h('div', null, h(C as never, null)), container)()
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('a Portal with a bad target degrades instead of throwing', () => {
  it('warns for a falsy target and renders nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(
      h(Portal as never, { target: null, children: h('span', null, 'x') }),
      container,
    )
    expect(warn.mock.calls.some((c) => String(c[0]).includes('Portal'))).toBe(true)
    warn.mockRestore()
    dispose()
  })

  it('warns for a NON-node target', () => {
    // `target="#modal"` — a selector string, which is the mistake the message
    // exists to name.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dispose = mount(
      h(Portal as never, { target: '#modal' as never, children: h('span', null, 'x') }),
      container,
    )
    expect(warn.mock.calls.some((c) => String(c[0]).includes('DOM node'))).toBe(true)
    warn.mockRestore()
    dispose()
  })
})

describe('a keyed ARRAY accessor reconciles like <For>, through its own path', () => {
  const items = signal<Array<{ id: number; label?: string }>>([])
  const render = () =>
    mount(
      h('ul', null, () => items().map((r) => h('li', { key: r.id }, r.label ?? String(r.id)))),
      container,
    )
  const ids = () => [...container.querySelectorAll('li')].map((e) => e.textContent)
  const set = (...n: number[]) => items.set(n.map((id) => ({ id })))

  it('renders one row per item', () => {
    // The control.
    set(1, 2, 3)
    const dispose = render()
    expect(ids()).toEqual(['1', '2', '3'])
    dispose()
  })

  it('APPENDS without remounting the survivors', () => {
    set(1, 2)
    const dispose = render()
    const first = container.querySelector('li')
    set(1, 2, 3, 4)
    expect(ids()).toEqual(['1', '2', '3', '4'])
    expect(container.querySelector('li'), 'survivors kept').toBe(first)
    dispose()
  })

  it('PREPENDS, keeping the survivors in order behind the new rows', () => {
    set(3, 4)
    const dispose = render()
    const three = container.querySelector('li')
    set(1, 2, 3, 4)
    expect(ids()).toEqual(['1', '2', '3', '4'])
    expect([...container.querySelectorAll('li')][2]).toBe(three)
    dispose()
  })

  it('inserts into the MIDDLE', () => {
    set(1, 4)
    const dispose = render()
    set(1, 2, 3, 4)
    expect(ids()).toEqual(['1', '2', '3', '4'])
    dispose()
  })

  it('removes, reorders and swaps', () => {
    set(1, 2, 3, 4, 5)
    const dispose = render()
    set(1, 3, 5)
    expect(ids()).toEqual(['1', '3', '5'])
    set(5, 3, 1)
    expect(ids()).toEqual(['5', '3', '1'])
    set(3, 1, 5)
    expect(ids()).toEqual(['3', '1', '5'])
    dispose()
  })

  it('keeps a survivor NODE across a reorder', () => {
    // Identity is the whole point of a key: a reordered row must move, not be
    // rebuilt, or its focus, scroll position and any uncontrolled input reset.
    set(1, 2, 3)
    const dispose = render()
    const two = [...container.querySelectorAll('li')][1]
    set(3, 2, 1)
    expect([...container.querySelectorAll('li')][1], 'the same node, moved').toBe(two)
    dispose()
  })

  it('handles a DUPLICATE key by keeping the first', () => {
    // Two rows claiming one identity. First-wins matches the `<For>` path, so
    // the two reconcilers cannot disagree about the same bad data.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    items.set([{ id: 1, label: 'a' }, { id: 1, label: 'b' }])
    const dispose = render()
    expect(ids(), 'one row survives').toEqual(['a'])
    warn.mockRestore()
    dispose()
  })

  it('handles a duplicate arriving on an UPDATE, not just at mount', () => {
    set(1, 2)
    const dispose = render()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    items.set([{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 2, label: 'c' }])
    expect(container.querySelectorAll('li').length, 'no phantom third row').toBe(2)
    warn.mockRestore()
    dispose()
  })

  it('renders a list whose vnodes carry NO key', () => {
    // A `.map()` without `key` is the mistake this path has to survive: the
    // keyed fast paths cannot line up indices, so they bail and the list is
    // reconciled wholesale. Rendering nothing — or reusing a row under the
    // wrong identity — is what a missing bail produces.
    const plain = signal([1, 2, 3])
    const dispose = mount(
      h('ul', null, () => plain().map((n) => h('li', null, String(n)))),
      container,
    )
    expect([...container.querySelectorAll('li')].map((e) => e.textContent)).toEqual(['1', '2', '3'])
    plain.set([1, 2, 3, 4])
    expect([...container.querySelectorAll('li')].map((e) => e.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
    dispose()
  })

  it('renders a MIXED list where only some vnodes are keyed', () => {
    // The half-migrated shape. Indices misalign, so the fast paths must bail
    // rather than pair a keyed row with an unkeyed one.
    const mixed = signal(0)
    const dispose = mount(
      h('ul', null, () => [
        h('li', { key: 'a' }, 'a'),
        h('li', null, `plain${mixed()}`),
        h('li', { key: 'c' }, 'c'),
      ]),
      container,
    )
    expect([...container.querySelectorAll('li')].map((e) => e.textContent)).toEqual([
      'a',
      'plain0',
      'c',
    ])
    mixed.set(1)
    expect([...container.querySelectorAll('li')].map((e) => e.textContent)).toEqual([
      'a',
      'plain1',
      'c',
    ])
    dispose()
  })

  it('clears to empty and repopulates', () => {
    set(1, 2, 3)
    const dispose = render()
    set()
    expect(ids()).toEqual([])
    set(7, 8)
    expect(ids()).toEqual(['7', '8'])
    dispose()
  })

  it('removes every row on dispose', () => {
    set(1, 2, 3)
    const dispose = render()
    dispose()
    expect(container.querySelectorAll('li').length).toBe(0)
  })

  it('runs each row\'s onMount exactly once', () => {
    // A remount that looks like a move fires lifecycle again, which is how a
    // per-row subscription or fetch gets duplicated on every reorder.
    const mounts: string[] = []
    const Row = (props: { id: number }) => {
      onMount(() => {
        mounts.push(`m${props.id}`)
      })
      return h('li', null, String(props.id))
    }
    const list = signal([1, 2])
    const dispose = mount(
      h('ul', null, () => list().map((id) => h(Row as never, { key: id, id }))),
      container,
    )
    expect(mounts).toEqual(['m1', 'm2'])
    list.set([2, 1])
    expect(mounts, 'a reorder is not a remount').toEqual(['m1', 'm2'])
    dispose()
  })
})
