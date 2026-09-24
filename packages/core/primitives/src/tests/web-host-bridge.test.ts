// Contract test for `connectWebHost` — the guest end of the `<WebView>`
// bridge. Asserts it matches the host end EXACTLY (WebView.tsx): the host
// pushes by setting `window.__pyreonData` + dispatching a `pyreondata`
// event, and receives by defining `window.pyreonPostMessage`. If these
// drift, a webview-hosted chart/editor silently stops updating — so the
// two ends are pinned to one contract here.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectWebHost, parseWebHostGroupMessage, webHostDocument } from '../web-host-bridge'

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

describe('host groups — the guest half + the reserved protocol', () => {
  it('parseWebHostGroupMessage recognises exactly the three reserved shapes and nothing else', () => {
    expect(parseWebHostGroupMessage('clicked:A')).toBeNull()
    expect(parseWebHostGroupMessage('{"name":"A"}')).toBeNull()
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":2,"join":"g"}')).toBeNull()
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1,"join":""}')).toBeNull()
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1')).toBeNull()
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1,"join":"g"}')).toEqual({ __pyreonWebViewGroup: 1, join: 'g' })
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1,"leave":true}')).toEqual({ __pyreonWebViewGroup: 1, leave: true })
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1,"group":"g","message":"{\\"type\\":\\"hideTip\\"}"}')).toEqual({
      __pyreonWebViewGroup: 1,
      group: 'g',
      message: '{"type":"hideTip"}',
    })
    // A relay without a group, or a non-string message, is not a relay.
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1,"message":"x"}')).toBeNull()
    expect(parseWebHostGroupMessage('{"__pyreonWebViewGroup":1,"group":"g","message":1}')).toBeNull()
  })

  it('joinGroup / leaveGroup / relay post the reserved messages through pyreonPostMessage', () => {
    const posted: string[] = []
    w.pyreonPostMessage = (m: string) => posted.push(m)
    const host = connectWebHost()
    host.relay('early') // not in a group yet → nothing
    host.joinGroup('dash')
    host.joinGroup('dash') // idempotent
    host.relay('{"type":"hideTip"}')
    host.joinGroup('other') // moving groups = one join (the host leaves the old one itself)
    host.leaveGroup()
    host.leaveGroup() // idempotent
    host.relay('late') // left → nothing
    expect(posted.map((m) => JSON.parse(m))).toEqual([
      { __pyreonWebViewGroup: 1, join: 'dash' },
      { __pyreonWebViewGroup: 1, group: 'dash', message: '{"type":"hideTip"}' },
      { __pyreonWebViewGroup: 1, join: 'other' },
      { __pyreonWebViewGroup: 1, leave: true },
    ])
  })

  it('onRelay installs ONE page-level entry point and fans a host-delivered relay to every subscriber', () => {
    const host = connectWebHost()
    const seen: string[] = []
    const offA = host.onRelay((m) => seen.push('a:' + m))
    host.onRelay((m) => seen.push('b:' + m))
    const entry = (w as unknown as { __pyreonWebViewGroupMessage?: (m: string) => void }).__pyreonWebViewGroupMessage
    expect(typeof entry).toBe('function')
    entry!('one')
    offA()
    entry!('two')
    expect(seen).toEqual(['a:one', 'b:one', 'b:two'])
  })
})
