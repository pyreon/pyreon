/**
 * `hydrateRoot` registers every hydrated component with the devtools hook,
 * like `mount()` does: an id, the parent from the owner chain, the component's
 * own first element, and `unregisterComponent` on dispose. Before the fix the
 * hydration walk never registered, so every SSR / SSG / Zero app showed an
 * empty Components tree. The real-Chromium twin is
 * `hydrate-devtools-register.browser.test.tsx`; this file also pins that the
 * literal server HTML the browser spec hydrates is what `renderToString` emits.
 */
import { h, lazy, Suspense } from '@pyreon/core'
import type { ComponentFn } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { hydrateRoot } from '../index'
import { DEVTOOLS_SSR, DevtoolsApp, DevtoolsLate, devtoolsLateOn } from './_devtools-hydrate-cases'

interface Entry {
  id: string
  name: string
  el: Element | null
  parentId: string | null
}

const all = (): Entry[] =>
  (
    window as unknown as { __PYREON_DEVTOOLS__: { getAllComponents(): Entry[] } }
  ).__PYREON_DEVTOOLS__.getAllComponents()
const named = (name: string): Entry[] => all().filter((e) => e.name === name)

async function serverHydrate(
  view: ComponentFn,
): Promise<{ host: HTMLElement; dispose: () => void }> {
  const host = document.createElement('div')
  host.innerHTML = await renderToString(h(view, null))
  document.body.appendChild(host)
  const dispose = hydrateRoot(host, h(view, null))
  return {
    host,
    dispose: () => {
      dispose()
      host.remove()
    },
  }
}

describe('hydrateRoot — devtools component registration', () => {
  it('the browser spec hydrates exactly what renderToString emits', async () => {
    expect(await renderToString(h(DevtoolsApp, null))).toBe(DEVTOOLS_SSR.app)
    devtoolsLateOn.set(false)
    expect(await renderToString(h(DevtoolsLate, null))).toBe(DEVTOOLS_SSR.late)
  })

  it('registers every hydrated component with parent and own element; dispose unregisters', async () => {
    const { host, dispose } = await serverHydrate(DevtoolsApp)
    const [app] = named('DevtoolsApp')
    const [header] = named('DevtoolsHeader')
    const items = named('DevtoolsItem')
    expect(app?.parentId).toBeNull()
    expect(app?.el).toBe(host.querySelector('main'))
    expect(header?.parentId).toBe(app?.id)
    expect(header?.el).toBe(host.querySelector('header'))
    expect(items.map((i) => i.el)).toEqual([...host.querySelectorAll('li')])
    for (const i of items) expect(i.parentId).toBe(app?.id)
    dispose()
    expect(named('DevtoolsApp')).toEqual([])
    expect(named('DevtoolsHeader')).toEqual([])
    expect(named('DevtoolsItem')).toEqual([])
  })

  it('a component that renders no element registers with el null', async () => {
    function Text() {
      return 'just text'
    }
    function Wrap() {
      return h('p', null, h(Text, null))
    }
    const { dispose } = await serverHydrate(Wrap)
    expect(named('Text')[0]?.el).toBeNull()
    expect(named('Text')[0]?.parentId).toBe(named('Wrap')[0]?.id)
    dispose()
    expect(named('Text')).toEqual([])
  })

  it('a component mounted after hydration is a child of its hydrated owner and unregisters', async () => {
    devtoolsLateOn.set(false)
    const { host, dispose } = await serverHydrate(DevtoolsLate)
    devtoolsLateOn.set(true)
    const [late] = named('DevtoolsLateChild')
    expect(late?.el).toBe(host.querySelector('em'))
    expect(late?.parentId).toBe(named('DevtoolsLate')[0]?.id)
    devtoolsLateOn.set(false)
    expect(named('DevtoolsLateChild')).toEqual([])
    dispose()
    expect(named('DevtoolsLate')).toEqual([])
  })

  it('a lazy route component hydrated after its chunk lands is registered under its owner', async () => {
    function Page() {
      return h('article', null, 'page')
    }
    let land!: () => void
    const serverLazy = lazy(() => Promise.resolve({ default: Page }))
    const clientLazy = lazy(
      () => new Promise<{ default: ComponentFn }>((r) => (land = () => r({ default: Page }))),
    )
    let useClient = false
    function Shell() {
      return h(
        'div',
        null,
        h(Suspense, { fallback: h('i', null, '…') }, h(useClient ? clientLazy : serverLazy, null)),
      )
    }
    const host = document.createElement('div')
    host.innerHTML = await renderToString(h(Shell, null))
    document.body.appendChild(host)
    useClient = true
    const dispose = hydrateRoot(host, h(Shell, null))
    land()
    await new Promise((r) => setTimeout(r, 10))
    const [page] = named('Page')
    expect(page?.el).toBe(host.querySelector('article'))
    // Up the parent chain to Shell, whatever wrappers sit between.
    const byId = new Map(all().map((e) => [e.id, e]))
    let p = page?.parentId ?? null
    const chain: string[] = []
    while (p) {
      chain.push(byId.get(p)?.name ?? '?')
      p = byId.get(p)?.parentId ?? null
    }
    expect(chain[chain.length - 1]).toBe('Shell')
    dispose()
    host.remove()
    expect(named('Page')).toEqual([])
    expect(named('Shell')).toEqual([])
  })

  it('a nested hydrateRoot (an island) registers its components as their own root', async () => {
    function Counter() {
      return h('button', null, '0')
    }
    const { dispose } = await serverHydrate(Counter)
    expect(named('Counter')[0]?.parentId).toBeNull()
    dispose()
    expect(named('Counter')).toEqual([])
  })
})

describe('async components — devtools registration', () => {
  it('mount() registers an async component and dispose unregisters it', async () => {
    const { mount } = await import('../index')
    async function Slow() {
      await Promise.resolve()
      return h('p', null, 'slow')
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(h(Slow as unknown as ComponentFn, null), host)
    expect(named('Slow')).toHaveLength(1)
    dispose()
    host.remove()
    expect(named('Slow')).toEqual([])
  })

  it('hydrateRoot registers an async component with its server element', async () => {
    async function SlowH() {
      await Promise.resolve()
      return h('p', null, 'slow')
    }
    const { host, dispose } = await serverHydrate(SlowH as unknown as ComponentFn)
    expect(named('SlowH')[0]?.el).toBe(host.querySelector('p'))
    dispose()
    expect(named('SlowH')).toEqual([])
  })
})

describe('hydration mismatch — devtools element', () => {
  it('a component whose server node was replaced records the replacement', async () => {
    const { disableHydrationWarnings, enableHydrationWarnings } = await import('../index')
    function Tag() {
      return h('section', { id: 'client' }, 'x')
    }
    function Before() {
      return h('b', null, 'before')
    }
    function Page() {
      return h('div', null, h(Before, null), h(Tag, null), h('i', null, 'after'))
    }
    const host = document.createElement('div')
    // The server rendered an <article> where the client renders a <section>.
    host.innerHTML = '<div><b>before</b><article>x</article><i>after</i></div>'
    document.body.appendChild(host)
    disableHydrationWarnings()
    const dispose = hydrateRoot(host, h(Page, null))
    enableHydrationWarnings()
    expect(host.querySelector('section')).not.toBeNull()
    expect(named('Tag')[0]?.el).toBe(host.querySelector('section'))
    expect(named('Before')[0]?.el).toBe(host.querySelector('b'))
    dispose()
    host.remove()
    expect(named('Tag')).toEqual([])
  })
})
