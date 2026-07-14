/**
 * Real-Chromium — `waitFor` / `waitForElementToBeRemoved` (re-exported from
 * @testing-library/dom) driven by Pyreon's reactivity. waitFor polls the
 * callback (real timers) until it stops throwing OR the timeout elapses, and
 * also re-runs on DOM mutations — so a signal write that patches the DOM is
 * observed. This locks the three contracts a Testing-Library user relies on:
 * resolve-on-pass, REJECT-on-timeout, and element-removal.
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, render, screen, waitFor, waitForElementToBeRemoved } from '../index'

describe('@pyreon/testing — waitFor (real browser)', () => {
  it('resolves once a deferred signal-driven DOM change lands', async () => {
    const status = signal('loading')
    render(<div data-testid="s">{() => status()}</div>)
    setTimeout(() => status.set('done'), 30)
    await waitFor(() => expect(screen.getByTestId('s').textContent).toBe('done'))
    expect(screen.getByTestId('s').textContent).toBe('done')
    cleanup()
  })

  it('REJECTS when the callback never stops throwing before the timeout', async () => {
    render(<div data-testid="s">stays</div>)
    // The callback can never pass — waitFor must reject after ~timeout, not hang.
    await expect(
      waitFor(() => expect(screen.getByTestId('s').textContent).toBe('never'), {
        timeout: 120,
        interval: 20,
      }),
    ).rejects.toThrow()
    cleanup()
  })

  it('waitForElementToBeRemoved resolves after a Show-gated element unmounts', async () => {
    const visible = signal(true)
    // Reactive accessor child — flips the subtree in/out on the signal.
    render(<div>{() => (visible() ? <span data-testid="spinner">…</span> : null)}</div>)
    const spinner = screen.getByTestId('spinner')
    setTimeout(() => visible.set(false), 30)
    await waitForElementToBeRemoved(spinner)
    expect(screen.queryByTestId('spinner')).toBeNull()
    cleanup()
  })
})
