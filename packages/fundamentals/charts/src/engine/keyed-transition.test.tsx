// `by` matches rows by identity across a data change: each row tweens from
// its own previous value and a new row enters from the baseline.
import { describe, expect, it } from 'vitest'
import { alignByKey, sameKeys } from './tween'

describe('alignByKey', () => {
  it('a sliding window tweens each surviving row from its own value; the new row grows from 0', () => {
    // Old rows a, b, c; new rows b, c, d (the oldest dropped, one appended).
    expect(alignByKey([[1, 2, 3]], ['a', 'b', 'c'], ['b', 'c', 'd'], ['bars'])).toEqual([[2, 3, 0]])
  })
  it('an insertion at the front keeps every other row on its own value', () => {
    expect(alignByKey([[5, 6]], ['x', 'y'], ['w', 'x', 'y'], ['bars'])).toEqual([[0, 5, 6]])
  })
  it('a line or point enters in place (a gap snaps in) rather than rising from zero', () => {
    const [row] = alignByKey([[1]], ['a'], ['a', 'b'], ['line'])
    expect(row![0]).toBe(1)
    expect(Number.isNaN(row![1]!)).toBe(true)
  })
  it('sameKeys compares in order', () => {
    expect(sameKeys(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameKeys(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameKeys(['a'], ['a', 'b'])).toBe(false)
  })
})

