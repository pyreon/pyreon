/**
 * jest-dom matchers via `@pyreon/testing/matchers` (re-exports
 * @testing-library/jest-dom). Node (happy-dom) is sufficient — these assert on
 * element structure/attributes against Pyreon-rendered DOM.
 */
import { afterEach, describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '../index'

afterEach(cleanup)

describe('@testing-library/jest-dom matchers against Pyreon-rendered DOM', () => {
  it('toBeInTheDocument / toHaveTextContent / toHaveAttribute / toHaveClass', () => {
    render(
      <a href="/x" data-testid="lnk" class="btn primary">
        Go home
      </a>,
    )
    const link = screen.getByTestId('lnk')
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent('Go home')
    expect(link).toHaveTextContent(/go/i)
    expect(link).toHaveAttribute('href', '/x')
    expect(link).toHaveClass('btn', 'primary')
  })

  it('toBeDisabled / toBeChecked / toHaveValue', () => {
    render(
      <form>
        <button disabled data-testid="b">x</button>
        <input type="checkbox" checked data-testid="c" />
        <input type="text" value="hi" data-testid="t" />
      </form>,
    )
    expect(screen.getByTestId('b')).toBeDisabled()
    expect(screen.getByTestId('c')).toBeChecked()
    expect(screen.getByTestId('t')).toHaveValue('hi')
  })

  it('negations work (.not)', () => {
    render(<button data-testid="e">ok</button>)
    expect(screen.getByTestId('e')).not.toBeDisabled()
    expect(screen.getByTestId('e')).not.toHaveTextContent('nope')
  })

  it('toContainElement / toBeEmptyDOMElement', () => {
    render(
      <div data-testid="parent">
        <span data-testid="child">c</span>
      </div>,
    )
    expect(screen.getByTestId('parent')).toContainElement(screen.getByTestId('child'))
    expect(screen.getByTestId('child')).not.toBeEmptyDOMElement()
  })
})
