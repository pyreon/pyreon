/**
 * `lazy()` on the server and through hydration.
 *
 * `@pyreon/runtime-server` waits for a still-loading lazy via the
 * `__loading` / `__load` protocol (`@pyreon/core`'s `lazy()`). The solid-compat
 * layer used to break that contract twice over: `jsx()` WRAPPED the lazy, so
 * the protocol sat behind a wrapper the renderers and `<Suspense>` never saw —
 * the server rendered NOTHING (or the fallback, forever) until the chunk had
 * loaded.
 */
import type { ComponentFn } from '@pyreon/core'
import { h, lazy as coreLazy, nativeCompat } from '@pyreon/core'
import { disableHydrationWarnings, hydrateRoot, mount } from '@pyreon/runtime-dom'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { createSignal, lazy, Suspense } from '../index'
import { jsx } from '../jsx-runtime'

/** `jsx()` takes an untyped-props `ComponentFn`; the typed test components are narrower. */
const asType = (c: unknown): ComponentFn => c as ComponentFn

async function read(s: ReadableStream<string>): Promise<string> {
  const r = s.getReader()
  let out = ''
  for (;;) {
    const { value, done } = await r.read()
    if (done) return out
    out += value
  }
}

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms))

/** A component that uses the framework's own state primitive — proves it is mounted inside a compat render frame. */
const Quote: ComponentFn<{ who: string }> = (p) => {
  const [v] = createSignal('st')
  return jsx('p', { class: 'q', children: `${p.who}:${v()}` })
}

function slowLazy(ms = 20) {
  return lazy(() => new Promise<{ default: ComponentFn<{ who: string }> }>((r) => setTimeout(() => r({ default: Quote }), ms)))
}

function suspended(L: ComponentFn<{ who: string }>, who: string) {
  return jsx('main', {
    children: jsx(asType(Suspense), { fallback: jsx('i', { class: 'fb', children: 'loading' }), children: jsx(asType(L), { who }) }),
  })
}

describe('solid-compat lazy() — SSR waits for a still-loading chunk', () => {
  it('renderToString renders the lazy content inside <Suspense>, not the fallback', async () => {
    const L = slowLazy()
    const html = await renderToString(suspended(L, 'a'))
    expect(html).toContain('<p class="q">a:st</p>')
    expect(html).not.toContain('loading')
  })

  it('renderToString renders a bare lazy (no <Suspense>) instead of nothing', async () => {
    const L = slowLazy()
    const html = await renderToString(jsx('div', { children: jsx(asType(L), { who: 'b' }) }))
    expect(html).toContain('<p class="q">b:st</p>')
  })

  it('renderToStream flushes the fallback, then swaps in the lazy content', async () => {
    const L = slowLazy()
    const html = await read(renderToStream(suspended(L, 'c')))
    expect(html).toContain('<i class="fb">loading</i>')
    expect(html).toMatch(/<template id="pyreon-t-0">[\s\S]*<p class="q">c:st<\/p>[\s\S]*<\/template>/)
    expect(html.indexOf('loading')).toBeLessThan(html.indexOf('c:st'))
  })

  it('exposes the __load settle promise (never rejects) and __loading', async () => {
    const Broken = lazy(() => Promise.reject(new Error('chunk 404')) as Promise<{ default: ComponentFn<{ who: string }> }>)
    const lazyBroken = Broken as unknown as { __loading: () => boolean; __load: () => Promise<void> }
    await expect(lazyBroken.__load()).resolves.toBeUndefined()
    expect(lazyBroken.__loading()).toBe(false)
  })
})

describe('solid-compat lazy() — hydration adopts the server content', () => {
  beforeAll(() => disableHydrationWarnings())

  it('hydrates the SSR node in place (same element, one copy, no fallback)', async () => {
    const L = slowLazy()
    const html = await renderToString(suspended(L, 'h'))
    const c = document.createElement('div')
    document.body.appendChild(c)
    c.innerHTML = html
    const serverP = c.querySelector('p.q')
    expect(serverP).not.toBeNull()

    const dispose = hydrateRoot(c, suspended(L, 'h'))
    expect(c.querySelector('p.q')).toBe(serverP)
    expect(c.querySelectorAll('p.q').length).toBe(1)
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.textContent).toBe('h:st')
    dispose()
    c.remove()
  })
})

