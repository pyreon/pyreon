/**
 * Real-Chromium — the jest-dom matcher set against Pyreon-rendered DOM. Some of
 * these are ONLY meaningful in a real browser: `.toBeVisible()` needs real
 * `getComputedStyle`, `.toHaveFocus()` needs a real `document.activeElement` —
 * happy-dom has neither. So this locks that the matchers behave correctly on
 * Pyreon's real DOM output, which the happy-dom `matchers.test.tsx` cannot.
 *
 * NOTE on registration: `@vitest/browser` auto-provides jest-dom-compatible
 * matchers in browser mode (its `expect-element` module) — so no
 * `import '@testing-library/jest-dom/vitest'` is needed here. The
 * `@pyreon/testing/matchers` REGISTRATION path (the one consumers wire into
 * happy-dom/node suites) is exercised by `matchers.test.tsx`; this file
 * exercises the real-browser BEHAVIOR.
 *
 * Every matcher is exercised on the TRUE case (passes) AND the FALSE case
 * (throws). The FALSE-case assertions are load-bearing: a no-op matcher would
 * silently pass the false case, so `expect(() => …).toThrow()` proves each
 * matcher actually discriminates.
 */
import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '../index'

describe('@pyreon/testing — jest-dom matchers (real browser)', () => {
  it('toBeInTheDocument / toHaveTextContent / toHaveAttribute / toHaveClass', () => {
    render(
      <a href="/x" data-testid="lnk" class="btn primary">
        Go home
      </a>,
    )
    const link = screen.getByTestId('lnk')
    const detached = document.createElement('div')

    expect(link).toBeInTheDocument()
    expect(detached).not.toBeInTheDocument()
    expect(() => expect(detached).toBeInTheDocument()).toThrow()

    expect(link).toHaveTextContent('Go home')
    expect(link).toHaveTextContent(/go/i)
    expect(() => expect(link).toHaveTextContent('nope')).toThrow()

    expect(link).toHaveAttribute('href', '/x')
    expect(() => expect(link).toHaveAttribute('href', '/wrong')).toThrow()

    expect(link).toHaveClass('btn', 'primary')
    expect(() => expect(link).toHaveClass('missing')).toThrow()
    cleanup()
  })

  it('toBeVisible — real getComputedStyle', () => {
    render(
      <div>
        <span data-testid="shown">visible</span>
        <span data-testid="hidden" style="display: none">
          hidden
        </span>
      </div>,
    )
    expect(screen.getByTestId('shown')).toBeVisible()
    expect(screen.getByTestId('hidden')).not.toBeVisible()
    expect(() => expect(screen.getByTestId('hidden')).toBeVisible()).toThrow()
    cleanup()
  })

  it('toBeDisabled / toBeEnabled', () => {
    render(
      <form>
        <button type="button" disabled data-testid="off">
          x
        </button>
        <button type="button" data-testid="on">
          y
        </button>
      </form>,
    )
    expect(screen.getByTestId('off')).toBeDisabled()
    expect(screen.getByTestId('on')).toBeEnabled()
    expect(() => expect(screen.getByTestId('on')).toBeDisabled()).toThrow()
    expect(() => expect(screen.getByTestId('off')).toBeEnabled()).toThrow()
    cleanup()
  })

  it('toHaveValue / toBeChecked', () => {
    render(
      <form>
        <input type="text" value="hi" data-testid="txt" />
        <input type="checkbox" checked data-testid="chk" />
        <input type="checkbox" data-testid="unchk" />
      </form>,
    )
    expect(screen.getByTestId('txt')).toHaveValue('hi')
    expect(() => expect(screen.getByTestId('txt')).toHaveValue('wrong')).toThrow()

    expect(screen.getByTestId('chk')).toBeChecked()
    expect(screen.getByTestId('unchk')).not.toBeChecked()
    expect(() => expect(screen.getByTestId('unchk')).toBeChecked()).toThrow()
    cleanup()
  })

  it('toHaveFocus — real document.activeElement', () => {
    render(
      <form>
        <input data-testid="a" />
        <input data-testid="b" />
      </form>,
    )
    const a = screen.getByTestId('a') as HTMLInputElement
    a.focus()
    expect(a).toHaveFocus()
    expect(screen.getByTestId('b')).not.toHaveFocus()
    expect(() => expect(screen.getByTestId('b')).toHaveFocus()).toThrow()
    cleanup()
  })

  it('toBeEmptyDOMElement / toContainElement', () => {
    render(
      <div data-testid="parent">
        <span data-testid="child">c</span>
      </div>,
    )
    render(<div data-testid="empty" />)
    expect(screen.getByTestId('empty')).toBeEmptyDOMElement()
    expect(screen.getByTestId('parent')).not.toBeEmptyDOMElement()
    expect(() => expect(screen.getByTestId('parent')).toBeEmptyDOMElement()).toThrow()
    expect(screen.getByTestId('parent')).toContainElement(screen.getByTestId('child'))
    cleanup()
  })
})
