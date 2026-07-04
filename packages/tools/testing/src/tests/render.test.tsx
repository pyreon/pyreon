/**
 * Node (happy-dom) tests for render / screen / cleanup — structural
 * assertions that don't need a real browser. Uses real `h()` from
 * @pyreon/core (not mock vnodes) per test-environment-parity.
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

  it('bound getByText matches an element by its own text', () => {
    const { getByText } = render(
      <div>
        <span>outer</span>
        <button>Click me</button>
      </div>,
    )
    expect(getByText('Click me').tagName).toBe('BUTTON')
  })

  it('getByTestId finds by data-testid; queryByTestId returns null when absent', () => {
    const { getByTestId, queryByTestId } = render(<p data-testid="para">x</p>)
    expect(getByTestId('para').tagName).toBe('P')
    expect(queryByTestId('missing')).toBeNull()
  })

  it('getByText throws a helpful error when nothing matches', () => {
    render(<div>present</div>)
    expect(() => screen.getByText('absent')).toThrow(/Unable to find an element by text/)
  })

  it('getByText throws on multiple matches, pointing at getAllByText', () => {
    render(
      <ul>
        <li>dup</li>
        <li>dup</li>
      </ul>,
    )
    expect(() => screen.getByText('dup')).toThrow(/multiple elements by text/)
    expect(screen.getAllByText('dup')).toHaveLength(2)
  })

  it('screen queries the live document; reactive text updates are visible after a write', async () => {
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
