/**
 * Tests for `formatError` + `formatErrors` + `formatErrorsByPath`.
 *
 * Three resolution paths:
 *   1. issue.key + t provided + t returns non-key string → resolved
 *   2. issue.fallback set → fallback
 *   3. issue.message → message (always present per StdSchema spec)
 *
 * Native StdSchema issues (from raw Zod / Valibot / ArkType, no Pyreon
 * key) fall through to message — no overhead, no special-casing.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { formatError, formatErrors, formatErrorsByPath } from '../format'
import type { PyreonIssue, StandardSchemaIssue } from '../types'

describe('formatError — Pyreon-flavoured issues', () => {
  it('resolves issue.key through t when t returns a real translation', () => {
    const issue: PyreonIssue = {
      message: 'Too short',
      key: 'validate.string.too-short',
      params: { min: 2 },
      fallback: 'Must be at least 2 characters',
    }
    const t = (key: string, params?: Record<string, unknown>) =>
      key === 'validate.string.too-short' ? `Min ${(params as { min: number }).min}` : key
    expect(formatError(issue, t)).toBe('Min 2')
  })

  it('falls back to issue.fallback when t echoes the key', () => {
    const issue: PyreonIssue = {
      message: 'Too short',
      key: 'validate.string.too-short',
      fallback: 'Must be at least 2 characters',
    }
    const t = (k: string) => k // no translation available
    expect(formatError(issue, t)).toBe('Must be at least 2 characters')
  })

  it('falls back to issue.fallback when t is not provided', () => {
    const issue: PyreonIssue = {
      message: 'Too short',
      key: 'validate.string.too-short',
      fallback: 'Must be at least 2 characters',
    }
    expect(formatError(issue)).toBe('Must be at least 2 characters')
  })

  it('falls back to issue.message when neither key nor fallback resolves', () => {
    const issue: PyreonIssue = {
      message: 'Too short',
      key: 'validate.string.too-short',
    }
    const t = (k: string) => k
    expect(formatError(issue, t)).toBe('Too short')
  })

  it('falls back to issue.message when no key at all', () => {
    const issue: PyreonIssue = {
      message: 'Too short',
    }
    expect(formatError(issue)).toBe('Too short')
  })

  it('passes interpolation params to t', () => {
    const issue: PyreonIssue = {
      message: 'fallback',
      key: 'validate.too-short',
      params: { min: 5, actual: 2 },
    }
    let captured: Record<string, unknown> | undefined
    const t = (_k: string, p?: Record<string, unknown>) => {
      captured = p
      return 'translated'
    }
    formatError(issue, t)
    expect(captured).toEqual({ min: 5, actual: 2 })
  })
})

describe('formatError — bare StdSchema issues (no Pyreon fields)', () => {
  it('returns message unchanged for a Zod issue with no key', () => {
    const schema = z.string().email()
    const result = schema['~standard'].validate('not-an-email') as { issues: StandardSchemaIssue[] }
    expect(result.issues).toBeDefined()
    const formatted = formatError(result.issues[0]!)
    expect(formatted).toEqual(expect.any(String))
    expect(formatted.length).toBeGreaterThan(0)
  })

  it('ignores t when no key on issue (no overhead)', () => {
    const issue: StandardSchemaIssue = { message: 'plain message' }
    const t = (k: string) => `should-not-be-called-${k}`
    expect(formatError(issue, t)).toBe('plain message')
  })
})

describe('formatErrors — array variant', () => {
  it('formats each issue in order', () => {
    const issues: PyreonIssue[] = [
      { message: 'A' },
      { message: 'B', fallback: 'fallback B' },
      { message: 'C', key: 'k.c', fallback: 'fallback C' },
    ]
    const t = (k: string) => (k === 'k.c' ? 'translated C' : k)
    expect(formatErrors(issues, t)).toEqual(['A', 'fallback B', 'translated C'])
  })

  it('returns empty array for empty input', () => {
    expect(formatErrors([])).toEqual([])
  })

  it('works without t', () => {
    const issues: PyreonIssue[] = [{ message: 'A' }, { message: 'B' }]
    expect(formatErrors(issues)).toEqual(['A', 'B'])
  })
})

describe('formatErrorsByPath — per-field map variant', () => {
  it('keys issues by stringified path', () => {
    const issues: PyreonIssue[] = [
      { message: 'A', path: ['name'] },
      { message: 'B', path: ['age'] },
    ]
    expect(formatErrorsByPath(issues)).toEqual({ name: 'A', age: 'B' })
  })

  it('handles `{ key }` path segments (StdSchema variant)', () => {
    const issues: StandardSchemaIssue[] = [
      { message: 'A', path: [{ key: 'name' }, { key: 0 }, 'first'] },
    ]
    expect(formatErrorsByPath(issues)).toEqual({ 'name.0.first': 'A' })
  })

  it('first issue wins on path collision (no joinWith)', () => {
    const issues: PyreonIssue[] = [
      { message: 'first', path: ['email'] },
      { message: 'second', path: ['email'] },
    ]
    expect(formatErrorsByPath(issues)).toEqual({ email: 'first' })
  })

  it('joinWith concatenates colliding messages', () => {
    const issues: PyreonIssue[] = [
      { message: 'first', path: ['email'] },
      { message: 'second', path: ['email'] },
    ]
    expect(formatErrorsByPath(issues, undefined, { joinWith: '; ' })).toEqual({
      email: 'first; second',
    })
  })

  it('path-less issues land under the empty-string key', () => {
    const issues: PyreonIssue[] = [{ message: 'form-level error' }]
    expect(formatErrorsByPath(issues)).toEqual({ '': 'form-level error' })
  })

  it('resolves keys via t', () => {
    const issues: PyreonIssue[] = [{ message: 'fallback', key: 'k.name', path: ['name'] }]
    const t = (k: string) => (k === 'k.name' ? 'translated' : k)
    expect(formatErrorsByPath(issues, t)).toEqual({ name: 'translated' })
  })
})
