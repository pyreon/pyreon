import { cx } from '../style'

describe('cx', () => {
  test('returns empty string for falsy values', () => {
    expect(cx(null)).toBe('')
    expect(cx(undefined)).toBe('')
    expect(cx(false)).toBe('')
    expect(cx(true)).toBe('')
  })

  test('passes through strings', () => {
    expect(cx('foo bar')).toBe('foo bar')
  })

  test('converts numbers to strings', () => {
    expect(cx(42)).toBe('42')
  })

  test('filters and joins arrays', () => {
    expect(cx(['foo', false, 'bar', null, 'baz'])).toBe('foo bar baz')
  })

  test('resolves object keys with truthy values', () => {
    expect(cx({ active: true, hidden: false, bold: true })).toBe('active bold')
  })

  test('resolves object values that are functions', () => {
    expect(cx({ active: () => true, hidden: () => false })).toBe('active')
  })

  test('handles nested arrays and objects', () => {
    expect(cx(['base', { active: true }, ['nested', { deep: true }]])).toBe(
      'base active nested deep',
    )
  })

  test('handles empty inputs', () => {
    expect(cx([])).toBe('')
    expect(cx({})).toBe('')
  })

  test('object where ALL values are functions returning booleans', () => {
    expect(
      cx({
        active: () => true,
        hidden: () => false,
        bold: () => true,
        italic: () => false,
      }),
    ).toBe('active bold')
  })

  test('deeply nested arrays (3+ levels)', () => {
    expect(cx([[['level3', [['level5']]]]])).toBe('level3 level5')
  })

  test('mixed: string, object with function, deeply nested array', () => {
    expect(cx(['base', { active: () => true }, [['deeply-nested']]])).toBe(
      'base active deeply-nested',
    )
  })

  test('empty string values are filtered', () => {
    expect(cx(['foo', '', 'bar', ''])).toBe('foo bar')
  })

  test('number 0 is a valid class name as string', () => {
    expect(cx(0)).toBe('0')
  })
})
