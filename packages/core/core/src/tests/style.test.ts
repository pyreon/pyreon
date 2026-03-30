import { CSS_UNITLESS, cx, normalizeStyleValue, toKebabCase } from '../style'

// cx() is extensively tested in cx.test.ts — these tests cover toKebabCase,
// normalizeStyleValue, and CSS_UNITLESS which are used by runtime-dom/runtime-server.

describe('toKebabCase', () => {
  test('converts camelCase to kebab-case', () => {
    expect(toKebabCase('backgroundColor')).toBe('background-color')
  })

  test('handles single uppercase letter', () => {
    expect(toKebabCase('zIndex')).toBe('z-index')
  })

  test('handles multiple uppercase letters', () => {
    expect(toKebabCase('borderTopLeftRadius')).toBe('border-top-left-radius')
  })

  test('returns lowercase string unchanged', () => {
    expect(toKebabCase('color')).toBe('color')
  })

  test('handles empty string', () => {
    expect(toKebabCase('')).toBe('')
  })

  test('handles consecutive uppercase (treated individually)', () => {
    expect(toKebabCase('MSTransform')).toBe('-m-s-transform')
  })

  test('handles leading lowercase with single word', () => {
    expect(toKebabCase('opacity')).toBe('opacity')
  })
})

describe('normalizeStyleValue', () => {
  test('appends px to numbers for non-unitless properties', () => {
    expect(normalizeStyleValue('width', 100)).toBe('100px')
    expect(normalizeStyleValue('height', 50)).toBe('50px')
    expect(normalizeStyleValue('padding', 0)).toBe('0px')
    expect(normalizeStyleValue('marginTop', 20)).toBe('20px')
  })

  test('does not append px to unitless properties', () => {
    expect(normalizeStyleValue('opacity', 0.5)).toBe('0.5')
    expect(normalizeStyleValue('zIndex', 10)).toBe('10')
    expect(normalizeStyleValue('flexGrow', 1)).toBe('1')
    expect(normalizeStyleValue('fontWeight', 700)).toBe('700')
    expect(normalizeStyleValue('lineHeight', 1.5)).toBe('1.5')
    expect(normalizeStyleValue('order', 3)).toBe('3')
    expect(normalizeStyleValue('columns', 2)).toBe('2')
    expect(normalizeStyleValue('flex', 1)).toBe('1')
    expect(normalizeStyleValue('scale', 2)).toBe('2')
    expect(normalizeStyleValue('widows', 2)).toBe('2')
    expect(normalizeStyleValue('orphans', 3)).toBe('3')
  })

  test('passes through string values unchanged', () => {
    expect(normalizeStyleValue('width', '100%')).toBe('100%')
    expect(normalizeStyleValue('color', 'red')).toBe('red')
    expect(normalizeStyleValue('display', 'flex')).toBe('flex')
  })

  test('converts non-string/non-number to string', () => {
    expect(normalizeStyleValue('display', null)).toBe('null')
    expect(normalizeStyleValue('display', undefined)).toBe('undefined')
    expect(normalizeStyleValue('display', true)).toBe('true')
  })

  test('handles zero correctly for non-unitless props', () => {
    expect(normalizeStyleValue('margin', 0)).toBe('0px')
  })

  test('handles negative numbers', () => {
    expect(normalizeStyleValue('marginLeft', -10)).toBe('-10px')
    expect(normalizeStyleValue('zIndex', -1)).toBe('-1')
  })
})

describe('CSS_UNITLESS', () => {
  test('is a Set', () => {
    expect(CSS_UNITLESS).toBeInstanceOf(Set)
  })

  test('contains common unitless properties', () => {
    expect(CSS_UNITLESS.has('opacity')).toBe(true)
    expect(CSS_UNITLESS.has('zIndex')).toBe(true)
    expect(CSS_UNITLESS.has('fontWeight')).toBe(true)
    expect(CSS_UNITLESS.has('lineHeight')).toBe(true)
    expect(CSS_UNITLESS.has('flex')).toBe(true)
    expect(CSS_UNITLESS.has('flexGrow')).toBe(true)
    expect(CSS_UNITLESS.has('flexShrink')).toBe(true)
    expect(CSS_UNITLESS.has('order')).toBe(true)
    expect(CSS_UNITLESS.has('columnCount')).toBe(true)
    expect(CSS_UNITLESS.has('animationIterationCount')).toBe(true)
  })

  test('contains SVG unitless properties', () => {
    expect(CSS_UNITLESS.has('fillOpacity')).toBe(true)
    expect(CSS_UNITLESS.has('floodOpacity')).toBe(true)
    expect(CSS_UNITLESS.has('stopOpacity')).toBe(true)
    expect(CSS_UNITLESS.has('strokeOpacity')).toBe(true)
    expect(CSS_UNITLESS.has('strokeWidth')).toBe(true)
    expect(CSS_UNITLESS.has('strokeMiterlimit')).toBe(true)
    expect(CSS_UNITLESS.has('strokeDasharray')).toBe(true)
    expect(CSS_UNITLESS.has('strokeDashoffset')).toBe(true)
  })

  test('does not contain properties that need units', () => {
    expect(CSS_UNITLESS.has('width')).toBe(false)
    expect(CSS_UNITLESS.has('height')).toBe(false)
    expect(CSS_UNITLESS.has('margin')).toBe(false)
    expect(CSS_UNITLESS.has('padding')).toBe(false)
    expect(CSS_UNITLESS.has('fontSize')).toBe(false)
    expect(CSS_UNITLESS.has('borderWidth')).toBe(false)
    expect(CSS_UNITLESS.has('top')).toBe(false)
    expect(CSS_UNITLESS.has('left')).toBe(false)
  })
})

describe('cx — additional edge cases', () => {
  test('object with all false values', () => {
    expect(cx({ a: false, b: false, c: false })).toBe('')
  })

  test('object with null and undefined values', () => {
    expect(cx({ a: null, b: undefined, c: true })).toBe('c')
  })

  test('mixed array of numbers, strings, and objects', () => {
    expect(cx([1, 'two', { three: true, four: false }])).toBe('1 two three')
  })

  test('single-element array', () => {
    expect(cx(['only'])).toBe('only')
  })

  test('number 0 in an array', () => {
    expect(cx([0, 'one'])).toBe('0 one')
  })

  test('boolean true in array is filtered', () => {
    expect(cx([true, 'visible'])).toBe('visible')
  })

  test('nested empty arrays', () => {
    expect(cx([[], [[]], [[[]]]])).toBe('')
  })

  test('object with function returning false', () => {
    expect(cx({ hidden: () => false })).toBe('')
  })

  test('single key object', () => {
    expect(cx({ active: true })).toBe('active')
  })
})
