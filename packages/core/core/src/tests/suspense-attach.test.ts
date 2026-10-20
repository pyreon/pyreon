// @vitest-environment happy-dom
import { signal } from '@pyreon/reactivity'
import type { SuspenseBoundary } from '../suspense-context'
import { SUSPENSE_ATTACH } from '../suspense-context'
import { attachSuspenseBoundary } from '../suspense-attach'
import { Suspense } from '../suspense'
import type { VNodeChild } from '../types'

// A stand-in renderer: mounts a string child as a text node before `anchor`
// and returns a remover. The handler takes `mount` as a parameter precisely
// so it needs no renderer import — so the core suite can drive it directly.
const textMount = (child: VNodeChild, parent: Node, anchor: Node | null) => {
  const t = document.createTextNode(String(child))
  parent.insertBefore(t, anchor)
  return () => t.remove()
}

function setup() {
  const pending = signal(0)
  const boundary: SuspenseBoundary = {
    register: () => {},
    pending: () => pending(),
    fallback: () => 'loading',
  }
  const host = document.createElement('div')
  const start = document.createComment('suspense')
  const end = document.createComment('/suspense')
  host.append(start, document.createTextNode('content'), end)
  const detach = attachSuspenseBoundary(boundary, start, end, textMount)
  return { pending, host, start, end, detach }
}

describe('attachSuspenseBoundary', () => {
  it('leaves the content in place while nothing is pending', () => {
    const { host } = setup()
    expect(host.textContent).toBe('content')
  })

  it('moves the content off-screen and shows the fallback while pending, then restores the SAME nodes', () => {
    const { pending, host } = setup()
    const contentNode = host.childNodes[1]
    pending.set(1)
    expect(host.textContent).toBe('loading')
    expect(contentNode?.parentNode).not.toBe(host)
    pending.set(0)
    expect(host.textContent).toBe('content')
    // Restored, not rebuilt: identity survives the round trip.
    expect(host.childNodes[1]).toBe(contentNode)
  })

  it('does not re-hide when pending goes from 1 to 2', () => {
    const { pending, host } = setup()
    pending.set(1)
    pending.set(2)
    expect(host.textContent).toBe('loading')
    pending.set(0)
    expect(host.textContent).toBe('content')
  })

  it('does nothing while the boundary is detached', () => {
    const { pending, host, end } = setup()
    host.removeChild(end)
    pending.set(1)
    expect(host.textContent).toBe('content')
  })

  it('dispose removes the fallback and both delimiters and stops reacting', () => {
    const { pending, host, detach } = setup()
    pending.set(1)
    detach()
    expect(host.textContent).toBe('')
    expect(host.childNodes.length).toBe(0)
    pending.set(0)
    expect(host.childNodes.length).toBe(0)
  })

  it('dispose with nothing pending removes only the delimiters', () => {
    const { host, detach } = setup()
    detach()
    expect(host.textContent).toBe('content')
    expect(host.childNodes.length).toBe(1)
  })
})

describe('<Suspense> carries its DOM handler', () => {
  it('under the shared registry symbol, so a renderer can find it without importing it', () => {
    expect((Suspense as unknown as Record<symbol, unknown>)[SUSPENSE_ATTACH]).toBe(attachSuspenseBoundary)
    expect(SUSPENSE_ATTACH).toBe(Symbol.for('pyreon:suspense-attach'))
  })
})
