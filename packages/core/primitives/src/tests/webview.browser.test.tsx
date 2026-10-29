/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { query } from '@pyreon/test-utils'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it, vi } from 'vitest'
import { WebView } from '../web/WebView'

/**
 * `<WebView>` had NO test file anywhere, on any target.
 *
 * That matters more than an ordinary coverage hole: it is the mechanism four
 * packages cross by (charts / code / flow / rich-text all host their bundle
 * inside one), and its two bridges — host->page `__pyreonData` and page->host
 * `pyreonPostMessage` — are the whole contract those packages rely on.
 *
 * Real Chromium, necessarily: an iframe's `contentWindow`, its load event, and
 * cross-document property injection are the substance here, and happy-dom
 * models none of them faithfully enough to prove a bridge works.
 */
const nextTick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

const waitFor = async (cond: () => boolean, ms = 4000): Promise<void> => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor: timed out')
    await nextTick()
  }
}

describe('<WebView> bridges', () => {
  it('FORWARD: pushes data into the page and re-pushes on change without reloading', async () => {
    const data = signal('first')
    // The page records every value it sees plus how many times it loaded, so a
    // RELOAD is distinguishable from an in-place push — the whole point of the
    // forward bridge is that a data change does NOT reload.
    const html = `<!doctype html><body><script>
      window.__loads = (window.__loads || 0) + 1;
      window.__seen = [];
      var rec = function () { window.__seen.push(String(window.__pyreonData)) };
      window.addEventListener('pyreondata', rec);
      setTimeout(rec, 0);
    </script></body>`

    // A GETTER prop, which is what the compiler emits for `data={signal()}`
    // (`_rp` -> `makeReactiveProps`). A bare `h()` object would hand the
    // component a plain value and there would be nothing reactive to re-push.
    const props: Record<string, unknown> = { html }
    Object.defineProperty(props, 'data', { get: () => data(), enumerable: true })

    const { container } = mountInBrowser(() => h(WebView as never, props as never))
    const frame = query(container, 'iframe')
    expect(frame).toBeTruthy()

    const win = (): Window & { __seen?: string[]; __loads?: number } =>
      frame.contentWindow as never
    await waitFor(() => (win().__seen?.length ?? 0) > 0)
    expect(win().__seen?.[0]).toBe('first')

    data.set('second')
    await waitFor(() => (win().__seen ?? []).includes('second'))
    // The load counter is the load-bearing half: a re-push that quietly
    // reloaded the frame would still show 'second' and would have thrown away
    // any state the hosted page held.
    expect(win().__loads).toBe(1)
  })

  it('RELOAD: a changed html reloads the page, and the new page gets the bridge and data', async () => {
    // Native hosts reload when `html` changes. The web host read `html` once,
    // so a reactive swap left the first page running forever.
    const page = signal<'a' | 'b'>('a')
    const onMessage = vi.fn()
    const host = (id: string): string => `<!doctype html><body><script>
      var send = function () {
        if (typeof window.pyreonPostMessage !== 'function') return;
        window.pyreonPostMessage('${id}:' + String(window.__pyreonData));
      };
      window.addEventListener('pyreondata', send);
      setTimeout(send, 0);
    </script></body>`
    const props: Record<string, unknown> = { data: 'graph', onMessage }
    Object.defineProperty(props, 'html', { get: () => host(page()), enumerable: true })

    mountInBrowser(() => h(WebView as never, props as never))
    await waitFor(() => onMessage.mock.calls.some(([m]) => m === 'a:graph'))

    page.set('b')
    // The NEW document must receive the forward bridge's data AND a working
    // reverse bridge, or it could never answer.
    await waitFor(() => onMessage.mock.calls.some(([m]) => m === 'b:graph'))
  })

  it('REVERSE: the hosted page drives onMessage through pyreonPostMessage', async () => {
    const onMessage = vi.fn()
    const html = `<!doctype html><body><script>
      setTimeout(function () { window.pyreonPostMessage && window.pyreonPostMessage('from-page') }, 0);
    </script></body>`

    mountInBrowser(() => h(WebView as never, { html, onMessage } as never))
    await waitFor(() => onMessage.mock.calls.length > 0)
    expect(onMessage).toHaveBeenCalledWith('from-page')
  })

  it('coerces a non-string message, because the native bridges deliver strings', async () => {
    const onMessage = vi.fn()
    const html = `<!doctype html><body><script>
      setTimeout(function () { window.pyreonPostMessage && window.pyreonPostMessage(42) }, 0);
    </script></body>`
    mountInBrowser(() => h(WebView as never, { html, onMessage } as never))
    await waitFor(() => onMessage.mock.calls.length > 0)
    expect(onMessage).toHaveBeenCalledWith('42')
  })

  it('installs the reverse bridge BEFORE the first data push', async () => {
    // A hosted page commonly reacts to its first `pyreondata` by sending
    // something back — an echo, a ready signal, a rendered-size report. If the
    // push lands before the bridge is installed, that first response is dropped
    // silently.
    //
    // This is not hypothetical: pushing first happened to work with `srcdoc`,
    // where the page's own script runs before the host's load handler at all,
    // and broke the moment a real app loaded its page from a bundled file via
    // `src`. Both native runtimes install their message handler at WebView
    // CONSTRUCTION, so the web pushing first also made it the odd one out.
    const onMessage = vi.fn()
    const html = `<!doctype html><body><script>
      function send() { if (window.pyreonPostMessage) window.pyreonPostMessage(String(window.__pyreonData)) }
      window.addEventListener('pyreondata', send);
    </script></body>`

    const props: Record<string, unknown> = { onMessage }
    Object.defineProperty(props, 'html', { get: () => html, enumerable: true })
    Object.defineProperty(props, 'data', { get: () => 'first-push', enumerable: true })

    mountInBrowser(() => h(WebView as never, props as never))
    // The page ONLY replies to the pyreondata event — no timer fallback — so
    // this can pass only if the bridge existed when that first event fired.
    await waitFor(() => onMessage.mock.calls.length > 0)
    expect(onMessage).toHaveBeenCalledWith('first-push')
  })

  it('renders `src` as an iframe src and `html` as srcdoc — html wins when both are given', () => {
    const bySrc = mountInBrowser(() => h(WebView as never, { src: 'page.html' } as never))
    const srcFrame = query(bySrc.container, 'iframe')
    expect(srcFrame.getAttribute('src')).toBe('page.html')
    expect(srcFrame.hasAttribute('srcdoc')).toBe(false)

    // Both: `html` takes precedence, matching what both native runtimes do —
    // a divergence here would mean the same source shows different content per
    // platform, which is worse than either choice.
    const both = mountInBrowser(() =>
      h(WebView as never, { html: '<p>inline</p>', src: 'page.html' } as never),
    )
    const bothFrame = query(both.container, 'iframe')
    expect(bothFrame.getAttribute('srcdoc')).toBe('<p>inline</p>')
    expect(bothFrame.hasAttribute('src')).toBe(false)
  })
})

