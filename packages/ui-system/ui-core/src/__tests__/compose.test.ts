import { describe, expect, it } from 'vitest'
import compose from '../compose'

describe('compose', () => {
  it('should compose two functions right-to-left', () => {
    const double = (x: number) => x * 2
    const addOne = (x: number) => x + 1
    const composed = compose(addOne, double)
    // double(3) = 6, then addOne(6) = 7
    expect(composed(3)).toBe(7)
  })

  it('should compose three functions right-to-left', () => {
    const add = (x: number) => x + 1
    const mul = (x: number) => x * 3
    const sub = (x: number) => x - 2
    // sub(5) = 3, mul(3) = 9, add(9) = 10
    expect(compose(add, mul, sub)(5)).toBe(10)
  })

  it('should work with a single function', () => {
    const identity = (x: number) => x
    expect(compose(identity)(42)).toBe(42)
  })

  it('should pass value through string transforms', () => {
    const upper = (s: string) => s.toUpperCase()
    const exclaim = (s: string) => `${s}!`
    // exclaim('hello') = 'hello!', upper('hello!') = 'HELLO!'
    expect(compose(upper, exclaim)('hello')).toBe('HELLO!')
  })
})
