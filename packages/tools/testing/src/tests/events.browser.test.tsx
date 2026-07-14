/**
 * Real-Chromium — @testing-library/dom's `fireEvent` fires Pyreon's handlers
 * across BOTH halves of Pyreon's event model:
 *
 *  - DELEGATED events (click / input / change / keydown / submit / pointerdown /
 *    focusin, …): Pyreon installs ONE listener per event on the mount container
 *    and invokes per-element `__ev_*` expandos via a root walk, so a dispatched
 *    event MUST BUBBLE to the container. TL's fireEvent bubbles by default.
 *  - NON-delegated events (focus / blur / mouseenter / mouseleave): Pyreon
 *    attaches a real `addEventListener` directly on the element, so TL's
 *    fireEvent (which dispatches on the target element) reaches them directly.
 *
 * This locks the integration end-to-end in a real browser rather than assuming
 * it — happy-dom can't exercise real dispatch through delegation.
 */
import { describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '../index'

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

  it('fires keyDown / change / submit / pointerDown / dblClick — all delegated (bubble to root)', async () => {
    const log = signal<string[]>([])
    const push = (name: string) => log.set([...log(), name])
    function Widget() {
      return (
        <form data-testid="form" onSubmit={(e) => (e.preventDefault(), push('submit'))}>
          <input
            data-testid="in"
            onKeyDown={() => push('keydown')}
            onChange={() => push('change')}
            onPointerDown={() => push('pointerdown')}
          />
          <button type="button" data-testid="dbl" onDblClick={() => push('dblclick')}>
            x
          </button>
        </form>
      )
    }
    render(<Widget />)
    const input = screen.getByTestId('in') as HTMLInputElement
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'v' } })
    fireEvent.pointerDown(input)
    fireEvent.dblClick(screen.getByTestId('dbl'))
    fireEvent.submit(screen.getByTestId('form'))
    await waitFor(() => expect(log()).toEqual(['keydown', 'change', 'pointerdown', 'dblclick', 'submit']))
    cleanup()
  })

  it('fires NON-delegated focus / blur / mouseEnter / mouseLeave via the direct-listener path', async () => {
    const log = signal<string[]>([])
    const push = (name: string) => log.set([...log(), name])
    function Widget() {
      return (
        <input
          data-testid="in"
          onFocus={() => push('focus')}
          onBlur={() => push('blur')}
          onMouseEnter={() => push('mouseenter')}
          onMouseLeave={() => push('mouseleave')}
        />
      )
    }
    render(<Widget />)
    const input = screen.getByTestId('in') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.mouseEnter(input)
    fireEvent.mouseLeave(input)
    fireEvent.blur(input)
    // focus/blur/mouseenter/mouseleave do NOT bubble — Pyreon wires them with a
    // direct addEventListener, so TL's element-targeted dispatch reaches them.
    await waitFor(() => expect(log()).toEqual(['focus', 'mouseenter', 'mouseleave', 'blur']))
    cleanup()
  })

  it('fires the bubbling focusIn (delegated) — the onFocusIn counterpart', async () => {
    const seen = signal(false)
    render(
      <div>
        <input data-testid="in" onFocusIn={() => seen.set(true)} />
      </div>,
    )
    fireEvent.focusIn(screen.getByTestId('in'))
    await waitFor(() => expect(seen()).toBe(true))
    cleanup()
  })

  it('returns false when a handler calls preventDefault on a cancelable event, true otherwise', () => {
    render(
      <div>
        <a data-testid="cancel" href="/x" onClick={(e) => e.preventDefault()}>
          cancel
        </a>
        <button data-testid="ok" type="button" onClick={() => {}}>
          ok
        </button>
      </div>,
    )
    // TL's fireEvent returns el.dispatchEvent(...) — false when preventDefault
    // was called on a cancelable event, true otherwise.
    expect(fireEvent.click(screen.getByTestId('cancel'))).toBe(false)
    expect(fireEvent.click(screen.getByTestId('ok'))).toBe(true)
    cleanup()
  })

  it('the generic fireEvent(el, createEvent...) form dispatches a custom-built event', async () => {
    const seen = signal('')
    render(<button data-testid="b" type="button" onClick={(e) => seen.set(e.type)} />)
    const btn = screen.getByTestId('b')
    const event = createEvent.click(btn)
    fireEvent(btn, event)
    await waitFor(() => expect(seen()).toBe('click'))
    cleanup()
  })

  it('control: with NO dispatch the delegated handler never fires', async () => {
    // Proves the assertions above are load-bearing — the handler only fires
    // because fireEvent dispatched, not incidentally on mount.
    const count = signal(0)
    render(<button data-testid="c" type="button" onClick={() => count.set(count() + 1)} />)
    await new Promise((r) => requestAnimationFrame(() => r(undefined)))
    expect(count()).toBe(0)
    cleanup()
  })
})
