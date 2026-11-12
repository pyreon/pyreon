/**
 * Solid's `<SuspenseList>` (#4366) was missing from `@pyreon/solid-compat`,
 * so `import { SuspenseList } from 'solid-js'` failed under `compat: 'solid'`.
 * It renders its children (each `<Suspense>` keeps its own fallback), and
 * warns in development when asked for the reveal coordination it does
 * not implement.
 *
 * Bisect-verified: without the export the import fails and every spec does.
 */
import { mount } from '@pyreon/runtime-dom'
import { jsx } from '../jsx-runtime'
import * as solid from '../index'
import { Suspense, SuspenseList } from '../index'

afterEach(() => vi.restoreAllMocks())

describe('SuspenseList', () => {
  it('is exported', () => {
    expect(typeof (solid as Record<string, unknown>).SuspenseList).toBe('function')
  })

  it('renders its children in order, Suspense boundaries included', () => {
    const el = document.createElement('div')
    const dispose = mount(
      jsx(SuspenseList as never, {
        children: [
          jsx('i', { children: 'first' }),
          jsx(Suspense as never, { fallback: jsx('em', { children: 'loading' }), children: jsx('b', { children: 'second' }) }),
        ],
      }),
      el,
    )
    expect(Array.from(el.querySelectorAll('i, b')).map((n) => n.textContent)).toEqual(['first', 'second'])
    dispose()
  })

  it('warns in development when revealOrder / tail are given, and not otherwise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('div')
    mount(jsx(SuspenseList as never, { children: 'x' }), el)
    expect(warn).not.toHaveBeenCalled()
    mount(jsx(SuspenseList as never, { revealOrder: 'forwards', tail: 'collapsed', children: 'y' }), el)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('[Pyreon] <SuspenseList'))).toBe(true)
  })
})
