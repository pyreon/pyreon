import { afterEach, describe, expect, it } from 'vitest'
import {
  _hasSharedSignal,
  _sharedSignalCount,
  clearAllSharedSignals,
  getOrCreateSharedSignal,
} from '../components/shared-signal-registry'

describe('shared-signal-registry', () => {
  afterEach(() => {
    clearAllSharedSignals()
  })

  it('creates a signal with the supplied initial value on first lookup', () => {
    const sig = getOrCreateSharedSignal('count', 0)
    expect(sig()).toBe(0)
    expect(_hasSharedSignal('count')).toBe(true)
    expect(_sharedSignalCount()).toBe(1)
  })

  it('returns the SAME signal instance on subsequent lookups', () => {
    const first = getOrCreateSharedSignal('count', 0)
    const second = getOrCreateSharedSignal('count', 99)
    expect(second).toBe(first)
    // The initial-value arg is ignored on lookups after the first
    expect(second()).toBe(0)
  })

  it('signal reactivity flows across lookups (the load-bearing contract)', () => {
    const a = getOrCreateSharedSignal('counter', 0)
    const b = getOrCreateSharedSignal('counter', 0)
    expect(a).toBe(b)
    b.set(42)
    expect(a()).toBe(42)
    a.set(100)
    expect(b()).toBe(100)
  })

  it('different keys produce independent signals', () => {
    const a = getOrCreateSharedSignal('a', 1)
    const b = getOrCreateSharedSignal('b', 2)
    expect(a).not.toBe(b)
    expect(a()).toBe(1)
    expect(b()).toBe(2)
    a.set(99)
    expect(b()).toBe(2)
  })

  it('supports heterogeneous value types per key', () => {
    const num = getOrCreateSharedSignal<number>('n', 0)
    const str = getOrCreateSharedSignal<string>('s', 'hi')
    const obj = getOrCreateSharedSignal<{ x: number }>('o', { x: 1 })
    expect(num()).toBe(0)
    expect(str()).toBe('hi')
    expect(obj()).toEqual({ x: 1 })
  })

  it('clearAllSharedSignals drops every key', () => {
    getOrCreateSharedSignal('a', 1)
    getOrCreateSharedSignal('b', 2)
    getOrCreateSharedSignal('c', 3)
    expect(_sharedSignalCount()).toBe(3)
    clearAllSharedSignals()
    expect(_sharedSignalCount()).toBe(0)
    expect(_hasSharedSignal('a')).toBe(false)
  })

  it('after clear, a re-lookup gets a FRESH signal with the supplied initial value', () => {
    const before = getOrCreateSharedSignal('k', 0)
    before.set(99)
    expect(before()).toBe(99)
    clearAllSharedSignals()
    const after = getOrCreateSharedSignal('k', 0)
    expect(after).not.toBe(before)
    expect(after()).toBe(0)
  })
})