describe('solid-compat lazy() — client <Suspense>', () => {
  it('shows the fallback while loading, then the loaded component', async () => {
    const L = slowLazy(10)
    const c = document.createElement('div')
    document.body.appendChild(c)
    const dispose = mount(suspended(L, 'm'), c)
    expect(c.querySelector('.fb')).not.toBeNull()
    await tick(30)
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.querySelector('p.q')?.textContent).toBe('m:st')
    dispose()
    c.remove()
  })
})

describe('solid-compat jsx() — a core lazy() reaching the compat wrapper', () => {
  it('forwards __load as well as __loading, so the server still waits for it', async () => {
    const L = coreLazy<{ who: string }>(
      () => new Promise((r) => setTimeout(() => r({ default: (p) => h('p', { class: 'q' }, `core:${p.who}`) }), 20)),
    )
    const html = await renderToString(suspended(L, 'k'))
    expect(html).toContain('<p class="q">core:k</p>')
    expect(html).not.toContain('loading')
  })
})

describe('solid-compat — hydration while the CLIENT chunk is still loading', () => {
  beforeAll(() => disableHydrationWarnings())

  // The server has its chunk; the browser does not yet. The server range must
  // stay standing (no fallback, no empty gap) and be ADOPTED when it lands.
  // Both a framework-style loaded component (its compat wrapper renders
  // through an accessor of its own) and a Pyreon-native one (nothing but the
  // lazy's own output delimits it).
  const NativeQuote = nativeCompat((p: { who: string }) => h('p', { class: 'q' }, `${p.who}:st`))
  const lazyOf = (comp: ComponentFn<{ who: string }>, ms: number) =>
    lazy(() => new Promise<{ default: ComponentFn<{ who: string }> }>((r) => setTimeout(() => r({ default: comp }), ms)))
  for (const [kind, comp] of [['framework', Quote], ['native', NativeQuote]] as const) {
  for (const wrap of ['suspense', 'bare'] as const) {
    it(`${wrap}, ${kind} component: keeps and adopts the server node`, async () => {
      const tree = (L: ComponentFn<{ who: string }>) =>
        wrap === 'suspense' ? suspended(L, 'd') : jsx('main', { children: jsx(asType(L), { who: 'd' }) })
      const html = await renderToString(tree(lazyOf(comp, 1)))
      const c = document.createElement('div')
      document.body.appendChild(c)
      c.innerHTML = html
      const serverP = c.querySelector('p.q')
      expect(serverP?.textContent).toBe('d:st')

      hydrateRoot(c, tree(lazyOf(comp, 30)))
      expect(c.querySelector('p.q')).toBe(serverP)
      expect(c.querySelector('.fb')).toBeNull()
      await tick(60)
      expect(c.querySelector('p.q')).toBe(serverP)
      expect(c.querySelectorAll('p.q').length).toBe(1)
      expect(serverP?.textContent).toBe('d:st')
      c.remove()
    })
  }
  }
})

describe('solid-compat — a NESTED async descendant suspends the nearest <Suspense>', () => {
  const nested = (L: ComponentFn<{ who: string }>, who: string) =>
    jsx('main', {
      children: jsx(asType(Suspense), {
        fallback: jsx('i', { class: 'fb', children: 'loading' }),
        children: jsx('section', { class: 'wrap', children: jsx('div', { children: jsx(asType(L), { who }) }) }),
      }),
    })

  it('shows the fallback until the nested chunk lands, then the content (mounted once)', async () => {
    const c = document.createElement('div')
    document.body.appendChild(c)
    mount(nested(slowLazy(10), 'n'), c)
    expect(c.querySelector('.fb')).not.toBeNull()
    expect(c.querySelector('section.wrap')).toBeNull()
    await tick(40)
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.querySelector('section.wrap p.q')?.textContent).toBe('n:st')
    expect(c.querySelectorAll('section.wrap').length).toBe(1)
    c.remove()
  })
})
