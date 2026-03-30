import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetRegistry, useSessionStorage } from '../index'

describe('useSessionStorage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    _resetRegistry()
  })

  afterEach(() => {
    sessionStorage.clear()
    _resetRegistry()
  })

  it('returns default value when key is not in storage', () => {
    const step = useSessionStorage('step', 0)
    expect(step()).toBe(0)
  })

  it('reads existing value from sessionStorage', () => {
    sessionStorage.setItem('step', JSON.stringify(3))
    const step = useSessionStorage('step', 0)
    expect(step()).toBe(3)
  })

  it('.set() updates signal and sessionStorage', () => {
    const step = useSessionStorage('step', 0)
    step.set(5)
    expect(step()).toBe(5)
    expect(JSON.parse(sessionStorage.getItem('step')!)).toBe(5)
  })

  it('.remove() clears from storage and resets to default', () => {
    const step = useSessionStorage('step', 0)
    step.set(5)
    step.remove()
    expect(step()).toBe(0)
    expect(sessionStorage.getItem('step')).toBeNull()
  })

  it('returns same signal instance for same key', () => {
    const a = useSessionStorage('step', 0)
    const b = useSessionStorage('step', 0)
    expect(a).toBe(b)
  })

  it('works with objects', () => {
    const form = useSessionStorage('form-draft', { name: '', email: '' })
    form.set({ name: 'Alice', email: 'alice@example.com' })
    expect(form()).toEqual({ name: 'Alice', email: 'alice@example.com' })
  })

  it('handles corrupt storage values gracefully', () => {
    sessionStorage.setItem('broken', '{{invalid')
    const value = useSessionStorage('broken', 'default')
    expect(value()).toBe('default')
  })

  it('does not share signals with localStorage', async () => {
    const { useStorage } = await import('../local')
    const local = useStorage('key', 'local-default')
    const session = useSessionStorage('key', 'session-default')
    expect(local).not.toBe(session)
    expect(local()).toBe('local-default')
    expect(session()).toBe('session-default')
  })
})
