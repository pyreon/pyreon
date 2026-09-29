/**
 * SSR → hydrate for a `lazy()` inside `<Suspense>`.
 *
 * The server used to render a still-loading lazy as NOTHING (stream: an empty
 * swap template; string: the fallback). It now waits for the chunk, so the
 * HTML carries the real content — and the client, whose chunk has loaded by
 * hydration time (zero's `startClient` preload is the documented contract),
 * must ADOPT that content rather than rebuild it.
 *
 * The streamed half: a boundary's swap template carried no range markers, so
 * after `__NS` swapped the fallback out the DOM no longer matched a string
 * render and the client REBUILT the boundary — for an async child it even
 * mounted a second copy beside the server's. The template now carries the
 * same `<!--$-->…<!--/$-->` the string renderer emits.
 */
import type { ComponentFn } from '@pyreon/core'
import { h, lazy, Suspense } from '@pyreon/core'
import { renderToStream, renderToString } from '@pyreon/runtime-server'
import { disableHydrationWarnings, hydrateRoot } from '../index'

const Quote: ComponentFn<{ who: string }> = (p) => h('p', { class: 'q' }, `quote:${p.who}`)

describe('lazy() inside Suspense — SSR → hydrate', () => {
  beforeAll(() => disableHydrationWarnings())

  it('the server HTML carries the lazy content, and hydration adopts it', async () => {
    const Lazy = lazy<{ who: string }>(
      () => new Promise((r) => setTimeout(() => r({ default: Quote }), 20)),
    )
    const tree = () =>
      h('main', null, h(Suspense, { fallback: h('i', { class: 'fb' }, 'loading') }, h(Lazy, { who: 'a' })))

    // Rendered while the chunk is STILL LOADING — the case that used to lose it.
    expect(Lazy.__loading()).toBe(true)
    const html = await renderToString(tree())
    expect(html).toContain('quote:a')
    expect(html).not.toContain('loading')

    const c = document.createElement('div')
    document.body.appendChild(c)
    c.innerHTML = html
    const serverP = c.querySelector('p.q')
    expect(serverP).not.toBeNull()

    const dispose = hydrateRoot(c, tree())
    // Same node, not a rebuilt copy — and no fallback anywhere.
    expect(c.querySelector('p.q')).toBe(serverP)
    expect(c.querySelectorAll('p.q').length).toBe(1)
    expect(c.querySelector('.fb')).toBeNull()
    expect(c.textContent).toBe('quote:a')
    dispose()
    c.remove()
  })

  async function read(st: ReadableStream<string>): Promise<string> {
    const r = st.getReader()
    let out = ''
    for (;;) {
      const { value, done } = await r.read()
      if (done) return out
      out += value
    }
  }

  // Parse the streamed document, then run its OWN inline scripts (the `__NS`
  // helper and each swap call) in order — `innerHTML` never executes scripts,
  // and re-implementing the swap here would test the copy, not the shipped one.
  function loadStreamed(html: string): HTMLElement {
    const c = document.createElement('div')
    document.body.appendChild(c)
    c.innerHTML = html
    const scripts = [...c.querySelectorAll('script')]
    const code = scripts.map((s) => s.textContent).join(';\n')
    for (const s of scripts) s.remove()
    // oxlint-disable-next-line no-new-func
    new Function(code)()
    return c
  }

  async function slowAsync(): Promise<ReturnType<typeof h>> {
    await new Promise((r) => setTimeout(r, 10))
    return h('p', { class: 'q' }, 'quote:a')
  }

  for (const kind of ['lazy', 'async'] as const) {
    it(`streamed boundary (${kind} child): the swapped-in content is adopted, not rebuilt`, async () => {
      const Lazy = lazy<{ who: string }>(
        () => new Promise((r) => setTimeout(() => r({ default: Quote }), 20)),
      )
      const Child = (kind === 'lazy' ? Lazy : slowAsync) as unknown as ComponentFn<{ who: string }>
      const tree = () =>
        h('main', null, h(Suspense, { fallback: h('i', { class: 'fb' }, 'loading') }, h(Child, { who: 'a' })))

      const c = loadStreamed(await read(renderToStream(tree())))
      expect(c.querySelector('.fb')).toBeNull()
      const serverP = c.querySelector('p.q')
      expect(serverP).not.toBeNull()

      const dispose = hydrateRoot(c, tree())
      // An async child resolves on the client too — let it settle before judging.
      await new Promise((r) => setTimeout(r, 30))
      expect(c.querySelectorAll('p.q').length).toBe(1)
      expect(c.querySelector('p.q')).toBe(serverP)
      expect(c.querySelector('.fb')).toBeNull()
      dispose()
      c.remove()
    })
  }
})
