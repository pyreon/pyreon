import { describe, expect, it } from 'vitest'
import { isRoutePath } from '../route-path'
import { ROUTE_PATH_CASES } from './route-path.cases'

describe('isRoutePath', () => {
  for (const [input, expected] of ROUTE_PATH_CASES) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(isRoutePath(input)).toBe(expected)
    })
  }
})
