/**
 * Real-Chromium regression lock for the Toaster RENDER layer.
 *
 * The store (`toast.ts`) is exhaustively unit-tested in node, but `toaster.tsx`
 * was coverage-excluded with ZERO browser test — which hid a severe bug: the
 * `<For by={id}>` rows read `message`/`type`/`state` STATICALLY off the snapshot
 * the For callback receives (W22), so `toast.update`, `toast.promise`
 * transitions, AND the `entering→visible` promotion never reflected in the DOM
 * (toasts were stuck `--entering` = opacity:0 = invisible). Each test here
 * mutates the store AFTER mount and asserts the LIVE DOM changes — the exact
 * thing the static-read code could not do.
 *
 * Bisect-verified: reverting `toaster.tsx`/`toast.ts` to the snapshot-read form
 * fails A/B/C/D (entering class never removed; update/promise text never
 * changes). See the PR description.
 */
import { h } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _reset, toast } from '../toast'
import { Toaster } from '../toaster'

const nextFrame = () =>
  new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()))
  })

let container: HTMLDivElement
let dispose: () => void

beforeEach(() => {
  _reset()
  container = document.createElement('div')
  document.body.appendChild(container)
  dispose = mount(h(Toaster, {}), container)
})

afterEach(() => {
  dispose()
  container.remove()
  document.body.innerHTML = ''
  _reset()
})

const msgEl = () => document.querySelector('.pyreon-toast__message')
const toastEl = () => document.querySelector('.pyreon-toast') as HTMLElement | null

describe('Toaster — render + a11y smoke', () => {
  it('renders the message into the DOM with role="alert"', async () => {
    toast('Saved!', { duration: 0 })
    await nextFrame()
    expect(msgEl()?.textContent).toContain('Saved!')
    expect(toastEl()?.getAttribute('role')).toBe('alert')
  })

  it('container is a labeled live region', async () => {
    toast('hi', { duration: 0 })
    await nextFrame()
    const region = document.querySelector('.pyreon-toast-container')
    expect(region?.getAttribute('aria-label')).toBe('Notifications')
  })
})

describe('Toaster — reactivity (regression: rows reflect store mutations)', () => {
  it('A) entering → visible: removes the --entering class after a frame', async () => {
    toast('Hello', { duration: 0 })
    await nextFrame()
    // The row must react to the entering→visible state promotion. Static-read
    // code leaves --entering forever (opacity:0 = invisible toast).
    expect(toastEl()?.classList.contains('pyreon-toast--entering')).toBe(false)
  })

  it('B) toast.update(message): the DOM text changes', async () => {
    const id = toast.loading('Loading...')
    await nextFrame()
    expect(msgEl()?.textContent).toContain('Loading...')

    toast.update(id, { message: 'Done!' })
    await nextFrame()
    expect(msgEl()?.textContent).toContain('Done!')
  })

  it('C) toast.update(type): the type className changes', async () => {
    const id = toast.loading('Working...')
    await nextFrame()
    expect(toastEl()?.classList.contains('pyreon-toast--info')).toBe(true)

    toast.update(id, { type: 'error', message: 'Failed' })
    await nextFrame()
    expect(toastEl()?.classList.contains('pyreon-toast--error')).toBe(true)
    expect(msgEl()?.textContent).toContain('Failed')
  })

  it('D) toast.promise: loading text transitions to the resolved message', async () => {
    // A DEFERRED promise — `Promise.resolve()` settles inside the first frame,
    // so the loading phase wouldn't be observable. We resolve it manually
    // AFTER asserting the loading text.
    let resolve!: (v: string) => void
    const p = new Promise<string>((r) => {
      resolve = r
    })
    toast.promise(p, { loading: 'Saving...', success: 'Saved!', error: 'Failed' })
    await nextFrame()
    expect(msgEl()?.textContent).toContain('Saving...')

    resolve('ok')
    await p
    await nextFrame()
    expect(msgEl()?.textContent).toContain('Saved!')
    expect(toastEl()?.classList.contains('pyreon-toast--success')).toBe(true)
  })
})

describe('Toaster — dismiss interaction', () => {
  it('clicking the × removes the toast from the DOM', async () => {
    toast('Bye', { duration: 0 })
    await nextFrame()
    expect(toastEl()).not.toBeNull()

    const dismissBtn = document.querySelector('.pyreon-toast__dismiss') as HTMLButtonElement
    expect(dismissBtn).not.toBeNull()
    dismissBtn.click()
    await nextFrame()
    expect(toastEl()).toBeNull()
  })

  it('action button is rendered once and fires its handler', async () => {
    let clicked = 0
    toast('Undo?', { duration: 0, action: { label: 'Undo', onClick: () => clicked++ } })
    await nextFrame()
    const btns = document.querySelectorAll('.pyreon-toast__action')
    expect(btns.length).toBe(1)
    ;(btns[0] as HTMLButtonElement).click()
    expect(clicked).toBe(1)
  })
})
