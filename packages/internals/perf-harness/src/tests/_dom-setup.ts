/**
 * Shared DOM setup for happy-dom tests that mount something into a
 * predictable `#root` container. Two-liner; lives here so multiple
 * counter-test files don't duplicate the same boilerplate.
 */

export function resetDom(): HTMLElement {
  document.body.innerHTML = '<div id="root"></div>'
  return document.getElementById('root') as HTMLElement
}
