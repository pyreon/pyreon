import { mount } from '@pyreon/runtime-dom'
import type { VNodeChild } from '@pyreon/core'

export interface MountInBrowserResult {
  container: HTMLElement
  unmount: () => void
}

/**
 * Mount a VNode into a fresh container appended to document.body.
 * Returns the container and an unmount fn that also removes the container.
 *
 * Every browser test should call this (not `mount` directly) so tests are
 * isolated — no shared root, no leftover listeners between runs.
 */
export const mountInBrowser = (vnode: VNodeChild): MountInBrowserResult => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const dispose = mount(vnode, container)
  return {
    container,
    unmount: () => {
      dispose()
      container.remove()
    },
  }
}

/**
 * Flush pending microtasks + a rAF tick. Useful after a signal write when
 * the test asserts on DOM state that the reactive effect will apply.
 */
export const flush = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(() => {
      requestAnimationFrame(() => resolve())
    })
  })
