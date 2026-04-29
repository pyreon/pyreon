import { describe, expect, it } from 'vitest'
import { getRedirectInfo, isRedirectError, redirect } from '../redirect'

describe('redirect()', () => {
  it('throws an error branded with the REDIRECT symbol', () => {
    expect(() => redirect('/login')).toThrow()
  })

  it('captures URL + default 307 status on the thrown error', () => {
    let caught: unknown
    try {
      redirect('/login')
    } catch (err) {
      caught = err
    }
    const info = getRedirectInfo(caught)
    expect(info).toEqual({ url: '/login', status: 307 })
  })

  it('captures the custom status when one is provided', () => {
    let caught: unknown
    try {
      redirect('/perm', 308)
    } catch (err) {
      caught = err
    }
    expect(getRedirectInfo(caught)?.status).toBe(308)
  })

  it.each([301, 302, 303, 307, 308] as const)('accepts %s as a valid status', (status) => {
    let caught: unknown
    try {
      redirect('/x', status)
    } catch (err) {
      caught = err
    }
    expect(getRedirectInfo(caught)?.status).toBe(status)
  })

  it('produces a human-readable Error message', () => {
    let caught: Error | undefined
    try {
      redirect('/login')
    } catch (err) {
      caught = err as Error
    }
    expect(caught?.message).toBe('Redirect to /login')
  })
})

describe('isRedirectError()', () => {
  it('returns true for an error thrown by redirect()', () => {
    let caught: unknown
    try {
      redirect('/x')
    } catch (err) {
      caught = err
    }
    expect(isRedirectError(caught)).toBe(true)
  })

  it('returns false for a plain Error', () => {
    expect(isRedirectError(new Error('plain'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isRedirectError(null)).toBe(false)
    expect(isRedirectError(undefined)).toBe(false)
    expect(isRedirectError('string')).toBe(false)
    expect(isRedirectError(42)).toBe(false)
    expect(isRedirectError({})).toBe(false)
  })

  it('returns false for objects with a different brand', () => {
    const fake = new Error('fake')
    ;(fake as unknown as Record<symbol, unknown>)[Symbol.for('something.else')] = true
    expect(isRedirectError(fake)).toBe(false)
  })
})

describe('getRedirectInfo()', () => {
  it('returns null for non-redirect errors', () => {
    expect(getRedirectInfo(new Error('plain'))).toBeNull()
    expect(getRedirectInfo(null)).toBeNull()
  })

  it('returns the redirect info for a thrown redirect()', () => {
    let caught: unknown
    try {
      redirect('/destination', 303)
    } catch (err) {
      caught = err
    }
    expect(getRedirectInfo(caught)).toEqual({ url: '/destination', status: 303 })
  })
})
