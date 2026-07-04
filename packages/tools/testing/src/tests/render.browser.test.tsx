/**
 * Real-Chromium smoke — @pyreon/testing is a browser package (interaction +
 * layout need a real browser; happy-dom has neither). Proves render/screen
 * work end-to-end in Chromium with a real signal-driven update and a real
 * delegated click handler (the shape happy-dom can't fully exercise).
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, render, screen } from '../index'

describe('@pyreon/testing — render (real browser)', () => {
  it('renders + reflects a signal-driven click through the delegation root', async () => {
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
    expect(btn.textContent).toBe('count: 0')
    btn.click()
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    expect(btn.textContent).toBe('count: 1')
    cleanup()
    expect(screen.queryByTestId('btn')).toBeNull()
  })
})
