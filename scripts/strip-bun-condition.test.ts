/**
 * Regression: published `@pyreon/*` package.json `exports` MUST NOT
 * contain the `bun` condition. That condition's only purpose is
 * workspace dev (point TypeScript / Vite at `src/index.ts`); when it
 * ships to npm consumers, it creates a dual-resolution risk where
 * Vite's `[bare]` resolver picks `bun → src/` while the `[package entry]`
 * resolver ignores it and picks `import → lib/` — producing TWO module
 * instances of `@pyreon/core` with separate `_current` lifecycle state.
 * That was the structural cause of the `provide()` outside-setup warning
 * storm reported against 0.24.4.
 *
 * The fix is at `publish.ts` Phase 2 — every framework package's
 * `exports` is stripped of `bun` before `npm publish`, then restored
 * after. These tests lock the strip helper's contract.
 */
import { describe, expect, it } from 'vitest'
import { stripBunCondition, stripSrcFromFiles } from './strip-bun-condition'

describe('stripBunCondition — publish-time exports surgery', () => {
  it('removes the bun key from a flat exports entry, preserves import + types', () => {
    const out = stripBunCondition({
      '.': {
        bun: './src/index.ts',
        import: './lib/index.js',
        types: './lib/types/index.d.ts',
      },
    })
    expect(out).toEqual({
      '.': {
        import: './lib/index.js',
        types: './lib/types/index.d.ts',
      },
    })
  })

  it('strips bun recursively from every subpath export', () => {
    const out = stripBunCondition({
      '.': { bun: './src/index.ts', import: './lib/index.js' },
      './ssr': { bun: './src/ssr.ts', import: './lib/ssr.js' },
      './client': { bun: './src/client.ts', import: './lib/client.js' },
    })
    expect(out).toEqual({
      '.': { import: './lib/index.js' },
      './ssr': { import: './lib/ssr.js' },
      './client': { import: './lib/client.js' },
    })
  })

  it('preserves entries that never had a bun key', () => {
    const out = stripBunCondition({
      './types': './lib/types/index.d.ts',
      './package.json': './package.json',
    })
    expect(out).toEqual({
      './types': './lib/types/index.d.ts',
      './package.json': './package.json',
    })
  })

  it('handles deeply-nested condition objects', () => {
    const out = stripBunCondition({
      '.': {
        node: {
          bun: './src/index.ts',
          import: './lib/index.js',
        },
        bun: './src/index.ts',
        import: './lib/index.js',
      },
    })
    expect(out).toEqual({
      '.': {
        node: { import: './lib/index.js' },
        import: './lib/index.js',
      },
    })
  })

  it('preserves array values verbatim (no bun stripping inside string arrays)', () => {
    const out = stripBunCondition({
      '.': {
        bun: ['./src/a.ts', './src/b.ts'],
        import: ['./lib/a.js', './lib/b.js'],
      },
    })
    expect(out).toEqual({
      '.': { import: ['./lib/a.js', './lib/b.js'] },
    })
  })

  it('returns primitives unchanged', () => {
    expect(stripBunCondition('./lib/index.js')).toBe('./lib/index.js')
    expect(stripBunCondition(null)).toBe(null)
    expect(stripBunCondition(undefined)).toBe(undefined)
    expect(stripBunCondition(42)).toBe(42)
  })

  it('@pyreon/core canonical shape — output has zero bun keys anywhere', () => {
    // Real-shape input from packages/core/core/package.json (post-stripping
    // must have ZERO `bun` keys anywhere in the tree).
    const input = {
      '.': {
        bun: './src/index.ts',
        import: './lib/index.js',
        types: './lib/types/index.d.ts',
      },
      './jsx-runtime': {
        bun: './src/jsx-runtime.ts',
        import: './lib/jsx-runtime.js',
      },
      './jsx-dev-runtime': {
        bun: './src/jsx-dev-runtime.ts',
        import: './lib/jsx-dev-runtime.js',
      },
    }
    const out = stripBunCondition(input)
    const json = JSON.stringify(out)
    expect(json).not.toContain('"bun"')
    expect(json).not.toContain('src/')
  })
})

describe('stripSrcFromFiles — keep tarball lean post-strip', () => {
  it('removes "src" from the files array, preserves lib and other entries', () => {
    expect(stripSrcFromFiles(['lib', '!lib/**/*.map', 'src', 'README.md', 'LICENSE'])).toEqual([
      'lib',
      '!lib/**/*.map',
      'README.md',
      'LICENSE',
    ])
  })

  it('also removes "./src" and "src/**" variants', () => {
    expect(stripSrcFromFiles(['lib', './src', 'README.md'])).toEqual(['lib', 'README.md'])
    expect(stripSrcFromFiles(['lib', 'src/**', 'README.md'])).toEqual(['lib', 'README.md'])
  })

  it('preserves arrays without "src"', () => {
    expect(stripSrcFromFiles(['lib', 'README.md', 'LICENSE'])).toEqual([
      'lib',
      'README.md',
      'LICENSE',
    ])
  })

  it('passes non-array values through unchanged', () => {
    expect(stripSrcFromFiles(undefined)).toBeUndefined()
    expect(stripSrcFromFiles('not-an-array')).toBe('not-an-array')
  })
})
