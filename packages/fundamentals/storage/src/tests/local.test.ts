import { effect } from '@pyreon/reactivity'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, useStorage } from '../index'

describe('useStorage (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    localStorage.clear()
    _resetRegistry()
  })

  it('returns default value when key is not in storage', () => {
    const theme = useStorage('theme', 'light')
    expect(theme()).toBe('light')
  })

  it('reads existing value from localStorage', () => {
    localStorage.setItem('theme', JSON.stringify('dark'))
    const theme = useStorage('theme', 'light')
    expect(theme()).toBe('dark')
  })

  it('.set() updates signal and localStorage', () => {
    const theme = useStorage('theme', 'light')
    theme.set('dark')
    expect(theme()).toBe('dark')
    expect(JSON.parse(localStorage.getItem('theme')!)).toBe('dark')
  })

  it('.update() updates signal and localStorage', () => {
    const count = useStorage('count', 0)
    count.update((n) => n + 1)
    expect(count()).toBe(1)
    expect(JSON.parse(localStorage.getItem('count')!)).toBe(1)
  })

  it('.peek() reads without subscribing', () => {
    const theme = useStorage('theme', 'light')
    expect(theme.peek()).toBe('light')
  })

  it('.remove() clears from storage and resets to default', () => {
    const theme = useStorage('theme', 'light')
    theme.set('dark')
    expect(theme()).toBe('dark')

    theme.remove()
    expect(theme()).toBe('light')
    expect(localStorage.getItem('theme')).toBeNull()
  })

  it('returns same signal instance for same key (deduplication)', () => {
    const a = useStorage('theme', 'light')
    const b = useStorage('theme', 'light')
    expect(a).toBe(b)
  })

  it('returns different signals for different keys', () => {
    const a = useStorage('theme', 'light')
    const b = useStorage('lang', 'en')
    expect(a).not.toBe(b)
  })

  it('works with objects', () => {
    const prefs = useStorage('prefs', { sidebar: true, density: 'comfortable' })
    expect(prefs()).toEqual({ sidebar: true, density: 'comfortable' })

    prefs.set({ sidebar: false, density: 'compact' })
    expect(prefs()).toEqual({ sidebar: false, density: 'compact' })
    expect(JSON.parse(localStorage.getItem('prefs')!)).toEqual({
      sidebar: false,
      density: 'compact',
    })
  })

  it('works with arrays', () => {
    const items = useStorage('items', [1, 2, 3])
    expect(items()).toEqual([1, 2, 3])

    items.set([4, 5])
    expect(items()).toEqual([4, 5])
  })

  it('works with booleans', () => {
    const flag = useStorage('flag', false)
    flag.set(true)
    expect(flag()).toBe(true)
    expect(JSON.parse(localStorage.getItem('flag')!)).toBe(true)
  })

  it('works with numbers', () => {
    const count = useStorage('count', 42)
    expect(count()).toBe(42)
  })

  it('handles corrupt storage values gracefully', () => {
    localStorage.setItem('broken', 'not valid json{{{')
    const value = useStorage('broken', 'fallback')
    expect(value()).toBe('fallback')
  })

  it('calls onError when deserialization fails', () => {
    localStorage.setItem('broken', '{invalid')
    const errors: Error[] = []
    const value = useStorage('broken', 'default', {
      onError: (e) => {
        errors.push(e)
        return undefined
      },
    })
    expect(value()).toBe('default')
    expect(errors).toHaveLength(1)
  })

  it('onError can return a custom fallback', () => {
    localStorage.setItem('broken', '{invalid')
    const value = useStorage('broken', 'default', {
      onError: () => 'custom-fallback',
    })
    expect(value()).toBe('custom-fallback')
  })

  it('custom serializer/deserializer work', () => {
    const date = useStorage('date', new Date('2025-01-01'), {
      serializer: (d) => d.toISOString(),
      deserializer: (s) => new Date(s),
    })

    expect(date()).toEqual(new Date('2025-01-01'))

    const newDate = new Date('2025-06-15')
    date.set(newDate)
    expect(localStorage.getItem('date')).toBe('2025-06-15T00:00:00.000Z')
  })

  it('is reactive — works in effects', () => {
    const theme = useStorage('theme', 'light')
    const values: string[] = []

    effect(() => {
      values.push(theme())
    })

    expect(values).toEqual(['light'])

    theme.set('dark')
    expect(values).toEqual(['light', 'dark'])
  })

  it('.subscribe() works', () => {
    const theme = useStorage('theme', 'light')
    let callCount = 0
    const unsub = theme.subscribe(() => {
      callCount++
    })

    theme.set('dark')
    expect(callCount).toBeGreaterThanOrEqual(1)
    unsub()
  })

  it('.debug() returns debug info', () => {
    const theme = useStorage('theme', 'light')
    const info = theme.debug()
    expect(info.value).toBe('light')
  })

  it('.label can be set and read', () => {
    const theme = useStorage('theme', 'light')
    theme.label = 'theme-signal'
    expect(theme.label).toBe('theme-signal')
  })

  it('cross-tab sync via storage event', () => {
    const theme = useStorage('theme', 'light')

    // Simulate storage event from another tab
    const event = Object.assign(new Event('storage'), {
      key: 'theme',
      newValue: JSON.stringify('dark'),
      storageArea: localStorage,
    })
    window.dispatchEvent(event)

    expect(theme()).toBe('dark')
  })

  it('cross-tab sync with null newValue resets to default', () => {
    const theme = useStorage('theme', 'light')
    theme.set('dark')

    const event = Object.assign(new Event('storage'), {
      key: 'theme',
      newValue: null,
      storageArea: localStorage,
    })
    window.dispatchEvent(event)

    expect(theme()).toBe('light')
  })

  it('after remove(), a new useStorage call creates a fresh signal', () => {
    const a = useStorage('temp', 'first')
    a.set('modified')
    a.remove()

    const b = useStorage('temp', 'second')
    expect(b()).toBe('second')
    expect(a).not.toBe(b)
  })
})
