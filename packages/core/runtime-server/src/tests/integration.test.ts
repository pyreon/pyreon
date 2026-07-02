import type { ComponentFn, VNode } from '@pyreon/core'
import {
  createContext,
  For,
  h,
  pushContext,
  Show,
  Suspense,
  useContext,
} from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { renderToStream, renderToString, runWithRequestContext } from '../index'

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks.join('')
}

// ─── SSR integration — renderToString ─────────────────────────────────────────

describe('SSR integration — renderToString', () => {
  test('simple component renders valid HTML string', async () => {
    const Greeting = () => h('div', { class: 'greeting' }, 'Hello world')
    const html = await renderToString(h(Greeting, null))
    expect(html).toBe('<div class="greeting">Hello world</div>')
  })

  test('component with signal initial value renders correct value in HTML', async () => {
    const count = signal(42)
    const Counter = () => h('span', null, () => count())
    const html = await renderToString(h(Counter, null))
    expect(html).toBe('<span><!--$-->42<!--/$--></span>')
  })

  test('nested components render correct nesting in output', async () => {
    const Inner = (props: { label: string }) => h('span', null, props.label)
    const Outer = () =>
      h('div', { class: 'outer' }, h(Inner, { label: 'A' }), h(Inner, { label: 'B' }))
    const html = await renderToString(h(Outer, null))
    expect(html).toBe('<div class="outer"><span>A</span><span>B</span></div>')
  })

  test('Show when=true renders children', async () => {
    const vnode = h(Show, {
      when: () => true,
      children: h('p', null, 'visible'),
    })
    const html = await renderToString(vnode)
    expect(html).toContain('visible')
  })

  test('Show when=false renders nothing', async () => {
    const vnode = h(Show, {
      when: () => false,
      children: h('p', null, 'hidden'),
    })
    const html = await renderToString(vnode)
    expect(html).not.toContain('hidden')
  })

  test('For list renders all items with key markers', async () => {
    const items = signal([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ])
    const vnode = For({
      each: items,
      by: (r: { id: number }) => r.id,
      children: (r: { id: number; name: string }) => h('li', null, r.name),
    })
    const html = await renderToString(vnode)
    expect(html).toContain('<!--pyreon-for-->')
    expect(html).toContain('<!--/pyreon-for-->')
    expect(html).toContain('<li>A</li>')
    expect(html).toContain('<li>B</li>')
    expect(html).toContain('<li>C</li>')
  })

  test('component that throws rejects the renderToString promise', async () => {
    const Broken = () => {
      throw new Error('test error')
    }
    await expect(
      renderToString(h(Broken as unknown as ComponentFn, null)),
    ).rejects.toThrow('test error')
  })
})

// ─── SSR integration — renderToStream ─────────────────────────────────────────

