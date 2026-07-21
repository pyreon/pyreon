/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium lock for ModalBase's dev-only nameless-dialog warning (B8).
 *
 * A dialog with neither aria-label nor aria-labelledby is announced as just
 * "dialog" — the WAI-ARIA APG dialog-modal pattern requires an accessible
 * name. ModalBase now warns ONCE PER INSTANCE (not per open) when it OPENS
 * without one. The presence check uses the `in` operator against `rest`, so
 * getter-shaped reactive props are never fired by the check.
 *
 * Bisect (recorded in the PR): remove the warn block from ModalBase's
 * open-watch → the "warns once" specs fail with `expected 0 to be 1` /
 * `expected [] to contain the [Pyreon] message`.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { ModalBase } from './ModalBase'

const MSG =
  '[Pyreon] <ModalBase> rendered without an accessible name — pass aria-label or aria-labelledby (WAI-ARIA dialog requires one).'

function mountModal(extra: Record<string, unknown> = {}, open?: () => boolean) {
  // MUTATE the caller's props object — a `{ ...extra }` spread would FIRE a
  // getter-shaped `aria-label` and collapse it to a static value.
  extra.children = h('button', { 'data-testid': 'ok' }, 'OK')
  Object.defineProperty(extra, 'open', {
    get: open ?? (() => true),
    enumerable: true,
    configurable: true,
  })
  return mountInBrowser(h(ModalBase as never, extra))
}

describe('ModalBase — nameless-dialog dev warning', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns exactly once per instance when opened without an accessible name (even across re-opens)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const open = signal(true)
    const { unmount } = mountModal({}, () => open())
    await flush()
    const count = () => warn.mock.calls.filter((c) => c[0] === MSG).length
    expect(count()).toBe(1)
    // Re-open: still once per INSTANCE, not per open.
    open.set(false)
    await flush()
    open.set(true)
    await flush()
    expect(count()).toBe(1)
    unmount()
  })

  it('does NOT warn when aria-label is present', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unmount } = mountModal({ 'aria-label': 'Settings' })
    await flush()
    expect(warn.mock.calls.filter((c) => c[0] === MSG).length).toBe(0)
    unmount()
  })

  it('does NOT warn when aria-labelledby is present', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { unmount } = mountModal({ 'aria-labelledby': 'modal-title' })
    await flush()
    expect(warn.mock.calls.filter((c) => c[0] === MSG).length).toBe(0)
    unmount()
  })

  it('recognizes a getter-shaped reactive aria-label (no warn, label renders)', async () => {
    // The warn check uses the `in` operator, which sees the key without firing
    // the getter. (The getter DOES legitimately fire later when the DOM applies
    // the attribute, so "the check fired zero getters" is not observable from
    // outside — the honest assertion is: getter-shaped name ⇒ no warn + the
    // attribute reaches the DOM.)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const label = signal('Settings')
    const props: Record<string, unknown> = {}
    Object.defineProperty(props, 'aria-label', {
      get: () => label(),
      enumerable: true,
      configurable: true,
    })
    const { unmount } = mountModal(props)
    await flush()
    expect(warn.mock.calls.filter((c) => c[0] === MSG).length).toBe(0)
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Settings')
    unmount()
  })
})
