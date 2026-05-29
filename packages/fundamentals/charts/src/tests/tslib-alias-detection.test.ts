import { _wrapTslibError } from '../loader'

// W12 regression — when the consumer app's vite.config is missing the
// `chartsViteAlias()` resolve alias, ECharts' import throws because the
// tslib helpers (`__extends` etc.) destructure to undefined. Before this
// fix, every chart rendered as an empty div with the original opaque
// "Cannot destructure property '__extends' of 'undefined'" error buried
// in a signal nobody read. After: the error is rewritten with a
// prescriptive "Add chartsViteAlias() to your vite.config" hint.
//
// We test the wrapping function directly (rather than dynamic-importing
// `echarts/core` via a mock) because vi.doMock has hoisting issues
// around `throw` in the factory.
describe('charts loader — tslib alias detection (W12 follow-up)', () => {
  test('"__extends" destructure error is rewrapped with the alias hint', () => {
    const original = new TypeError(
      `Cannot destructure property '__extends' of 'undefined' as it is undefined.`,
    )
    const wrapped = _wrapTslibError(original)
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toContain('[@pyreon/charts]')
    expect(wrapped.message).toContain('tslib alias is missing')
    expect(wrapped.message).toContain('chartsViteAlias')
    expect(wrapped.message).toContain("import { chartsViteAlias } from '@pyreon/charts/vite'")
    // Original error message preserved at the bottom for debugging.
    expect(wrapped.message).toContain('__extends')
    // Stack preserved.
    expect(wrapped.stack).toBe(original.stack)
  })

  test('every documented tslib helper triggers the hint', () => {
    const helpers = [
      '__extends',
      '__assign',
      '__rest',
      '__spreadArrays',
      '__spreadArray',
      '__values',
      '__read',
      '__generator',
      '__awaiter',
      '__decorate',
    ]
    for (const h of helpers) {
      const err = new TypeError(`${h} is undefined`)
      expect(_wrapTslibError(err).message).toContain('tslib alias is missing')
    }
  })

  test('unrelated errors pass through unchanged', () => {
    const unrelated = new Error('Network failure loading echarts chunk')
    const wrapped = _wrapTslibError(unrelated)
    expect(wrapped.message).toBe('Network failure loading echarts chunk')
    expect(wrapped.message).not.toContain('tslib alias')
    expect(wrapped.message).not.toContain('chartsViteAlias')
    expect(wrapped).toBe(unrelated) // same reference — no wrapping
  })

  test('non-Error throwables are coerced to Error without wrapping', () => {
    // Some platforms throw strings or random objects.
    const wrapped = _wrapTslibError('plain string failure')
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe('plain string failure')
    expect(wrapped.message).not.toContain('tslib alias')
  })

  test('substring matches are NOT false-positive (regex uses word boundary)', () => {
    // A user error message that happens to contain "extends" should NOT
    // trigger the hint. Regex requires `\b` after the helper name AND the
    // `__` prefix, so this is safe.
    const benign = new Error('Custom error: class Foo extends Bar — something else broke')
    expect(_wrapTslibError(benign).message).not.toContain('tslib alias')
  })
})
