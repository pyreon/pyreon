import { isRoutePath as serverIsRoutePath } from '@pyreon/server/client'
import { describe, expect, it } from 'vitest'
import { ROUTE_PATH_CASES } from '../../../../core/server/src/tests/route-path.cases'
import { isRoutePath as zeroIsRoutePath } from '../route-path'

/**
 * zero and `@pyreon/server` must decide "is this base a path" identically: a
 * base zero accepts for routing that the server-island client refuses (or the
 * reverse) silently breaks one side. zero re-exports the server's predicate;
 * this locks that they agree on the shared table even if a copy reappears.
 */
describe('route-path: zero and @pyreon/server agree', () => {
  for (const [input, expected] of ROUTE_PATH_CASES) {
    it(JSON.stringify(input), () => {
      expect(zeroIsRoutePath(input)).toBe(serverIsRoutePath(input))
      expect(zeroIsRoutePath(input)).toBe(expected)
    })
  }
})
