/**
 * Contract test for the moltar/typescript-runtime-type-benchmarks entry in
 * `contrib/moltar/pyreon/`.
 *
 * These assertions are transcribed from upstream's own benchmark classes
 * (`benchmarks/{parseSafe,parseStrict,assertLoose,assertStrict}.ts`) — the same
 * suite their CI runs against every registered library. Running them here means
 * a contract mismatch fails in OUR repo rather than in a stranger's CI after we
 * open the PR.
 *
 * The subtle one is the assert pair: upstream requires a THROW on invalid input,
 * not a `false` return. A boolean-returning `.is()` handed over directly would
 * satisfy a naive reading and fail their suite outright.
 */
import { describe, expect, it } from 'vitest'
import '../../../../../contrib/moltar/pyreon/cases/pyreon'
import {
  registeredCases,
  type CaseFn,
} from '../../../../../contrib/moltar/pyreon/benchmarks'

// Verbatim from upstream `benchmarks/parseSafe.ts`.
const validateData = Object.freeze({
  number: 1,
  negNumber: -1,
  maxNumber: Number.MAX_VALUE,
  string: 'string',
  longString:
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  boolean: true,
  deeplyNested: {
    foo: 'bar',
    num: 1,
    bool: false,
  },
})

const withExtra = { ...validateData, extraAttribute: 'foo' }
const withExtraNested = {
  ...validateData,
  deeplyNested: { ...validateData.deeplyNested, extraNestedAttribute: 'bar' },
}
const missingAttr = (() => {
  const d: Record<string, unknown> = { ...validateData }
  delete d.number
  return d
})()
const invalidAttr = { ...validateData, number: 'not-a-number' }

const cases = registeredCases()
const fn = (id: Parameters<typeof cases.get>[0]): CaseFn => {
  const entry = cases.get(id)
  if (!entry) throw new Error(`case "${id}" was never registered`)
  return entry.fn
}

describe('moltar entry — registration', () => {
  it('registers all four benchmark cases under the published package name', () => {
    expect([...cases.keys()].sort()).toEqual([
      'assertLoose',
      'assertStrict',
      'parseSafe',
      'parseStrict',
    ])
    for (const [, entry] of cases) {
      expect(entry.module).toBe('@pyreon/validate')
    }
  })
})

describe('moltar entry — parseSafe', () => {
  const f = fn('parseSafe')
  it('should validate the data', () => expect(f(validateData)).toEqual(validateData))
  it('removes unknown attributes from the result', () =>
    expect(f(withExtra)).toEqual(validateData))
  it('removes unknown attributes from the result (nested)', () =>
    expect(f(withExtraNested)).toEqual(validateData))
  it('should throw on missing attributes', () => expect(() => f(missingAttr)).toThrow())
  it('should throw on an invalid attribute', () => expect(() => f(invalidAttr)).toThrow())
})

describe('moltar entry — parseStrict', () => {
  const f = fn('parseStrict')
  it('should validate the data', () => expect(f(validateData)).toEqual(validateData))
  it('should throw on extra attributes', () => expect(() => f(withExtra)).toThrow())
  it('should throw on extra nested attributes', () =>
    expect(() => f(withExtraNested)).toThrow())
  it('should throw on missing attributes', () => expect(() => f(missingAttr)).toThrow())
  it('should throw on an invalid attribute type', () =>
    expect(() => f(invalidAttr)).toThrow())
})

describe('moltar entry — assertLoose', () => {
  const f = fn('assertLoose')
  it('should validate the data', () => expect(f(validateData)).toBe(true))
  it('should validate with unknown attributes', () => expect(f(withExtra)).toBe(true))
  it('should validate with unknown attributes (nested)', () =>
    expect(f(withExtraNested)).toBe(true))
  it('should throw on missing attributes', () => expect(() => f(missingAttr)).toThrow())
  it('should throw on an invalid attribute', () => expect(() => f(invalidAttr)).toThrow())
})

describe('moltar entry — assertStrict', () => {
  const f = fn('assertStrict')
  it('should validate the data', () => expect(f(validateData)).toBe(true))
  it('should throw on unknown attributes', () => expect(() => f(withExtra)).toThrow())
  it('should throw on unknown attributes (nested)', () =>
    expect(() => f(withExtraNested)).toThrow())
  it('should throw on missing attributes', () => expect(() => f(missingAttr)).toThrow())
  it('should throw on an invalid attribute', () => expect(() => f(invalidAttr)).toThrow())
})
