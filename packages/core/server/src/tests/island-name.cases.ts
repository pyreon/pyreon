/**
 * The shared island-name table (29 rows): registration and the browser
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
  ['\uFF0E\uFF0E\uFF0F\uFF0E\uFF0E\uFF0Fapi', false], // ．．／．．／api
  ['\u2024\u2024', false], // ․․ → ..
  ['\uFE52\uFE52', false], // ﹒﹒ → ..
  ['50\uFF05', false], // ％ → %
  ['a\u0085b', false], // C1 control (NEL)
  ['a\u2028b', false],
  ['a\u202Eb', false], // RIGHT-TO-LEFT OVERRIDE
  ['zero\u200Dwidth', false], // ZERO WIDTH JOINER (Cf)
  ['ﬁle', true], // NFKC → "file": still a plain name
]
