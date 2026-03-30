import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetDBCache, _resetRegistry, useIndexedDB } from '../index'

describe('useIndexedDB', () => {
  beforeEach(() => {
    _resetRegistry()
    _resetDBCache()
  })

  afterEach(() => {
    _resetRegistry()
    _resetDBCache()
  })

  it('returns default value initially', () => {
    const draft = useIndexedDB('draft', { title: '', body: '' })
    // Initially returns default (IDB load is async)
    expect(draft()).toEqual({ title: '', body: '' })
  })

  it('.set() updates signal immediately', () => {
    const draft = useIndexedDB('draft', { title: '', body: '' })
    draft.set({ title: 'Hello', body: 'World' })
    expect(draft()).toEqual({ title: 'Hello', body: 'World' })
  })

  it('.update() updates signal', () => {
    const count = useIndexedDB('count', 0)
    count.update((n) => n + 1)
    expect(count()).toBe(1)
  })

  it('.peek() reads without subscribing', () => {
    const draft = useIndexedDB('draft', 'default')
    expect(draft.peek()).toBe('default')
  })

  it('.remove() resets to default', () => {
    const draft = useIndexedDB('draft', 'default')
    draft.set('modified')
    draft.remove()
    expect(draft()).toBe('default')
  })

  it('returns same signal for same key', () => {
    const a = useIndexedDB('key', 'value')
    const b = useIndexedDB('key', 'value')
    expect(a).toBe(b)
  })

  it('returns different signals for different keys', () => {
    const a = useIndexedDB('key1', 'a')
    const b = useIndexedDB('key2', 'b')
    expect(a).not.toBe(b)
  })

  it('.debug() returns debug info', () => {
    const draft = useIndexedDB('draft', 'test')
    expect(draft.debug().value).toBe('test')
  })

  it('.label can be set', () => {
    const draft = useIndexedDB('draft', '')
    draft.label = 'draft-signal'
    expect(draft.label).toBe('draft-signal')
  })

  it('set updates signal synchronously even though IDB write is async', () => {
    const draft = useIndexedDB('sync-test', 'default', { debounceMs: 10 })
    draft.set('immediate')
    // Signal updates immediately — no need to wait for IDB
    expect(draft()).toBe('immediate')
  })
})
