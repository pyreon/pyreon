/** The shared table: `zero/src/tests/route-path-drift.test.ts` runs zero's export against it too. */
export const ROUTE_PATH_CASES: ReadonlyArray<[string, boolean]> = [
  ['/', true],
  ['/docs', true],
  ['/docs/', true],
  ['/a/b/', true],
  ['/a..b/', true],
  ['/ünï/', true],
  ['', false],
  ['./', false],
  ['docs/', false],
  ['https://cdn.example.com/x/', false],
  ['//cdn.example.com/x/', false],
  ['/\\evil.com', false],
  ['/docs?x', false],
  ['/docs#h', false],
  ['/docs /', false],
  ['/a/../b', false],
  ['/..', false],
  // Percent-encoded: the URL parser turns `%2e%2e` into a `..` segment, and a
  // server may decode `%2f` / `%5c` to a separator.
  ['/%2e%2e/', false],
  ['/%2E%2E/x', false],
  ['/a/%2e./b', false],
  ['/a%2fb/', false],
  ['/a%5Cb/', false],
]
