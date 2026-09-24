// Real-Chromium e2e for the WebView-host pattern — the mechanism that lets a
// web-only-rich package (chart / flow / rich-text editor) run 1:1 on native by
// hosting the SAME web bundle in a `<WebView>`. happy-dom can't run an iframe's
// document or its bridge, so this proves the FULL round-trip in a real browser:
//
//   host → guest:  <WebView data={…}>  →  window.__pyreonData + pyreondata
//   guest → host:  window.pyreonPostMessage(…)  →  <WebView onMessage>
//
// The `<iframe srcdoc>` bridge is the exact contract the WKWebView / Android
// WebView bridges mirror, so a green round-trip here is the web proof of the
// native hosting path. The guest page is built with `webHostDocument`; its
// script speaks the same contract `connectWebHost` implements.

import { query } from '@pyreon/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { WebView, webHostDocument } from '../index'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

// A tiny real "engine": renders the host-pushed label, and emits the label on
// click. Uses the raw bridge contract (an isolated iframe can't import from the
// workspace) — the same globals `connectWebHost` reads/writes.
const GUEST_SCRIPT = `
  var root = document.getElementById('root');
  function render() {
    var d = window.__pyreonData || {};
    root.innerHTML = '';
    var b = document.createElement('button');
    b.id = 'label';
    b.textContent = d.label || '(none)';
    b.onclick = function () { window.pyreonPostMessage && window.pyreonPostMessage('clicked:' + b.textContent); };
    root.appendChild(b);
  }
  render();
  window.addEventListener('pyreondata', render);
`

const waitForIframeBody = async (iframe: HTMLIFrameElement): Promise<Document> => {
  for (let i = 0; i < 100; i++) {
    const doc = iframe.contentDocument
    if (doc?.getElementById('label')) return doc
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('guest page never rendered')
}

// The compiler emits `<WebView data={sig()}>` as a reactive (getter-backed)
// prop; in the raw h() path we build the same shape with a getter so the
// WebView's push effect tracks the signal.
const webViewProps = (
  html: string,
  data: () => unknown,
  onMessage?: (m: string) => void,
): Record<string, unknown> => {
  const props: Record<string, unknown> = { html }
  if (onMessage) props.onMessage = onMessage
  Object.defineProperty(props, 'data', { get: data, enumerable: true, configurable: true })
  return props
}

describe('WebView-host round-trip (real Chromium)', () => {
  it('pushes props host→guest (data → __pyreonData) and updates without reload', async () => {
    const label = signal('First')
    const html = webHostDocument({ script: GUEST_SCRIPT })
    const { container, unmount } = mountInBrowser(() =>
      h(WebView, webViewProps(html, () => ({ label: label() }))),
    )
    cleanups.push(unmount)
    const iframe = query<HTMLIFrameElement>(container, 'iframe')
    const doc = await waitForIframeBody(iframe)
    expect(doc.getElementById('label')!.textContent).toBe('First')

    // reactive update — no reload, the pyreondata push re-renders in place
    const before = iframe.contentWindow
    label.set('Second')
    await flush()
    for (let i = 0; i < 50 && doc.getElementById('label')!.textContent !== 'Second'; i++) {
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(doc.getElementById('label')!.textContent).toBe('Second')
    expect(iframe.contentWindow).toBe(before) // same document — pushed, not reloaded
  })

  it('receives events guest→host (pyreonPostMessage → onMessage)', async () => {
    const onMessage = vi.fn()
    const html = webHostDocument({ script: GUEST_SCRIPT })
    const { container, unmount } = mountInBrowser(() =>
      h(WebView, webViewProps(html, () => ({ label: 'Tap' }), onMessage)),
    )
    cleanups.push(unmount)
    const iframe = query<HTMLIFrameElement>(container, 'iframe')
    const doc = await waitForIframeBody(iframe)
    ;(doc.getElementById('label') as HTMLButtonElement).click()
    for (let i = 0; i < 50 && onMessage.mock.calls.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 10))
    }
    expect(onMessage).toHaveBeenCalledWith('clicked:Tap')
  })
})

// A guest that joins a host group and echoes relayed strings into its DOM. It
// speaks the raw reserved protocol (an isolated iframe can't import
// `connectWebHost`) — the same messages that helper posts.
const GROUP_GUEST_SCRIPT = `
  var root = document.getElementById('root');
  var log = document.createElement('pre'); log.id = 'log'; root.appendChild(log);
  window.__pyreonWebViewGroupMessage = function (m) { log.textContent += m + ';'; };
  function apply() {
    var d = window.__pyreonData || {};
    if (d.group) window.pyreonPostMessage(JSON.stringify({ __pyreonWebViewGroup: 1, join: d.group }));
    else window.pyreonPostMessage(JSON.stringify({ __pyreonWebViewGroup: 1, leave: true }));
    if (d.send) window.pyreonPostMessage(JSON.stringify({ __pyreonWebViewGroup: 1, group: d.group, message: d.send }));
    if (d.say) window.pyreonPostMessage(d.say);
  }
  window.addEventListener('pyreondata', apply);
  apply();
`

describe('WebView host groups (real Chromium)', () => {
  const waitForLog = async (iframe: HTMLIFrameElement): Promise<HTMLElement> => {
    for (let i = 0; i < 100; i++) {
      const el = iframe.contentDocument?.getElementById('log')
      if (el) return el
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error('guest page never rendered')
  }
  const tick = () => new Promise((r) => setTimeout(r, 30))

  it('relays a guest string to every sibling host of the same group, never to the origin or another group, and consumes the reserved traffic', async () => {
    const html = webHostDocument({ script: GROUP_GUEST_SCRIPT })
    const states = [signal<Record<string, unknown>>({ group: 'g' }), signal<Record<string, unknown>>({ group: 'g' }), signal<Record<string, unknown>>({ group: 'other' })]
    const messages: string[] = []
    const mounted = states.map((state) =>
      mountInBrowser(h(WebView as never, webViewProps(html, () => state(), (m) => messages.push(m)))),
    )
    cleanups.push(() => mounted.forEach(({ unmount }) => unmount()))
    await flush()
    const frames = mounted.map(({ container }) => query<HTMLIFrameElement>(container, 'iframe'))
    const logs = await Promise.all(frames.map(waitForLog))
    await tick()

    // Origin (0) relays; sibling (1) receives; the other group (2) does not.
    states[0]!.set({ group: 'g', send: 'hello' })
    await flush()
    await tick()
    expect(logs[1]!.textContent).toBe('hello;')
    expect(logs[0]!.textContent, 'never echoed to the origin').toBe('')
    expect(logs[2]!.textContent, 'other group untouched').toBe('')
    // Reserved traffic (join/relay) never reached onMessage; an ordinary
    // message through the same channel still does.
    expect(messages).toEqual([])
    states[0]!.set({ group: 'g', say: 'plain' })
    await flush()
    await tick()
    expect(messages).toEqual(['plain'])

    // The sibling leaves; a further relay from the origin no longer lands.
    states[1]!.set({})
    await flush()
    await tick()
    states[0]!.set({ group: 'g', send: 'again' })
    await flush()
    await tick()
    expect(logs[1]!.textContent).toBe('hello;')

    // Unmounting a host removes it: relaying into a group of one is a no-op
    // (and does not throw against the torn-down frame).
    mounted[2]!.unmount()
    states[0]!.set({ group: 'g', send: 'last' })
    await flush()
    await tick()
    expect(logs[1]!.textContent).toBe('hello;')
  })
})
