// Contract test for `connectWebHost` — the guest end of the `<WebView>`
// bridge. Asserts it matches the host end EXACTLY (WebView.tsx): the host
// pushes by setting `window.__pyreonData` + dispatching a `pyreondata`
// event, and receives by defining `window.pyreonPostMessage`. If these
// drift, a webview-hosted chart/editor silently stops updating — so the
// two ends are pinned to one contract here.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectWebHost, webHostDocument } from '../web-host-bridge'

type HostWindow = typeof window & {
  __pyreonData?: unknown
  pyreonPostMessage?: (message: string) => void
}
const w = window as HostWindow

afterEach(() => {
  delete w.__pyreonData
  delete w.pyreonPostMessage
})

describe('connectWebHost — guest end of the WebView bridge', () => {
  it('data() reads the host-pushed window.__pyreonData', () => {
    w.__pyreonData = { rows: [1, 2, 3] }
    const host = connectWebHost<{ rows: number[] }>()
    expect(host.data()).toEqual({ rows: [1, 2, 3] })
  })

  it('data() is undefined before the first push', () => {
    expect(connectWebHost().data()).toBeUndefined()
  })

  it('onData fires on the host push (matches WebView.tsx: set __pyreonData + dispatch pyreondata)', () => {
    const host = connectWebHost<{ n: number }>()
    const seen: Array<{ n: number } | undefined> = []
    host.onData((d) => seen.push(d))
    // Exactly what the host's `push()` does.
    w.__pyreonData = { n: 1 }
    w.dispatchEvent(new Event('pyreondata'))
    w.__pyreonData = { n: 2 }
    w.dispatchEvent(new Event('pyreondata'))
    expect(seen).toEqual([{ n: 1 }, { n: 2 }])
  })

  it('onData unsubscribe stops further callbacks', () => {
    const host = connectWebHost()
    const cb = vi.fn()
    const off = host.onData(cb)
    w.dispatchEvent(new Event('pyreondata'))
    off()
    w.dispatchEvent(new Event('pyreondata'))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('emit() calls the host-defined window.pyreonPostMessage (reverse bridge)', () => {
    const received: string[] = []
    w.pyreonPostMessage = (m) => received.push(m)
    connectWebHost().emit('bar-3')
    expect(received).toEqual(['bar-3'])
  })

  it('emit() is a safe no-op when the host has not defined pyreonPostMessage yet', () => {
    expect(() => connectWebHost().emit('x')).not.toThrow()
  })
})

describe('webHostDocument — self-contained page shell for <WebView html>', () => {
  it('builds a doctype page with the mount root + inlined script', () => {
    const html = webHostDocument({ script: 'window.x=1' })
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<div id="root"></div>')
    expect(html).toContain('<script>window.x=1</script>')
  })

  it('inlines css + custom rootId + title, omits absent optionals', () => {
    const html = webHostDocument({ script: 's()', css: '.a{color:red}', rootId: 'app', title: 'Chart' })
    expect(html).toContain('<style>.a{color:red}</style>')
    expect(html).toContain('<div id="app"></div>')
    expect(html).toContain('<title>Chart</title>')
    const bare = webHostDocument({ script: 's()' })
    expect(bare).not.toContain('<style>')
    expect(bare).not.toContain('<title>')
  })

  it('is fully self-contained — no external script/link (WKWebView / srcdoc safe)', () => {
    const html = webHostDocument({ script: 'x', css: 'y' })
    expect(html).not.toMatch(/<script[^>]+src=/)
    expect(html).not.toMatch(/<link/)
  })
})
