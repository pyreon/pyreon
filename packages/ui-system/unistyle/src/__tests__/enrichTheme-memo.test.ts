/**
 * `enrichTheme` returns the SAME enriched object for the same input theme.
 *
 * Every theme-keyed cache in the ui-system (rocketstyle `_rsMemo` +
 * ThemeManager, styler class caches, `makeItResponsive`, `themeToCssVars`)
 * keys on the enriched object's identity. `<PyreonUI>` enriches inside a
 * computed created per mount, so a fresh object per call made every one of
 * those caches miss once per mount — once per SSR request.
 */
import { config } from '@pyreon/ui-core'
import { afterEach, describe, expect, it } from 'vitest'
import { enrichTheme } from '../enrichTheme'

type CountSink = ((name: string, n?: number) => void) | undefined
const g = globalThis as { __pyreon_count__?: CountSink }

describe('enrichTheme — identity memo', () => {
  const originalCss = config.css
  afterEach(() => {
    config.init({ css: originalCss })
  })

  it('the same input theme yields the same enriched object (counted as a hit)', () => {
    const counts: Record<string, number> = {}
    const prev = g.__pyreon_count__
    g.__pyreon_count__ = (name, n = 1) => {
      counts[name] = (counts[name] ?? 0) + n
    }
    try {
      const theme = { rootSize: 16, breakpoints: { xs: 0, md: 768 } }
      const a = enrichTheme(theme)
      const b = enrichTheme(theme)
      expect(b).toBe(a)
      expect(counts['unistyle.enrichTheme.hit']).toBe(1)
    } finally {
      g.__pyreon_count__ = prev
    }
  })

  it('production: still memoizes, without the dev counter', () => {
    const env = process.env as { NODE_ENV?: string | undefined }
    const prevEnv = env.NODE_ENV
    const prevSink = g.__pyreon_count__
    const seen: string[] = []
    g.__pyreon_count__ = (name) => {
      seen.push(name)
    }
    env.NODE_ENV = 'production'
    try {
      const theme = { rootSize: 16 }
      expect(enrichTheme(theme)).toBe(enrichTheme(theme))
      expect(seen).not.toContain('unistyle.enrichTheme.hit')
    } finally {
      env.NODE_ENV = prevEnv
      g.__pyreon_count__ = prevSink
    }
  })

  it('enriching an already-enriched theme returns it unchanged', () => {
    const enriched = enrichTheme({ rootSize: 16, breakpoints: { xs: 0, sm: 576 } })
    expect(enrichTheme(enriched)).toBe(enriched)
  })

  it('is keyed on identity: an equal but distinct theme object is enriched afresh', () => {
    const a = enrichTheme({ rootSize: 16 })
    const b = enrichTheme({ rootSize: 16 })
    expect(b).not.toBe(a)
    expect(b).toEqual(a)
  })

  it('a later init({ css }) re-derives the media helpers instead of reusing stale ones', () => {
    const theme = { rootSize: 16, breakpoints: { xs: 0, md: 768 } }
    const before = enrichTheme(theme)
    const calls: unknown[] = []
    const wrappedCss = ((...args: Parameters<typeof originalCss>) => {
      calls.push(args)
      return originalCss(...args)
    }) as typeof originalCss
    config.init({ css: wrappedCss })

    const after = enrichTheme(theme)
    expect(after).not.toBe(before)
    const md = after.__PYREON__.media?.md
    expect(md).toBeTypeOf('function')
    expect(md!`color: red;`).toBeDefined()
    expect(calls.length).toBeGreaterThan(0)
    expect(enrichTheme(theme)).toBe(after) // and memoizes again under the new engine
  })
})
