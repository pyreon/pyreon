/**
 * jest-dom-style matchers — registered via `@pyreon/testing/matchers`.
 * Node (happy-dom) is sufficient: these assert on element structure/attributes,
 * not real layout.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '../index'
import { pyreonDomMatchers } from '../matchers'

expect.extend(pyreonDomMatchers)

// Local type augmentation so the custom matchers typecheck in this file.
interface DomMatchers<R = unknown> {
  toBeInTheDocument(): R
  toHaveTextContent(text: string | RegExp): R
  toHaveAttribute(name: string, value?: string): R
  toHaveClass(...classes: string[]): R
  toBeDisabled(): R
  toBeChecked(): R
  toHaveValue(value: string | number): R
  toBeVisible(): R
  toBeEmptyDOMElement(): R
  toContainElement(child: Element | null): R
  toHaveFocus(): R
}
declare module 'vitest' {
  interface Assertion<T = any> extends DomMatchers<T> {}
  interface AsymmetricMatchersContaining extends DomMatchers {}
}

afterEach(cleanup)

describe('pyreonDomMatchers', () => {
  it('toBeInTheDocument / toHaveTextContent / toHaveAttribute', () => {
    render(
      <a href="/x" data-testid="lnk" class="btn primary">
        Go home
      </a>,
    )
    const link = screen.getByTestId('lnk')
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent('Go home')
    expect(link).toHaveTextContent(/go/i)
    expect(link).toHaveAttribute('href')
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
    const parent = screen.getByTestId('parent')
    expect(parent).toContainElement(screen.getByTestId('child'))
    expect(screen.getByTestId('child')).not.toBeEmptyDOMElement()
  })
})
