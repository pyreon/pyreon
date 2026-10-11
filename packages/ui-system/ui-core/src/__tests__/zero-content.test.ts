import { render, resolveSlot } from '../index'

it.each([0, -0, 1, 2])('preserves numeric %s in direct and accessor slots', (value) => {
  expect(render(value)).toBe(value)
  expect(resolveSlot(value)).toBe(value)
  expect(resolveSlot(() => value)).toBe(value)
})

it('keeps empty and boolean content semantics', () => {
  for (const value of [null, undefined, false, '']) {
    expect(render(value)).toBeNull()
    expect(resolveSlot(value)).toBeNull()
  }
  expect(render(true)).toBe(true)
  expect(resolveSlot(true)).toBe(true)
})
