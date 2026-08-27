/** @jsxImportSource @pyreon/core */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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
    const frame = container.querySelector('iframe') as HTMLIFrameElement
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
    const srcFrame = bySrc.container.querySelector('iframe') as HTMLIFrameElement
    expect(srcFrame.getAttribute('src')).toBe('page.html')
    expect(srcFrame.hasAttribute('srcdoc')).toBe(false)

    // Both: `html` takes precedence, matching what both native runtimes do —
    // a divergence here would mean the same source shows different content per
    // platform, which is worse than either choice.
    const both = mountInBrowser(() =>
      h(WebView as never, { html: '<p>inline</p>', src: 'page.html' } as never),
    )
    const bothFrame = both.container.querySelector('iframe') as HTMLIFrameElement
    expect(bothFrame.getAttribute('srcdoc')).toBe('<p>inline</p>')
    expect(bothFrame.hasAttribute('src')).toBe(false)
  })
})
