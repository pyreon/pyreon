// `<For>` requires `by` (ForProps, the docs, the `missing-key-on-for` compiler
// warning). Without it the list used to fail deep inside its effect with
// "TypeError: getKey is not a function" (#4357), while the compiler warning
// promised an index-based fallback. `For()` now rejects a missing `by` with a
// `[Pyreon]` error that names the fix, on every path that builds the list:
// h(), the automatic JSX runtime the compiler's output goes through, and
// hydration. (SSR: runtime-server/src/tests/for-without-by.test.ts.)
//
// Bisect-verified: without the check in `core/src/for.ts` the mount specs see
// only "getKey is not a function" (`expected … to contain 'requires a `by`
// prop'`).
import { For, h } from '@pyreon/core'
import { jsx } from '@pyreon/core/jsx-runtime'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hydrateRoot, mount } from '../index'

const messages = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((args: unknown[]) => args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<For> without `by`', () => {
  it('h(): mount reports the [Pyreon] error naming the fix, and renders nothing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = document.createElement('div')
    const dispose = mount(
      h('ul', null, h(For as never, { each: () => [1, 2], children: (n: number) => h('li', null, n) })),
      el,
    )
    const all = messages(spy).join('\n')
    expect(all).toContain('[Pyreon] <For> requires a `by` prop')
    expect(all).toContain('by={(item) => item.id}')
    expect(all).not.toContain('getKey is not a function')
    expect(el.querySelectorAll('li').length).toBe(0)
    dispose()
  })

  it('the automatic JSX runtime (the compiled path) reports the same error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = document.createElement('div')
    const items = signal([1, 2])
    const dispose = mount(
      jsx('ul', { children: jsx(For as never, { each: items, children: ((n: number) => jsx('li', { children: n })) as never }) }),
      el,
    )
    expect(messages(spy).join('\n')).toContain('[Pyreon] <For> requires a `by` prop')
    dispose()
  })

  it('a non-function `by` is rejected the same way', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = document.createElement('div')
    mount(h(For as never, { each: [1], by: 'id', children: (n: number) => h('i', null, n) }), el)
    expect(messages(spy).join('\n')).toContain('(got string)')
  })

  it('hydration reports the same error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const el = document.createElement('div')
    el.innerHTML = '<ul><!--pyreon-for--><li>1</li><!--/pyreon-for--></ul>'
    const dispose = hydrateRoot(
      el,
      h('ul', null, h(For as never, { each: () => [1], children: (n: number) => h('li', null, n) })),
    )
    expect(messages(spy).join('\n')).toContain('[Pyreon] <For> requires a `by` prop')
    dispose()
  })

  it('with `by` the list mounts as before', () => {
    const el = document.createElement('div')
    const dispose = mount(
      h('ul', null, h(For, { each: () => [1, 2], by: (n: number) => n, children: (n: number) => h('li', null, n) })),
      el,
    )
    expect(el.querySelectorAll('li').length).toBe(2)
    dispose()
  })
})
