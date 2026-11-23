import { describe, expect, it } from 'vitest'
import { isRoutePath } from '../route-path'

describe('isRoutePath — the one base-is-a-path predicate (#4751)', () => {
  it('accepts root-relative paths', () => {
    for (const ok of ['/', '/docs', '/docs/', '/a/b/', '/a..b/', '/ünï/']) expect(isRoutePath(ok), ok).toBe(true)
  })

  it('rejects URLs, relative bases and paths a browser would resolve elsewhere', () => {
    for (const bad of [
      '',
      './',
      'docs/',
      'https://cdn.example.com/x/',
      '//cdn.example.com/x/',
      '/\\evil.com',
      '/docs?x',
      '/docs#h',
      '/docs /',
      '/a/../b',
      '/..',
    ]) {
      expect(isRoutePath(bad), bad).toBe(false)
    }
  })
})
