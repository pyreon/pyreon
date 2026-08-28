/**
 * Real-mount parity for `<Async>` and `use()`.
 *
 * The unit tests in `@pyreon/core` call the component / composer directly. Per
 * test-environment-parity, contracts that only exist once something is MOUNTED
 * need a real-`h()` counterpart: that the accessor `Async` returns is re-run by
 * the renderer on source change, and that the runtime invokes a `use()` ref with
 * `null` on unmount so directive cleanups actually run.
 *
 * NOTE: this package's vitest config applies no JSX transform — every `.tsx`
 * test here either builds JSX from a string through `transformJSX`, or calls
 * `h()` directly. Authoring literal JSX in this directory fails at import
 * analysis, not at assertion time.
 */
import { query } from '@pyreon/test-utils'
import { Async, h, use, type AsyncLike, type Directive } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, test, vi } from 'vitest'
import { mount } from '../index'

interface State<T> {
  pending?: boolean
  error?: unknown
  data?: T
}

function signalSource<T>(initial: State<T> = { pending: true }): {
  src: AsyncLike<T>
  set: (s: State<T>) => void
} {
  const state = signal<State<T>>(initial)
  return {
    src: {
      isPending: () => state().pending === true,
      isError: () => state().error !== undefined,
      error: () => state().error,
      data: () => state().data,
    },
    set: (s) => state.set(s),
  }
}

describe('<Async> — mounted', () => {
  test('re-renders through pending → error → empty → data → pending', () => {
    const host = document.createElement('div')
    const { src, set } = signalSource<string[]>()

    mount(
      h(Async<string[]>, {
        of: src,
        pending: h('p', { class: 'p' }, 'loading'),
        error: (e: unknown) => h('p', { class: 'e' }, String(e)),
        empty: h('p', { class: 'm' }, 'none'),
        children: (rows: string[]) =>
          h(
            'ul',
            null,
            rows.map((r) => h('li', null, r)),
          ),
      }),
      host,
    )

    expect(host.querySelector('.p')).not.toBeNull()

    set({ error: 'boom' })
    expect(host.querySelector('.e')!.textContent).toBe('boom')
    expect(host.querySelector('.p')).toBeNull()

    set({ data: [] })
    expect(host.querySelector('.m')).not.toBeNull()

    set({ data: ['a', 'b'] })
    expect(host.querySelectorAll('li')).toHaveLength(2)
    expect(host.querySelector('.m')).toBeNull()

    // back to pending — the rendered rows must not survive
    set({ pending: true })
    expect(host.querySelectorAll('li')).toHaveLength(0)
    expect(host.querySelector('.p')).not.toBeNull()
  })

  test('an empty array with no `empty` prop reaches children', () => {
    const host = document.createElement('div')
    const { src, set } = signalSource<string[]>()
    mount(
      h(Async<string[]>, {
        of: src,
        children: (rows: string[]) =>
          h(
            'ul',
            { class: 'list' },
            rows.map((r) => h('li', null, r)),
          ),
      }),
      host,
    )
    set({ data: [] })
    expect(host.querySelector('.list')).not.toBeNull()
    expect(host.querySelectorAll('li')).toHaveLength(0)
  })
})

describe('use() — mounted', () => {
  test('attaches every directive to the real element and cleans up on unmount', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const outside = vi.fn()
    const key = vi.fn()
    const attached: HTMLElement[] = []

    const record: Directive = (el) => {
      attached.push(el)
    }
    const clickOutside =
      (cb: () => void): Directive =>
      (el) => {
        const handler = (e: Event) => {
          if (!el.contains(e.target as Node)) cb()
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
      }
    const hotkey =
      (map: Record<string, () => void>): Directive =>
      (el) => {
        const handler = (e: Event) => map[(e as KeyboardEvent).key]?.()
        el.addEventListener('keydown', handler)
        return () => el.removeEventListener('keydown', handler)
      }

    const dispose = mount(
      h(
        'div',
        { class: 'panel', ref: use(record, clickOutside(outside), hotkey({ Escape: key })) },
        'panel',
      ),
      host,
    )

    const el = query<HTMLElement>(host, '.panel')
    expect(attached).toEqual([el]) // the REAL element, not a placeholder

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(key).toHaveBeenCalledTimes(1)

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(outside).toHaveBeenCalledTimes(1)

    dispose()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(outside).toHaveBeenCalledTimes(1) // cleanup ran — no leaked listener
    host.remove()
  })
})
