/**
 * Typed DOM query helpers — replacement for the recurring
 * `container.querySelector(X) as HTMLY...Element` pattern across tests.
 *
 * Three variants:
 *
 * - `query(root, selector)` — throws if missing. Use when the test
 *   expects the element to exist; a clear throw at the call site beats
 *   a downstream NPE on `.click()`.
 * - `queryOptional(root, selector)` — returns `T | null`. Use when the
 *   test deliberately asserts presence / absence both ways.
 * - `queryAll(root, selector)` — returns `T[]` (Array, not NodeList).
 *
 * All three use TypeScript's `HTMLElementTagNameMap` so the return type
 * narrows automatically for HTML tag selectors: `query(el, 'a')` is
 * `HTMLAnchorElement`, `query(el, 'input')` is `HTMLInputElement`, etc.
 *
 * For CSS selectors (`[data-foo]`, `.x`, `#y`) that don't match a known
 * tag, pass an explicit generic: `query<HTMLDivElement>(el, '[data-foo]')`.
 *
 * Replaces the 248-site `as HTMLXxxElement` pattern in test files —
 * 70% of which were querySelector-cast shapes — caught by the
 * post-#914 hygiene verification audit.
 */

type TagMap = HTMLElementTagNameMap

/**
 * Find one element matching `selector` under `root`. Throws if missing.
 *
 * For HTML-tag selectors (`'a'`, `'input'`, etc.) the return type is
 * the matching `HTMLElementTagNameMap` entry. For attribute / class /
 * ID selectors, pass an explicit generic — defaults to `HTMLElement`.
 *
 * @example
 *   const btn = query(container, 'button')         // HTMLButtonElement
 *   const card = query<HTMLDivElement>(container, '[data-card]')
 */
export function query<K extends keyof TagMap>(
  root: ParentNode,
  selector: K,
): TagMap[K]
export function query<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T
export function query(root: ParentNode, selector: string): Element {
  const el = root.querySelector(selector)
  if (!el) {
    throw new Error(
      `[@pyreon/test-utils] query: no element matches "${selector}"`,
    )
  }
  return el
}

/**
 * Same as `query` but returns `null` instead of throwing when no
 * element matches. Use when the test deliberately asserts presence /
 * absence both ways:
 *
 *   expect(queryOptional(container, '.modal')).toBeNull()
 *   modal.open()
 *   expect(queryOptional(container, '.modal')).not.toBeNull()
 */
export function queryOptional<K extends keyof TagMap>(
  root: ParentNode,
  selector: K,
): TagMap[K] | null
export function queryOptional<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T | null
export function queryOptional(
  root: ParentNode,
  selector: string,
): Element | null {
  return root.querySelector(selector)
}

/**
 * Find every element matching `selector` under `root`. Returns a real
 * `Array` (not a `NodeList`) so `.map` / `.filter` work without `[].slice.call`.
 *
 * Same generic semantics as `query` — HTML-tag selectors narrow
 * automatically; everything else defaults to `HTMLElement` or accepts
 * an explicit `<T>`.
 */
export function queryAll<K extends keyof TagMap>(
  root: ParentNode,
  selector: K,
): TagMap[K][]
export function queryAll<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T[]
export function queryAll(root: ParentNode, selector: string): Element[] {
  return Array.from(root.querySelectorAll(selector))
}
