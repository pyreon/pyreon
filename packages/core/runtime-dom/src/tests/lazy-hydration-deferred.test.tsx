/**
 * Hydrating a `lazy()` whose CLIENT chunk has not landed yet.
 *
 * The server waits for every lazy before rendering it, so its HTML carries the
 * real content. The client's chunk is often still in flight when `hydrateRoot`
 * runs (nothing preloads it). The lazy's first client render is then nothing,
 * which used to DISCARD the server range — and, outside `<Suspense>`, never
 * render the content at all, because the wrapper read its loaded state once in
 * a component body that runs once. Inside `<Suspense>` the fallback replaced
 * the server content and the content was then mounted again from scratch.
 *
 * Now the range is kept standing and hydrated once `__load()` settles, within
 * the context owner captured at the hydration point. Every spec asserts NODE
 * IDENTITY, not just the final HTML: a rebuild produces the same markup.
 *
 * The server and the client each get their OWN lazy over the same component,
 * like a real app (the server process loaded its chunk; the browser has not).
 */
import type { ComponentFn, VNodeChild } from '@pyreon/core'
import {
  createContext,
  ErrorBoundary,
  h,
  lazy,
  onMount,
  provide,
  Suspense,
  useContext,
} from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot } from '../index'

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

type Mod<P> = { default: ComponentFn<P> }

/** A lazy whose chunk lands only when the test says so. */
function controlled<P extends object>(comp: ComponentFn<P>) {
  let resolve!: (m: Mod<P>) => void
  let reject!: (e: unknown) => void
  const Lazy = lazy<P>(
    () =>
      new Promise<Mod<P>>((res, rej) => {
        resolve = res
        reject = rej
      }),
  )
  return { Lazy, land: () => resolve({ default: comp }), fail: (e: Error) => reject(e) }
}

/** A lazy the SERVER has already loaded. */
function loadedOnServer<P extends object>(comp: ComponentFn<P>) {
  return lazy<P>(() => Promise.resolve({ default: comp }))
}

function host(html: string): HTMLElement {
  const c = document.createElement('div')
  document.body.appendChild(c)
  c.innerHTML = html
  return c
}

