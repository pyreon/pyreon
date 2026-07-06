/**
 * Node (happy-dom) tests for render + cleanup + the re-exported
 * @testing-library/dom query surface. Real `h()` from @pyreon/core (not mock
 * vnodes) per test-environment-parity.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { signal } from '@pyreon/reactivity'
import { cleanup, render, screen } from '../index'

afterEach(cleanup)

describe('render', () => {
  it('mounts into an isolated container appended to document.body', () => {
    const { container, baseElement } = render(<div data-testid="root">hi</div>)
    expect(baseElement).toBe(document.body)
    expect(container.parentNode).toBe(document.body)
    expect(container.querySelector('[data-testid=root]')?.textContent).toBe('hi')
  })

  it('binds the @testing-library/dom query set to the container', () => {
    const { getByText, getByRole, getByTestId } = render(
      <div>
        <span>outer</span>
        <button>Click me</button>
        <p data-testid="para">x</p>
      </div>,
    )
    expect(getByText('Click me').tagName).toBe('BUTTON')
    expect(getByRole('button')).toBeTruthy() // real ARIA role resolution from TL
    expect(getByTestId('para').tagName).toBe('P')
  })

  it('screen queries the whole document', () => {
    render(<button>Sign in</button>)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText('absent')).toBeNull()
  })

  it('reactive text updates are visible after a signal write', async () => {
    const label = signal('a')
    render(<div data-testid="live">{() => label()}</div>)
    expect(screen.getByTestId('live').textContent).toBe('a')
    label.set('b')
    await Promise.resolve()
    expect(screen.getByTestId('live').textContent).toBe('b')
  })

  it('cleanup unmounts every rendered tree + removes containers', () => {
    render(<div data-testid="one">1</div>)
    render(<div data-testid="two">2</div>)
    expect(document.body.querySelectorAll('[data-testid]')).toHaveLength(2)
    cleanup()
    expect(document.body.querySelectorAll('[data-testid]')).toHaveLength(0)
  })

  it('unmount removes only its own tree', () => {
    const a = render(<div data-testid="a">a</div>)
    render(<div data-testid="b">b</div>)
    a.unmount()
    expect(screen.queryByTestId('a')).toBeNull()
    expect(screen.queryByTestId('b')).not.toBeNull()
  })
})
