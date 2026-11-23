/**
 * The shared island-name table: registration and the browser
 * (`server/src/tests/island-name.test.ts`) and zero's fragment endpoint
 * (`zero/src/tests/island-name-endpoint.test.ts`) must agree on every row.
 */
export const ISLAND_NAME_CASES: ReadonlyArray<[string, boolean]> = [
  ['CartBadge', true],
  ['cart-badge_2', true],
  ['ns:badge', true],
  ['cart badge', true],
  ['ünï', true],
  ['a?b#c', true],
  ['v1.2', true],
  ['', false],
  ['.', false],
  ['..', false],
  ['...', false],
  ['shop/cart', false],
  ['../../api/x', false],
  ['a\\b', false],
  ['50%', false],
  ['%2e%2e', false],
  ['a\u0000b', false],
  ['a\nb', false],
  ['a\rb', false],
  ['tab\tname', false],
]
