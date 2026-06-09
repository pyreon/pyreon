import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { REMOTE_ORIGIN } from './crdt/types'
import { createYjsDoc } from './crdt/yjs-adapter'
import { connectYDocs } from './crdt/yjs-transport'
import { syncedSignal } from './synced-signal'

// Real-Chromium proof of the core thesis: a remote CRDT op drives a
// FINE-GRAINED DOM update — the bound region updates in place and the component
// does NOT re-render. (This is the honest, general guarantee; the literal
// `_bindText` "same text node, .data patched" form needs the Pyreon COMPILER,
// which the @vitest/browser harness doesn't run — that's the Playwright
// two-tab + compiled-app follow-up. Here the reactive child goes through the
// runtime's mountReactive path, which is still fine-grained, not a re-render.)

describe('synced signal → real DOM (Chromium)', () => {
  const cleanups: Array<() => void> = []
  afterEach(() => {
    for (const c of cleanups.splice(0)) c()
  })

  it('a remote op updates the bound DOM region exactly once, with no component re-render', async () => {
    const doc = createYjsDoc()
    const title = syncedSignal({ doc, key: 'title', initial: 'v1' })

    let bodyRuns = 0
    const View = () => {
      bodyRuns++
      return h('span', { id: 'title' }, () => title())
    }
    const { container, unmount } = mountInBrowser(h(View, null))
    cleanups.push(unmount, () => title.dispose())

    const span1 = container.querySelector('#title')
    expect(span1?.textContent).toBe('v1')
    expect(bodyRuns).toBe(1)

    // Count fine-grained updates on the bound signal (env-independent — does not
    // rely on the dev perf-counter being present in the browser bundle).
    let updates = 0
    const off = title.subscribe(() => updates++)
    cleanups.push(off)

    // Simulate an inbound remote change — exactly what the transport does on
    // receiving a peer's update: a REMOTE-origin transaction on the doc.
    doc.transact(() => doc.getMap('pyreon').set('title', 'v2'), REMOTE_ORIGIN)
    await flush()

    const span2 = container.querySelector('#title')
    expect(span2).toBe(span1) // SAME element — the component was not re-rendered
    expect(span2?.textContent).toBe('v2') // the bound region updated in place
    expect(updates).toBe(1) // exactly one fine-grained update
    expect(bodyRuns).toBe(1) // component body still ran exactly once
  })

  it('a peer edit propagates through the transport to the DOM (two docs, one page)', async () => {
    const a = createYjsDoc()
    const b = createYjsDoc()
    const link = connectYDocs(a, b)
    cleanups.push(() => link.disconnect())

    const titleA = syncedSignal({ doc: a, key: 'title', initial: '' })
    const titleB = syncedSignal({ doc: b, key: 'title', initial: '' })
    cleanups.push(() => titleA.dispose(), () => titleB.dispose())

    const { container, unmount } = mountInBrowser(
      h('span', { id: 'a-title' }, () => titleA()),
    )
    cleanups.push(unmount)

    // Peer B edits; the update relays to A over the in-memory transport and
    // drives A's DOM.
    titleB.set('from-peer-b')
    await flush()

    expect(container.querySelector('#a-title')?.textContent).toBe('from-peer-b')
  })
})
