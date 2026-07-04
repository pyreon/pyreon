/**
 * Real-Chromium — fireEvent must dispatch BUBBLING events so Pyreon's event
 * delegation (one listener per event on the mount container; per-element
 * `__ev_*` handlers invoked by a root walk) actually fires the handler.
 *
 * The bisect target: a non-bubbling dispatch leaves the delegated handler
 * silently un-invoked. `fireEvent.click` sets `bubbles: true`; a control
 * that dispatches a non-bubbling event proves the delegation contract.
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, fireEvent, render, screen, waitFor } from '../index'

describe('@pyreon/testing — fireEvent through delegation (real browser)', () => {
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
    await waitFor(() => {
      if (btn.textContent !== 'count: 1') throw new Error('not yet')
    })
    expect(btn.textContent).toBe('count: 1')
    cleanup()
  })

  it('CONTRACT: a non-bubbling event does NOT reach the delegation root', () => {
    // Documents WHY fireEvent forces bubbles:true. A hand-dispatched
    // non-bubbling click never walks up to the container listener, so the
    // delegated handler is not invoked — proving fireEvent's bubbling default
    // is load-bearing, not incidental.
    function Btn() {
      const clicked = signal(false)
      return (
        <button data-testid="b" onClick={() => clicked.set(true)}>
          {() => (clicked() ? 'clicked' : 'idle')}
        </button>
      )
    }
    render(<Btn />)
    const b = screen.getByTestId('b')
    b.dispatchEvent(new MouseEvent('click', { bubbles: false }))
    expect(b.textContent).toBe('idle') // delegated handler NOT fired
    fireEvent.click(b) // bubbling → fires
    expect(b.textContent).toBe('clicked')
    cleanup()
  })

  it('fireEvent.input updates the value before dispatch + fires onInput', async () => {
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
    await waitFor(() => {
      if (screen.getByTestId('echo').textContent !== 'hello') throw new Error('not yet')
    })
    expect(screen.getByTestId('echo').textContent).toBe('hello')
    cleanup()
  })
})