/**
 * The sizing contract (`grow`, #3956 item 5) measured in real layout. Every
 * expectation here is the number the iOS and Android hosts produce for the same
 * tree, so the web build cannot quietly mean something else by the same prop.
 */
describe('<WebView> sizing', () => {
  const frameIn = (root: HTMLElement): HTMLIFrameElement => query(root, 'iframe') as HTMLIFrameElement
  const column = (height: string, ...children: unknown[]) =>
    h('div', { style: `display: flex; flex-direction: column; width: 320px; height: ${height}` }, ...(children as never[]))
  const fixed = (px: number) => h('div', { style: `height: ${px}px; flex: none` })

  it('is 150 high when unsized — the iframe default the native hosts pin to — even in a sized column', () => {
    const m = mountInBrowser(() => column('600px', fixed(100), h(WebView as never, { html: '<p/>' } as never)))
    const r = frameIn(m.container).getBoundingClientRect()
    expect(r.height).toBe(150)
    expect(r.width).toBe(320)
  })

  it('grow takes exactly the free space a column leaves after its siblings', () => {
    const m = mountInBrowser(() =>
      column('600px', fixed(100), h(WebView as never, { html: '<p/>', grow: true } as never), fixed(50)),
    )
    expect(frameIn(m.container).getBoundingClientRect().height).toBe(450)
  })

  it('two growing views share the free space equally', () => {
    const m = mountInBrowser(() =>
      column(
        '500px',
        fixed(100),
        h(WebView as never, { html: '<p/>', grow: true } as never),
        h(WebView as never, { html: '<p/>', grow: true } as never),
      ),
    )
    const [a, b] = Array.from(m.container.querySelectorAll('iframe'))
    expect(a!.getBoundingClientRect().height).toBe(200)
    expect(b!.getBoundingClientRect().height).toBe(200)
  })

  it('grow keeps the 150 default where the parent has no free space (an auto-height column)', () => {
    const m = mountInBrowser(() => column('auto', fixed(40), h(WebView as never, { html: '<p/>', grow: true } as never)))
    expect(frameIn(m.container).getBoundingClientRect().height).toBe(150)
  })

  it('grow fills a sized NON-flex parent (Compose fillMaxSize / SwiftUI both axes)', () => {
    const m = mountInBrowser(() =>
      h('div', { style: 'width: 300px; height: 400px' }, h(WebView as never, { html: '<p/>', grow: true } as never)),
    )
    expect(frameIn(m.container).getBoundingClientRect().height).toBe(400)
  })

  it('grow along a ROW takes the free width and leaves the height at the default', () => {
    const m = mountInBrowser(() =>
      h(
        'div',
        { style: 'display: flex; flex-direction: row; align-items: flex-start; width: 500px' },
        h('div', { style: 'width: 100px; flex: none' }),
        h(WebView as never, { html: '<p/>', grow: true } as never),
      ),
    )
    const r = frameIn(m.container).getBoundingClientRect()
    expect(r.width).toBe(400)
    expect(r.height).toBe(150)
  })

  it('flips reactively on web, where the prop is not a compile-time decision', async () => {
    const grow = signal(false)
    const m = mountInBrowser(() =>
      column('600px', h(WebView as never, { html: '<p/>', get grow() { return grow() } } as never)),
    )
    expect(frameIn(m.container).getBoundingClientRect().height).toBe(150)
    grow.set(true)
    await nextTick()
    expect(frameIn(m.container).getBoundingClientRect().height).toBe(600)
  })
})
