/**
 * Real-Chromium — @testing-library/dom's `fireEvent` fires Pyreon's DELEGATED
 * handlers. This is the integration risk worth locking: Pyreon delegates ~all
 * events (one listener per event on the mount container; per-element `__ev_*`
 * handlers invoked by a root walk), so a dispatched event must BUBBLE to the
 * root. TL's fireEvent bubbles by default, so it works — this proves it end to
 * end rather than assuming it.
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, fireEvent, render, screen, waitFor } from '../index'

describe('@pyreon/testing — fireEvent (TL) through Pyreon delegation (real browser)', () => {
  it('fireEvent.click fires a delegated onClick handler', async () => {
    function Counter() {
      const count = signal(0)
      return (
        <button data-testid="btn" onClick={() => count.set(count() + 1)}>
          {() => `count: ${count()}`}
        </button>
      )
    }
    render(<Counter />)
    const btn = screen.getByTestId('btn')
    fireEvent.click(btn)
    await waitFor(() => expect(btn.textContent).toBe('count: 1'))
    cleanup()
  })

  it('fireEvent.input updates the value + fires onInput through delegation', async () => {
    function Field() {
      const value = signal('')
      return (
        <div>
          <input data-testid="in" onInput={(e) => value.set((e.target as HTMLInputElement).value)} />
          <span data-testid="echo">{() => value()}</span>
        </div>
      )
    }
    render(<Field />)
    const input = screen.getByTestId('in') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'hello' } })
    await waitFor(() => expect(screen.getByTestId('echo').textContent).toBe('hello'))
    cleanup()
  })
})