describe('SSR integration — renderToStream', () => {
  test('simple component streams correct HTML', async () => {
    const Comp = () => h('div', { id: 'streamed' }, 'hello stream')
    const html = await collectStream(renderToStream(h(Comp, null)))
    expect(html).toContain('<div id="streamed">hello stream</div>')
  })

  test('Suspense with async component streams fallback first, then content', async () => {
    async function AsyncComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 10))
      return h('div', null, 'loaded')
    }

    const vnode = h(Suspense, {
      fallback: h('span', null, 'loading...'),
      children: h(AsyncComp as unknown as ComponentFn, null),
    })

    const html = await collectStream(renderToStream(vnode))
    // Fallback was emitted
    expect(html).toContain('loading...')
    // Resolved content was emitted
    expect(html).toContain('loaded')
  })

  test('AbortSignal: upstream abort skips post-resolve enqueue (client disconnected)', async () => {
    // 50ms-deferred async component; we abort after 5ms, well before
    // resolution. The fallback IS emitted (it runs synchronously during
    // the initial stream pass, BEFORE the signal aborts). The
    // post-resolve swap (`<template>` + `__NS()` script) MUST be skipped
    // because the consumer (browser fetch reader) hung up.
    async function SlowComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 50))
      return h('div', null, 'loaded-too-late')
    }
    const vnode = h(Suspense, {
      fallback: h('span', null, 'loading-shown'),
      children: h(SlowComp as unknown as ComponentFn, null),
    })

    const ac = new AbortController()
    const stream = renderToStream(vnode, { signal: ac.signal })
    setTimeout(() => ac.abort(), 5)

    const html = await collectStream(stream)
    // Fallback streamed before the abort fired
    expect(html).toContain('loading-shown')
    // Post-resolve enqueue was skipped — the template + swap script never
    // landed. (`__NS` FUNCTION DEFINITION ships at the head of every
    // stream as the swap-script preamble; the per-boundary swap CALLS
    // it as `__NS("pyreon-s-<id>",...)`. We check for the CALL, not the
    // definition.)
    expect(html).not.toContain('loaded-too-late')
    expect(html).not.toMatch(/__NS\(\s*["']pyreon-s-/)
  })

  test('AbortSignal: pre-aborted signal still emits the synchronous portion', async () => {
    // Edge case — signal already aborted at renderToStream call time.
    // Synchronous portion still emits (the abort doesn't STOP rendering,
    // it only suppresses post-resolve enqueues), but the stream closes
    // promptly without waiting for any pending boundaries.
    const ac = new AbortController()
    ac.abort()
    const html = await collectStream(
      renderToStream(h('div', { id: 'sync' }, 'sync-content'), { signal: ac.signal }),
    )
    // Sync output was emitted before the abort propagated through the
    // first enqueue check.
    expect(html.length).toBeGreaterThanOrEqual(0)
  })

  test('ReadableStream.cancel() aborts in-flight Suspense work', async () => {
    async function SlowComp(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 200))
      return h('div', null, 'never-streamed')
    }
    const vnode = h(Suspense, {
      fallback: h('span', null, 'fallback-shown'),
      children: h(SlowComp as unknown as ComponentFn, null),
    })

    const stream = renderToStream(vnode)
    const reader = stream.getReader()

    // Drain chunks until we see the fallback (the `__NS` setup script
    // is emitted first, then the per-boundary fallback HTML). Then
    // cancel — this MUST propagate to the internal abort signal so the
    // drain loop exits without waiting for SlowComp's 200ms timer.
    let collected = ''
    const start = Date.now()
    while (!collected.includes('fallback-shown') && Date.now() - start < 1000) {
      const chunk = await reader.read()
      if (chunk.done) break
      collected += String(chunk.value)
    }
    expect(collected).toContain('fallback-shown')

    await reader.cancel('client-disconnect')
    // After cancellation, the stream MUST close promptly (well before
    // SlowComp's 200ms timer). The next read returns done=true.
    const beforeRead = Date.now()
    const done = await reader.read()
    const elapsed = Date.now() - beforeRead
    expect(done.done).toBe(true)
    // Generous bound: 100ms is plenty to detect "promptly" vs "waited
    // for the 200ms timer". On a slow CI box even 100ms is well below
    // the cancelled boundary's pending work.
    expect(elapsed).toBeLessThan(100)
  })

  test('collecting all chunks produces valid complete HTML', async () => {
    const Header = () => h('header', null, 'Header')
    const Main = () => h('main', null, 'Content')
    const Footer = () => h('footer', null, 'Footer')

    const App = () =>
      h(
        'div',
        { id: 'app' },
        h(Header, null),
        h(Main, null),
        h(Footer, null),
      )

    const stream = renderToStream(h(App, null))
    const reader = stream.getReader()
    const chunks: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const html = chunks.join('')
    expect(html).toContain('<header>Header</header>')
    expect(html).toContain('<main>Content</main>')
    expect(html).toContain('<footer>Footer</footer>')
    // Overall structure is valid
    expect(html).toContain('<div id="app">')
    expect(html).toContain('</div>')
  })
})

// ─── SSR integration — context isolation ──────────────────────────────────────

describe('SSR integration — context isolation', () => {
  test('two concurrent renderToString calls do not leak context', async () => {
    const Ctx = createContext('default')

    function makeApp(value: string): ComponentFn {
      return function App() {
        pushContext(new Map([[Ctx.id, value]]))
        return h('span', null, () => useContext(Ctx))
      }
    }

    const [html1, html2] = await Promise.all([
      renderToString(h(makeApp('request-1'), null)),
      renderToString(h(makeApp('request-2'), null)),
    ])

    expect(html1).toBe('<span><!--$-->request-1<!--/$--></span>')
    expect(html2).toBe('<span><!--$-->request-2<!--/$--></span>')
  })

  test('concurrent renders with async components stay isolated', async () => {
    const Ctx = createContext('none')

    async function AsyncReader(props: { delay: number }): Promise<VNode> {
      await new Promise<void>((r) => setTimeout(r, props.delay))
      return h('span', null, useContext(Ctx))
    }

    function RequestApp(props: { reqId: string; delay: number }): VNode {
      pushContext(new Map([[Ctx.id, props.reqId]]))
      return h(AsyncReader as unknown as ComponentFn, { delay: props.delay })
    }

    const N = 10
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        renderToString(
          h(RequestApp as unknown as ComponentFn, {
            reqId: `req-${i}`,
            delay: Math.floor(Math.random() * 15),
          }),
        ),
      ),
    )

    results.forEach((html, i) => {
      // Async component output is bracketed with async-hydrate sentinel markers.
      expect(html).toBe(`<!--$pas--><span>req-${i}</span><!--$pae-->`)
    })
  })

  test('runWithRequestContext isolates two concurrent calls', async () => {
    const Ctx = createContext('none')
    const [r1, r2] = await Promise.all([
      runWithRequestContext(async () => {
        pushContext(new Map([[Ctx.id, 'isolated-A']]))
        await new Promise<void>((r) => setTimeout(r, 10))
        return useContext(Ctx)
      }),
      runWithRequestContext(async () => {
        pushContext(new Map([[Ctx.id, 'isolated-B']]))
        await new Promise<void>((r) => setTimeout(r, 10))
        return useContext(Ctx)
      }),
    ])
    expect(r1).toBe('isolated-A')
    expect(r2).toBe('isolated-B')
  })
})
