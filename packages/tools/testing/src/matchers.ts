/**
 * jest-dom-style DOM matchers — `@pyreon/testing/matchers`.
 *
 * A lean, zero-dependency set covering the DOM assertions component tests
 * actually reach for. (We ship our own rather than re-export
 * `@testing-library/jest-dom` — it's absent from this workspace, and a
 * zero-dep set keeps @pyreon/testing free of an external peer while matching
 * Pyreon's dependency-light philosophy. If richer jest-dom coverage is wanted
 * later, `@testing-library/jest-dom` can be layered on top by the user — its
 * matchers operate on the same real DOM elements `render()` produces.)
 *
 * Import for side effects to register with vitest's `expect`:
 *   import '@pyreon/testing/matchers'
 * or call `expect.extend(pyreonDomMatchers)` yourself.
 */

interface MatcherResult {
  pass: boolean
  message: () => string
}

const isElement = (v: unknown): v is Element => v instanceof Element

function normalizeText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return true
  if (el.hidden) return false
  // Walk up: any ancestor with display:none / visibility:hidden / hidden hides it.
  let node: HTMLElement | null = el
  while (node) {
    const style = node.ownerDocument.defaultView?.getComputedStyle(node)
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
    if (node.hidden) return false
    node = node.parentElement
  }
  return true
}

export const pyreonDomMatchers = {
  toBeInTheDocument(received: unknown): MatcherResult {
    const pass = isElement(received) && received.ownerDocument.contains(received)
    return {
      pass,
      message: () =>
        pass
          ? 'expected element NOT to be in the document'
          : 'expected element to be in the document',
    }
  },

  toHaveTextContent(received: unknown, expected: string | RegExp): MatcherResult {
    if (!isElement(received)) return { pass: false, message: () => 'received value is not an element' }
    const text = normalizeText(received)
    const pass = typeof expected === 'string' ? text.includes(expected) : expected.test(text)
    return {
      pass,
      message: () =>
        pass
          ? `expected element NOT to have text content ${JSON.stringify(expected)}`
          : `expected element to have text content ${JSON.stringify(expected)}, got ${JSON.stringify(text)}`,
    }
  },

  toHaveAttribute(received: unknown, name: string, value?: string): MatcherResult {
    if (!isElement(received)) return { pass: false, message: () => 'received value is not an element' }
    const has = received.hasAttribute(name)
    const actual = received.getAttribute(name)
    const pass = value === undefined ? has : has && actual === value
    return {
      pass,
      message: () =>
        pass
          ? `expected element NOT to have attribute ${name}${value !== undefined ? `=${JSON.stringify(value)}` : ''}`
          : `expected element to have attribute ${name}${value !== undefined ? `=${JSON.stringify(value)} (got ${JSON.stringify(actual)})` : ''}`,
    }
  },

  toHaveClass(received: unknown, ...classes: string[]): MatcherResult {
    if (!isElement(received)) return { pass: false, message: () => 'received value is not an element' }
    const pass = classes.every((c) => received.classList.contains(c))
    return {
      pass,
      message: () =>
        pass
          ? `expected element NOT to have class(es) ${classes.join(' ')}`
          : `expected element to have class(es) ${classes.join(' ')} (has ${received.className})`,
    }
  },

  toBeDisabled(received: unknown): MatcherResult {
    const pass = received instanceof HTMLElement && (received as HTMLInputElement).disabled === true
    return {
      pass,
      message: () => (pass ? 'expected element NOT to be disabled' : 'expected element to be disabled'),
    }
  },

  toBeChecked(received: unknown): MatcherResult {
    const pass = received instanceof HTMLInputElement && received.checked === true
    return {
      pass,
      message: () => (pass ? 'expected element NOT to be checked' : 'expected element to be checked'),
    }
  },

  toHaveValue(received: unknown, expected: string | number): MatcherResult {
    const el = received as HTMLInputElement
    const pass = el instanceof HTMLInputElement && el.value === String(expected)
    return {
      pass,
      message: () =>
        pass
          ? `expected element NOT to have value ${JSON.stringify(expected)}`
          : `expected element to have value ${JSON.stringify(expected)} (got ${JSON.stringify(el?.value)})`,
    }
  },

  toBeVisible(received: unknown): MatcherResult {
    const pass = isElement(received) && received.ownerDocument.contains(received) && isVisible(received)
    return {
      pass,
      message: () => (pass ? 'expected element NOT to be visible' : 'expected element to be visible'),
    }
  },

  toBeEmptyDOMElement(received: unknown): MatcherResult {
    const pass = isElement(received) && received.childNodes.length === 0
    return {
      pass,
      message: () =>
        pass ? 'expected element NOT to be empty' : 'expected element to be an empty DOM element',
    }
  },

  toContainElement(received: unknown, child: Element | null): MatcherResult {
    const pass = isElement(received) && child instanceof Element && received.contains(child)
    return {
      pass,
      message: () =>
        pass ? 'expected element NOT to contain the child' : 'expected element to contain the child',
    }
  },

  toHaveFocus(received: unknown): MatcherResult {
    const pass = isElement(received) && received.ownerDocument.activeElement === received
    return {
      pass,
      message: () => (pass ? 'expected element NOT to have focus' : 'expected element to have focus'),
    }
  },
}

export type PyreonDomMatchers = typeof pyreonDomMatchers
