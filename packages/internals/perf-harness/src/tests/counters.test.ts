import { beforeEach, describe, expect, it } from 'vitest'
import {
  _count,
  _disable,
  _enable,
  _isEnabled,
  _reset,
  _snapshot,
} from '../counters'

beforeEach(() => {
  _reset()
  _disable()
})

describe('counters', () => {
  it('no-ops when disabled', () => {
    _count('a')
    _count('b', 5)
    expect(_snapshot()).toEqual({})
  })

  it('records increments when enabled', () => {
    _enable()
    _count('a')
    _count('a')
    _count('b', 5)
    expect(_snapshot()).toEqual({ a: 2, b: 5 })
  })

  it('reset() clears all counters but keeps enabled flag', () => {
    _enable()
    _count('a', 3)
    _reset()
    expect(_snapshot()).toEqual({})
    expect(_isEnabled()).toBe(true)
  })

  it('snapshot() returns a plain object decoupled from the registry', () => {
    _enable()
    _count('a')
    const snap = _snapshot()
    _count('a')
    // Mutating the registry after snapshot should not change the snapshot.
    expect(snap).toEqual({ a: 1 })
    expect(_snapshot()).toEqual({ a: 2 })
  })

  it('delta can be negative', () => {
    _enable()
    _count('a', 10)
    _count('a', -3)
    expect(_snapshot()).toEqual({ a: 7 })
  })

  it('_isEnabled reflects the current state', () => {
    expect(_isEnabled()).toBe(false)
    _enable()
    expect(_isEnabled()).toBe(true)
    _disable()
    expect(_isEnabled()).toBe(false)
  })
})
