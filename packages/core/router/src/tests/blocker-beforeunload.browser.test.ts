/**
 * `useBlocker` and tab close / reload in real Chromium (#4358): the router's
 * `beforeunload` listener cancels the event (which is what makes Chromium show
 * "Leave site?") only when a blocker says to block. A real `BeforeUnloadEvent`
 * is dispatched; the native prompt itself cannot be driven from a test.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { afterEach, describe, expect, it } from 'vitest'
import { createRouter, RouterProvider, useBlocker } from '../index'
import { setActiveRouter } from '../router'

const prompts = (): boolean => {
  const e = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
  window.dispatchEvent(e)
  return e.defaultPrevented
}

afterEach(() => setActiveRouter(null))

describe('useBlocker beforeunload (real Chromium)', () => {
  it('prompts only while the blocker blocks', () => {
    const router = createRouter({ routes: [{ path: '/', component: () => null }], url: '/' })
    const dirty = signal(false)
    const Editor = () => {
      useBlocker(() => dirty())
      return h('textarea', null)
    }
    const { unmount } = mountInBrowser(h(RouterProvider, { router }, h(Editor, null)))
    expect(prompts()).toBe(false)
    dirty.set(true)
    expect(prompts()).toBe(true)
    unmount()
    expect(prompts()).toBe(false)
    router.destroy()
  })
})
