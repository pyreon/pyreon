import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { REMOTE_ORIGIN } from '../crdt/types'
import { createYjsDoc } from '../crdt/yjs-adapter'
import { connectYDocs } from '../crdt/yjs-transport'
import { syncedSignal } from '../synced-signal'

// DOM-level proof of the core thesis: a remote CRDT op drives a FINE-GRAINED
// DOM update — the bound region updates and the component does NOT re-render.
//
// This is pure runtime + reactivity behavior (mount → reactive child → signal
// change → patch), with no real-browser-specific API involved, so happy-dom is
// a faithful environment for it. (The real-Chromium TWO-TAB + cross-tab
// BroadcastChannel + compiled-`_bindText` demo is a separate Playwright e2e —
// the @vitest/browser harness deadlocks intermittently on this worktree's
// vite dep-optimize graph, and the two-tab story is genuinely e2e territory.)

describe('synced signal → DOM (happy-dom)', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups.splice(0)) c()
  })

  const mountInto = (vnode: ReturnType<typeof h>): HTMLElement => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(vnode, container)
    cleanups.push(() => {
      dispose()
      container.remove()
    })
    return container
  }

  it('a remote op updates the bound DOM region once, with no component re-render', () => {
    const doc = createYjsDoc()
    const title = syncedSignal({ doc, key: 'title', initial: 'v1' })
    cleanups.push(() => title.dispose())

    let bodyRuns = 0
    const View = () => {
      bodyRuns++
      return h('span', { id: 'title' }, () => title())
    }
    const container = mountInto(h(View, null))

    const span1 = container.querySelector('#title')
    expect(span1?.textContent).toBe('v1')
    expect(bodyRuns).toBe(1)

    // Count fine-grained updates on the bound signal.
    let updates = 0
    cleanups.push(title.subscribe(() => updates++))

    // Inbound remote change — exactly what the transport does on receiving a
    // peer's update: a REMOTE-origin transaction on the doc.
    doc.transact(() => doc.getMap('pyreon').set('title', 'v2'), REMOTE_ORIGIN)

    const span2 = container.querySelector('#title')
    expect(span2).toBe(span1) // SAME element — the component was not re-rendered
    expect(span2?.textContent).toBe('v2') // the bound region updated
    expect(updates).toBe(1) // exactly one fine-grained update
    expect(bodyRuns).toBe(1) // component body still ran exactly once
  })

  it('a peer edit propagates through the transport to the DOM (two docs)', () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const link = connectYDocs(a, b)
    cleanups.push(() => link.disconnect())

    const titleA = syncedSignal({ doc: a, key: 'title', initial: '' })
    const titleB = syncedSignal({ doc: b, key: 'title', initial: '' })
    cleanups.push(() => titleA.dispose(), () => titleB.dispose())

    const container = mountInto(h('span', { id: 'a-title' }, () => titleA()))

    // Peer B edits; the update relays to A over the in-memory transport and
    // drives A's DOM.
    titleB.set('from-peer-b')

    expect(container.querySelector('#a-title')?.textContent).toBe('from-peer-b')
  })
})