const Quote: ComponentFn<{ who: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who}`)

describe('hydrating a still-loading lazy keeps the server DOM', () => {
  beforeAll(() => disableHydrationWarnings())
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const shapes = {
    bare: (L: ComponentFn<{ who: string }>) => h('main', null, h(L, { who: 'a' }), h('b', null, 'after')),
    suspense: (L: ComponentFn<{ who: string }>) =>
      h(
        'main',
        null,
        h(Suspense, { fallback: h('i', { class: 'fb' }, 'loading') }, h(L, { who: 'a' })),
        h('b', null, 'after'),
      ),
  }

  for (const [name, tree] of Object.entries(shapes)) {
    it(`${name}: the server node stays in place while loading, and is ADOPTED when the chunk lands`, async () => {
      const c = host(await renderToString(tree(loadedOnServer(Quote))))
      const serverP = c.querySelector('p.q')
      const after = c.querySelector('b')
      expect(serverP).not.toBeNull()

      const client = controlled(Quote)
      hydrateRoot(c, tree(client.Lazy))
      // Still loading: nothing replaced, no fallback, no empty gap.
      expect(c.querySelector('p.q')).toBe(serverP)
      expect(c.querySelector('.fb')).toBeNull()
      expect(c.querySelector('b')).toBe(after)

      client.land()
      await tick()
      expect(c.querySelector('p.q')).toBe(serverP)
      expect(c.querySelectorAll('p.q').length).toBe(1)
      expect(c.querySelector('.fb')).toBeNull()
      expect(c.textContent).toBe('quote:aafter')
    })
  }

  it('the adopted content is LIVE: events and reactive bindings work after the chunk lands', async () => {
    const count = signal(0)
    const Counter: ComponentFn = () =>
      h('button', { class: 'btn', onClick: () => count.update((n) => n + 1) }, () => `n=${count()}`)
    const tree = (L: ComponentFn) => h('main', null, h(L, {}))
    const c = host(await renderToString(tree(loadedOnServer(Counter))))
    const btn = c.querySelector('button')!

    const client = controlled(Counter)
    hydrateRoot(c, tree(client.Lazy))
    client.land()
    await tick()
    expect(c.querySelector('button')).toBe(btn)
    btn.click()
    expect(btn.textContent).toBe('n=1')
    count.set(5)
    expect(btn.textContent).toBe('n=5')
  })

  it('the loaded component resolves context from where the lazy stood, not from where the load finished', async () => {
    const Ctx = createContext('DEFAULT')
    const Reader: ComponentFn = () => h('span', { class: 'ctx' }, useContext(Ctx))
    const Provider = (props: { children?: VNodeChild }) => {
      provide(Ctx, 'PROVIDED')
      return props.children
    }
    const tree = (L: ComponentFn) => h('main', null, h(Provider, null, h(L, {})), h('b', null, 'after'))
    const c = host(await renderToString(tree(loadedOnServer(Reader))))
    const span = c.querySelector('.ctx')
    expect(span?.textContent).toBe('PROVIDED')

    const client = controlled(Reader)
    hydrateRoot(c, tree(client.Lazy))
    client.land()
    await tick()
    expect(c.querySelector('.ctx')).toBe(span)
    expect(span?.textContent).toBe('PROVIDED')
  })

  it('onMount of the loaded component fires once, when it hydrates', async () => {
    const mounted: Element[] = []
    const Probe: ComponentFn = () => {
      onMount(() => {
        mounted.push(document.querySelector('.probe')!)
        return undefined
      })
      return h('div', { class: 'probe' }, 'x')
    }
    const tree = (L: ComponentFn) => h('main', null, h(L, {}))
    const c = host(await renderToString(tree(loadedOnServer(Probe))))
    const node = c.querySelector('.probe')
    const client = controlled(Probe)
    hydrateRoot(c, tree(client.Lazy))
    expect(mounted).toEqual([])
    client.land()
    await tick()
    expect(mounted).toEqual([node])
  })

  it('nested still-loading lazies each keep their range and adopt when their own chunk lands', async () => {
    const Inner: ComponentFn = () => h('em', { class: 'inner' }, 'in')
    const outerOf =
      (I: ComponentFn): ComponentFn =>
      () =>
        h('section', { class: 'outer' }, h(I, {}))
    const serverInner = loadedOnServer(Inner)
    const tree = (L: ComponentFn) => h('main', null, h(L, {}))
    const c = host(await renderToString(tree(loadedOnServer(outerOf(serverInner)))))
    const section = c.querySelector('section')
    const em = c.querySelector('em')

    const inner = controlled(Inner)
    const outer = controlled(outerOf(inner.Lazy))
    hydrateRoot(c, tree(outer.Lazy))
    outer.land()
    await tick()
    expect(c.querySelector('section')).toBe(section)
    expect(c.querySelector('em')).toBe(em)
    inner.land()
    await tick()
    expect(c.querySelector('em')).toBe(em)
    expect(c.querySelectorAll('em').length).toBe(1)
  })

  it('siblings after a deferred lazy hydrate immediately', async () => {
    const n = signal('one')
    const tree = (L: ComponentFn<{ who: string }>) =>
      h('main', null, h(L, { who: 'a' }), h('b', { class: 'sib' }, () => n()))
    const c = host(await renderToString(tree(loadedOnServer(Quote))))
    const sib = c.querySelector('.sib')
    hydrateRoot(c, tree(controlled(Quote).Lazy))
    n.set('two')
    expect(c.querySelector('.sib')).toBe(sib)
    expect(sib?.textContent).toBe('two')
  })

  it('disposing before the chunk lands cancels the deferred hydration', async () => {
    const mounts: number[] = []
    const Probe: ComponentFn = () => {
      onMount(() => {
        mounts.push(1)
        return undefined
      })
      return h('div', { class: 'probe' }, 'x')
    }
    const tree = (L: ComponentFn) => h('main', null, h(L, {}))
    const c = host(await renderToString(tree(loadedOnServer(Probe))))
    const client = controlled(Probe)
    const dispose = hydrateRoot(c, tree(client.Lazy))
    dispose()
    client.land()
    await tick()
    expect(mounts).toEqual([])
  })

  it('a chunk that FAILS drops the server range and reaches the ErrorBoundary', async () => {
    const tree = (L: ComponentFn<{ who: string }>) =>
      h(
        'main',
        null,
        h(ErrorBoundary, { fallback: (e: unknown) => h('u', { class: 'err' }, String((e as Error).message)) }, h(L, { who: 'a' })),
      )
    const c = host(await renderToString(tree(loadedOnServer(Quote))))
    expect(c.querySelector('p.q')).not.toBeNull()
    const client = controlled(Quote)
    hydrateRoot(c, tree(client.Lazy))
    client.fail(new Error('chunk 404'))
    await tick()
    // No dead server content left standing with no bindings behind it.
    expect(c.querySelector('p.q')).toBeNull()
    expect(c.querySelector('.err')?.textContent).toBe('chunk 404')
  })

  it('a chunk that FAILS with no boundary leaves no dead server content behind', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const c = host(await renderToString(shapes.bare(loadedOnServer(Quote))))
    const client = controlled(Quote)
    hydrateRoot(c, shapes.bare(client.Lazy))
    client.fail(new Error('chunk 404'))
    await tick()
    // What a client mount of a failed lazy renders: nothing. Server nodes with
    // no handler behind them must not stay on screen.
    expect(c.querySelector('p.q')).toBeNull()
    expect(c.textContent).toBe('after')
    errSpy.mockRestore()
  })

  it('a streamed boundary is kept and adopted the same way', async () => {
    async function read(st: ReadableStream<string>): Promise<string> {
      const r = st.getReader()
      let out = ''
      for (;;) {
        const { value, done } = await r.read()
        if (done) return out
        out += value
      }
    }
    const c = host(await read(renderToStream(shapes.suspense(loadedOnServer(Quote)))))
    const scripts = [...c.querySelectorAll('script')]
    const code = scripts.map((s) => s.textContent).join(';\n')
    for (const s of scripts) s.remove()
    // oxlint-disable-next-line no-new-func
    new Function(code)()
    const serverP = c.querySelector('p.q')
    expect(serverP).not.toBeNull()

    const client = controlled(Quote)
    hydrateRoot(c, shapes.suspense(client.Lazy))
    expect(c.querySelector('.fb')).toBeNull()
    client.land()
    await tick()
    expect(c.querySelector('p.q')).toBe(serverP)
    expect(c.querySelectorAll('p.q').length).toBe(1)
  })

  it('RETENTION: every server element under a still-loading lazy survives hydration', async () => {
    const Page: ComponentFn = () =>
      h(
        'article',
        null,
        h('h1', null, 'Title'),
        h('ul', null, ...Array.from({ length: 20 }, (_, i) => h('li', null, h('a', { href: `#${i}` }, `item ${i}`)))),
        h('form', null, h('input', { name: 'q' }), h('button', null, 'go')),
      )
    const tree = (L: ComponentFn) => h('main', null, h(Suspense, { fallback: h('i', null, '…') }, h(L, {})))
    const c = host(await renderToString(tree(loadedOnServer(Page))))
    const before = [...c.querySelectorAll('*')]
    const client = controlled(Page)
    hydrateRoot(c, tree(client.Lazy))
    client.land()
    await tick()
    const after = new Set(c.querySelectorAll('*'))
    const retained = before.filter((el) => after.has(el)).length
    expect(before.length).toBe(47)
    expect(retained).toBe(before.length)
  })

  it('a lazy the client has ALREADY loaded hydrates synchronously, as before', async () => {
    const L = loadedOnServer(Quote)
    await tick()
    const c = host(await renderToString(shapes.bare(L)))
    const p = c.querySelector('p.q')
    hydrateRoot(c, shapes.bare(L))
    expect(c.querySelector('p.q')).toBe(p)
    expect(c.innerHTML).not.toContain('<!--$-->')
  })
})
