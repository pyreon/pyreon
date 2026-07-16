/**
 * `@pyreon/testing/toast` — happy-dom suite.
 *
 * Store-level matchers: work headless (no <Toaster> mounted) — the DOM-level
 * Toaster-portal path is covered in the real-Chromium browser twin.
 */
import { h } from '@pyreon/core'
import { toast } from '@pyreon/toast'
import { afterEach, describe, expect, it } from 'vitest'
import { clearToasts, expectToast, findToast, getToasts } from '../toast'

afterEach(() => {
  clearToasts()
})

describe('expectToast', () => {
  it('matches by substring and RegExp on message', () => {
    toast.success('Profile saved')
    const bySub = expectToast('saved')
    const byRe = expectToast(/profile/i)
    expect(bySub.id).toBe(byRe.id)
    expect(bySub.type).toBe('success')
  })

  it('matches the description too', () => {
    toast('Heads up', { description: 'Quota almost reached' })
    expect(expectToast(/quota/i).message).toBe('Heads up')
  })

  it('matches any toast when called without a matcher', () => {
    toast.info('anything')
    expect(expectToast().message).toBe('anything')
  })

  it('filters by type', () => {
    toast.error('Save failed')
    toast.success('Save ok')
    expect(expectToast(/save/i, { type: 'success' }).message).toBe('Save ok')
    expect(() => expectToast(/ok/, { type: 'error' })).toThrow(/of type "error"/)
  })

  it('excludes soft-dismissed (exiting) toasts unless opted in', () => {
    const id = toast('Going away')
    toast.dismiss(id) // soft — state flips to 'exiting'
    expect(() => expectToast(/going/i)).toThrow(/\[Pyreon\] expectToast/)
    expect(expectToast(/going/i, { includeExiting: true }).state).toBe('exiting')
  })

  it('throws a [Pyreon]-prefixed error listing current toasts', () => {
    toast.error('Kaboom')
    expect(() => expectToast(/absent/)).toThrow(/no toast matching \/absent\/ — current toasts: \[error\] Kaboom/)
  })

  it('reports (none) when the store is empty', () => {
    expect(() => expectToast('x')).toThrow(/current toasts: \(none\)/)
  })

  it('never string-matches a VNode message (labelled in the error listing)', () => {
    toast(h('b', null, 'rich'))
    expect(() => expectToast('rich')).toThrow(/<VNode message>/)
  })
})

describe('findToast', () => {
  it('waits for a toast raised asynchronously', async () => {
    setTimeout(() => toast.success('Saved later'), 10)
    const found = await findToast(/later/)
    expect(found.type).toBe('success')
  })

  it('rejects (waitFor timeout) when nothing ever matches', async () => {
    await expect(findToast(/never/, {})).rejects.toThrow(/\[Pyreon\] expectToast/)
  }, 10_000)
})

describe('getToasts / clearToasts', () => {
  it('getToasts snapshots the store with the same filters', () => {
    toast('a')
    toast.error('b')
    expect(getToasts()).toHaveLength(2)
    expect(getToasts({ type: 'error' })).toHaveLength(1)
    const id = toast('c')
    toast.dismiss(id)
    expect(getToasts()).toHaveLength(2)
    expect(getToasts({ includeExiting: true })).toHaveLength(3)
  })

  it('clearToasts hard-resets the store (timers included)', () => {
    toast('a', { duration: 60_000 })
    toast('b')
    clearToasts()
    expect(getToasts()).toHaveLength(0)
  })
})
