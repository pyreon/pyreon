/**
 * `<Suspense>` shows its fallback for an async DESCENDANT at any depth, not only
 * for its direct child (the React / Vue model: a pending descendant registers
 * with the NEAREST boundary through context).
 *
 * The boundary's content stays MOUNTED while it waits — it is moved off-screen,
 * not torn down — so the ancestors of the pending descendant keep their DOM and
 * state and never run their setup twice. Every spec asserts identity or a
 * setup/onMount count, not just the final HTML.
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { ErrorBoundary, h, lazy, onMount, Show, Suspense } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot, mount } from '../index'

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

function controlled(comp: ComponentFn) {
  let land!: () => void
  let fail!: (e: Error) => void
  const Lazy = lazy(
    () =>
      new Promise<{ default: ComponentFn }>((res, rej) => {
        land = () => res({ default: comp })
        fail = rej
      }),
  )
  return { Lazy, land: () => land(), fail: (e: Error) => fail(e) }
}

const Leaf: ComponentFn = () => h('p', { class: 'leaf' }, 'leaf')

function host(): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  return c
}

const fb = () => h('i', { class: 'fb' }, 'loading')
const visible = (c: HTMLElement, sel: string) => c.querySelector(sel)

describe('<Suspense> — a NESTED async descendant', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the fallback while a lazy DEEP in the content loads, keeping its ancestors mounted', async () => {
    const setups: number[] = []
    const mounts: number[] = []
    const Layout = (p: { children?: VNodeChild }) => {
      setups.push(1)
      onMount(() => {
        mounts.push(1)
        return undefined
      })
      return h('section', { class: 'layout' }, h('h1', null, 'T'), p.children)
    }
    const { Lazy, land } = controlled(Leaf)
    const c = host()
    mount(h('main', null, h(Suspense, { fallback: fb() }, h(Layout, null, h('div', null, h(Lazy, null)))), h('b', null, 'after')), c)

    expect(visible(c, '.fb')).not.toBeNull()
    expect(visible(c, '.layout')).toBeNull()
    expect(c.textContent).toBe('loadingafter')

    land()
    await tick()
    expect(visible(c, '.fb')).toBeNull()
    expect(visible(c, '.layout .leaf')).not.toBeNull()
    expect(c.textContent).toBe('Tleafafter')
    // Mounted ONCE — off-screen while waiting, never torn down and rebuilt.
    expect(setups).toEqual([1])
    expect(mounts).toEqual([1])
  })

  it('waits for EVERY pending descendant', async () => {
    const a = controlled(() => h('span', { class: 'a' }, 'a'))
    const b = controlled(() => h('span', { class: 'b' }, 'b'))
    const c = host()
    mount(h(Suspense, { fallback: fb() }, h('div', null, h(a.Lazy, null), h('p', null, h(b.Lazy, null)))), c)
    a.land()
    await tick()
    expect(visible(c, '.fb')).not.toBeNull()
    expect(visible(c, '.a')).toBeNull()
    b.land()
    await tick()
    expect(visible(c, '.fb')).toBeNull()
    expect(c.textContent).toBe('ab')
  })

  it('registers with the NEAREST boundary only', async () => {
    const { Lazy, land } = controlled(Leaf)
    const c = host()
    mount(
      h(
        Suspense,
        { fallback: h('i', { class: 'outer-fb' }, 'outer') },
        h('section', { class: 'outer' }, h(Suspense, { fallback: h('i', { class: 'inner-fb' }, 'inner') }, h('div', null, h(Lazy, null)))),
      ),
      c,
    )
    expect(visible(c, '.outer')).not.toBeNull()
    expect(visible(c, '.outer-fb')).toBeNull()
    expect(visible(c, '.inner-fb')).not.toBeNull()
    land()
    await tick()
    expect(visible(c, '.inner-fb')).toBeNull()
    expect(visible(c, '.outer .leaf')).not.toBeNull()
  })

  it('an async component nested in the content suspends the boundary too', async () => {
    let resolve!: () => void
    const gate = new Promise<void>((r) => (resolve = r))
    async function Slow(): Promise<VNodeChild> {
      await gate
      return h('p', { class: 'slow' }, 'slow')
    }
    const c = host()
    mount(h(Suspense, { fallback: fb() }, h('div', null, h(Slow as unknown as ComponentFn, null))), c)
    expect(visible(c, '.fb')).not.toBeNull()
    resolve()
    await tick()
    expect(visible(c, '.fb')).toBeNull()
    expect(visible(c, '.slow')).not.toBeNull()
  })

  it('a descendant that suspends AFTER the boundary resolved shows the fallback again, keeping the content state', async () => {
    const show = signal(false)
    const { Lazy, land } = controlled(Leaf)
    const c = host()
    mount(
      h(Suspense, { fallback: fb() }, h('form', null, h('input', { class: 'in' }), h(Show, { when: () => show() }, h(Lazy, null)))),
      c,
    )
    const input = c.querySelector('input.in') as HTMLInputElement
    input.value = 'typed'
    expect(visible(c, '.fb')).toBeNull()

    show.set(true)
    expect(visible(c, '.fb')).not.toBeNull()
    expect(visible(c, 'input.in')).toBeNull()

    land()
    await tick()
    expect(visible(c, '.fb')).toBeNull()
    expect(c.querySelector('input.in')).toBe(input)
    expect(input.value).toBe('typed')
    expect(visible(c, '.leaf')).not.toBeNull()
  })

  it('a nested chunk that fails settles the boundary and reaches the ErrorBoundary', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { Lazy, fail } = controlled(Leaf)
    const c = host()
    mount(
      h(
        ErrorBoundary,
        { fallback: (e: unknown) => h('u', { class: 'err' }, (e as Error).message) },
        h(Suspense, { fallback: fb() }, h('div', null, h(Lazy, null))),
      ),
      c,
    )
    fail(new Error('chunk 404'))
    await tick()
    expect(visible(c, '.fb')).toBeNull()
    expect(visible(c, '.err')?.textContent).toBe('chunk 404')
    errSpy.mockRestore()
  })

  it('unmounting while pending leaves nothing behind', async () => {
    const { Lazy, land } = controlled(Leaf)
    const c = host()
    const dispose = mount(h('main', null, h(Suspense, { fallback: fb() }, h('div', null, h(Lazy, null)))), c)
    dispose()
    land()
    await tick()
    expect(c.innerHTML).toBe('')
  })

  it('a direct loading child still shows the fallback (unchanged)', async () => {
    const { Lazy, land } = controlled(Leaf)
    const c = host()
    mount(h(Suspense, { fallback: fb() }, h(Lazy, null)), c)
    expect(visible(c, '.fb')).not.toBeNull()
    land()
    await tick()
    expect(c.textContent).toBe('leaf')
  })
})

describe('<Suspense> — nested descendants and hydration', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('a nested still-loading lazy does NOT show the fallback over server content; its nodes are adopted', async () => {
    const tree = (L: ComponentFn) =>
      h('main', null, h(Suspense, { fallback: fb() }, h('section', { class: 's' }, h('h1', null, 'T'), h(L, null))))
    const serverLazy = lazy(() => Promise.resolve({ default: Leaf }))
    const c = host()
    c.innerHTML = await renderToString(tree(serverLazy))
    const section = c.querySelector('section.s')
    const leaf = c.querySelector('.leaf')
    const { Lazy, land } = controlled(Leaf)
    hydrateRoot(c, tree(Lazy))
    expect(visible(c, '.fb')).toBeNull()
    expect(c.querySelector('section.s')).toBe(section)
    land()
    await tick()
    expect(visible(c, '.fb')).toBeNull()
    expect(c.querySelector('.leaf')).toBe(leaf)
  })

  it('a HYDRATED boundary still suspends for a descendant mounted later', async () => {
    const show = signal(false)
    const tree = (L: ComponentFn) =>
      h('main', null, h(Suspense, { fallback: fb() }, h('section', { class: 's' }, h(Show, { when: () => show() }, h(L, null)))))
    const c = host()
    c.innerHTML = await renderToString(tree(lazy(() => Promise.resolve({ default: Leaf }))))
    const section = c.querySelector('section.s')
    const { Lazy, land } = controlled(Leaf)
    hydrateRoot(c, tree(Lazy))
    show.set(true)
    expect(visible(c, '.fb')).not.toBeNull()
    expect(visible(c, 'section.s')).toBeNull()
    land()
    await tick()
    expect(c.querySelector('section.s')).toBe(section)
    expect(visible(c, '.leaf')).not.toBeNull()
    expect(visible(c, '.fb')).toBeNull()
  })
})
