/**
 * The host-GROUP relay: two `<WebView>`s that joined the same group name relay
 * messages to each other without the page in between, and a joined page's
 * reserved traffic is CONSUMED rather than surfaced to `onMessage`.
 *
 * The registry is module-level by necessity (siblings live in unrelated
 * subtrees), so the leave/unmount paths are the ones worth pinning: an entry
 * that outlived its host would relay into a detached frame forever.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { WebView, WEB_HOST_GROUP_MARKER, WEB_HOST_GROUP_RELAY_FN } from '../index'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

type Win = Window & {
  pyreonPostMessage?: (m: unknown) => void
  [WEB_HOST_GROUP_RELAY_FN]?: (message: string) => void
}

function mountView(props: Record<string, unknown>): { frame: HTMLIFrameElement; win: Win } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const unmount = mount(h(WebView, props as never), container)
  cleanups.push(() => {
    unmount()
    container.remove()
  })
  const frame = container.firstElementChild as HTMLIFrameElement
  // The reverse bridge is installed by the host's `onLoad`; happy-dom does not
  // fire it for a `srcdoc` frame, so drive it the way the browser would.
  frame.dispatchEvent(new Event('load'))
  return { frame, win: frame.contentWindow as Win }
}

const join = (name: string): string => JSON.stringify({ [WEB_HOST_GROUP_MARKER]: 1, join: name })
const leave = (): string => JSON.stringify({ [WEB_HOST_GROUP_MARKER]: 1, leave: true })
const say = (group: string, message: string): string =>
  JSON.stringify({ [WEB_HOST_GROUP_MARKER]: 1, group, message })

describe('<WebView> host groups', () => {
  it('relays a grouped message to the SIBLING host, never back to the sender', () => {
    const seen: string[] = []
    const a = mountView({ html: '<p>a</p>', onMessage: (m: string) => seen.push(`a:${m}`) })
    const b = mountView({ html: '<p>b</p>', onMessage: (m: string) => seen.push(`b:${m}`) })
    const relayed: string[] = []
    a.win[WEB_HOST_GROUP_RELAY_FN] = (m) => relayed.push(`a:${m}`)
    b.win[WEB_HOST_GROUP_RELAY_FN] = (m) => relayed.push(`b:${m}`)

    a.win.pyreonPostMessage?.(join('charts'))
    b.win.pyreonPostMessage?.(join('charts'))
    a.win.pyreonPostMessage?.(say('charts', 'hello'))

    expect(relayed).toEqual(['b:hello'])
    // Reserved traffic is consumed by the host, not surfaced as a message.
    expect(seen).toEqual([])
  })

  it('stops relaying to a host that LEFT the group', () => {
    const a = mountView({ html: '<p>a</p>' })
    const b = mountView({ html: '<p>b</p>' })
    const relayed: string[] = []
    b.win[WEB_HOST_GROUP_RELAY_FN] = (m) => relayed.push(m)

    a.win.pyreonPostMessage?.(join('g'))
    b.win.pyreonPostMessage?.(join('g'))
    b.win.pyreonPostMessage?.(leave())
    a.win.pyreonPostMessage?.(say('g', 'after-leave'))

    expect(relayed).toEqual([])
  })

  it('refuses to relay into a group the sender has not joined', () => {
    const a = mountView({ html: '<p>a</p>' })
    const b = mountView({ html: '<p>b</p>' })
    const relayed: string[] = []
    b.win[WEB_HOST_GROUP_RELAY_FN] = (m) => relayed.push(m)

    b.win.pyreonPostMessage?.(join('g'))
    a.win.pyreonPostMessage?.(say('g', 'not-mine'))

    expect(relayed).toEqual([])
  })

  it('passes ordinary messages through to onMessage', () => {
    const seen: string[] = []
    const a = mountView({ html: '<p>a</p>', onMessage: (m: string) => seen.push(m) })
    a.win.pyreonPostMessage?.('plain')
    expect(seen).toEqual(['plain'])
  })

  it('a repeated join of the SAME group is a no-op, and a re-join switches groups', () => {
    const a = mountView({ html: '<p>a</p>' })
    const b = mountView({ html: '<p>b</p>' })
    const relayed: string[] = []
    b.win[WEB_HOST_GROUP_RELAY_FN] = (m) => relayed.push(m)

    a.win.pyreonPostMessage?.(join('g'))
    a.win.pyreonPostMessage?.(join('g')) // same group again — early return
    b.win.pyreonPostMessage?.(join('g'))
    a.win.pyreonPostMessage?.(say('g', 'one'))
    // `a` moves to another group: its old group no longer reaches `b`.
    a.win.pyreonPostMessage?.(join('other'))
    a.win.pyreonPostMessage?.(say('g', 'two'))

    expect(relayed).toEqual(['one'])
  })

  it('leaving without having joined, and relaying into an empty group, are no-ops', () => {
    const a = mountView({ html: '<p>a</p>' })
    expect(() => a.win.pyreonPostMessage?.(leave())).not.toThrow()
    expect(() => a.win.pyreonPostMessage?.(say('nobody', 'x'))).not.toThrow()
  })
})
