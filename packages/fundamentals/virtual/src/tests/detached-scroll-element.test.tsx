// A scroll element that is DETACHED when the component mounts (Pyreon builds a template into an inert fragment and
// inserts it after `onMount` has run — the routed-page case) has `ownerDocument.defaultView === null`, so TanStack
// attaches no observers and the list renders zero rows. The hook re-attaches once the element is in the document.
// The real-Chromium proof (an actual inert document, real layout) is in `virtual.browser.test.tsx`; these cover the
// scheduling branches deterministically.
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useVirtualizer } from '../index'

let frames: FrameRequestCallback[] = []
const runFrame = (): void => {
  const queued = frames
  frames = []
  for (const cb of queued) cb(0)
}

beforeEach(() => {
  frames = []
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb)
    return frames.length
  })
})
afterEach(() => vi.restoreAllMocks())

function mountHook(el: HTMLElement) {
  let virtual!: ReturnType<typeof useVirtualizer<HTMLElement, HTMLElement>>
  const host = document.createElement('div')
  document.body.appendChild(host)
  const Comp = () => {
    virtual = useVirtualizer<HTMLElement, HTMLElement>(() => ({
      count: 100,
      getScrollElement: () => el,
      estimateSize: () => 20,
    }))
    return null
  }
  const unmount = mount(<Comp />, host)
  const willUpdate = vi.spyOn(virtual.instance, '_willUpdate')
  return {
    virtual,
    willUpdate,
    unmount: () => {
      unmount()
      host.remove()
    },
  }
}

const flushMicrotasks = (): Promise<void> => new Promise((r) => queueMicrotask(r))

describe('a scroll element detached at mount', () => {
  it('re-attaches once it is connected, without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('div')
    const { willUpdate, unmount } = mountHook(el)
    await flushMicrotasks() // still detached -> schedules a frame
    expect(frames.length).toBe(1)
    expect(willUpdate).not.toHaveBeenCalled()
    document.body.appendChild(el)
    runFrame()
    expect(willUpdate).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('still detached'))).toBe(false)
    el.remove()
    unmount()
  })

  it('keeps waiting frame by frame while detached, then warns once and stops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('div')
    const { unmount } = mountHook(el)
    await flushMicrotasks()
    for (let i = 0; i < 70; i++) runFrame()
    expect(frames.length).toBe(0)
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('still detached')).length).toBe(1)
    unmount()
  })

  it('stops waiting when the component unmounts first', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const el = document.createElement('div')
    const { willUpdate, unmount } = mountHook(el)
    await flushMicrotasks()
    expect(frames.length).toBe(1)
    unmount()
    document.body.appendChild(el)
    runFrame()
    expect(willUpdate).not.toHaveBeenCalled()
    expect(warn.mock.calls.some((c) => String(c[0]).includes('still detached'))).toBe(false)
    el.remove()
  })

  it('does not schedule anything for an element that is already connected', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { unmount } = mountHook(el)
    await flushMicrotasks()
    expect(frames.length).toBe(0)
    el.remove()
    unmount()
  })
})
