import { describe, expect, it, vi } from 'vitest'
import {
  buildFallbackCss,
  computeAutoFallbacks,
  defaultSystemFallback,
  type FontMetrics,
  isCompleteMetrics,
  renderApplyFontFamily,
  renderAutoFallbackFaces,
  renderFontFamilyVars,
  resolveApplyToSelector,
  slugifyFamily,
  systemFallbackMetrics,
} from '../font-fallback'

// Real Ubuntu Regular metrics (unpacked from the actual woff2 — see the
// build spike). Lets us exercise the capsize override math deterministically
// without a network fetch or a committed font binary.
const UBUNTU: FontMetrics = {
  familyName: 'Ubuntu',
  category: 'sans-serif',
  ascent: 932,
  descent: -189,
  lineGap: 28,
  unitsPerEm: 1000,
  xWidthAvg: 459,
}

describe('slugifyFamily', () => {
  it('lowercases + hyphenates multi-word families', () => {
    expect(slugifyFamily('JetBrains Mono')).toBe('jetbrains-mono')
    expect(slugifyFamily('Ubuntu')).toBe('ubuntu')
    expect(slugifyFamily('Noto Sans JP')).toBe('noto-sans-jp')
  })
  it('trims + collapses non-alphanumerics, no leading/trailing dashes', () => {
    expect(slugifyFamily('  IBM Plex Sans  ')).toBe('ibm-plex-sans')
    expect(slugifyFamily('Source Code Pro!')).toBe('source-code-pro')
  })
})

describe('isCompleteMetrics', () => {
  it('accepts a metrics object carrying every field createFontStack needs', () => {
    expect(isCompleteMetrics(UBUNTU)).toBe(true)
  })
  it('rejects partial / malformed metrics (missing the fields the override math reads)', () => {
    expect(isCompleteMetrics(null)).toBe(false)
    expect(isCompleteMetrics({})).toBe(false)
    expect(isCompleteMetrics({ ...UBUNTU, lineGap: undefined })).toBe(false)
    expect(isCompleteMetrics({ ...UBUNTU, xWidthAvg: undefined })).toBe(false)
    expect(isCompleteMetrics({ ...UBUNTU, unitsPerEm: 0 })).toBe(false)
    expect(isCompleteMetrics({ ...UBUNTU, familyName: '' })).toBe(false)
  })
})

describe('defaultSystemFallback', () => {
  it('maps category to an appropriate system font', () => {
    expect(defaultSystemFallback('serif')).toBe('Times New Roman')
    expect(defaultSystemFallback('monospace')).toBe('Courier New')
    expect(defaultSystemFallback('sans-serif')).toBe('Arial')
    expect(defaultSystemFallback(undefined)).toBe('Arial')
  })
})

describe('systemFallbackMetrics', () => {
  it('resolves a known system font (Arial) from capsize', async () => {
    const m = await systemFallbackMetrics('Arial')
    expect(m).not.toBeNull()
    expect(m!.unitsPerEm).toBeGreaterThan(0)
    expect(typeof m!.ascent).toBe('number')
  })
  it('returns null for an unknown system font', async () => {
    expect(await systemFallbackMetrics('Comic Nonexistent')).toBeNull()
  })
})

describe('buildFallbackCss (the next/font override math via capsize)', () => {
  it('produces a size-adjusted @font-face + a stack with the fallback in it', async () => {
    const r = await buildFallbackCss(UBUNTU, 'Arial')
    expect(r).not.toBeNull()
    expect(r!.family).toBe('Ubuntu')
    expect(r!.slug).toBe('ubuntu')
    // The stack MUST contain the fallback family (the cascade fix) + the system font.
    expect(r!.fontFamily).toContain('Ubuntu')
    expect(r!.fontFamily).toContain('"Ubuntu Fallback"')
    expect(r!.fontFamily).toContain('Arial')
    // The @font-face MUST carry the four metric overrides — that's what kills CLS.
    expect(r!.fontFaces).toContain('font-family: "Ubuntu Fallback"')
    expect(r!.fontFaces).toMatch(/size-adjust:\s*[\d.]+%/)
    expect(r!.fontFaces).toMatch(/ascent-override:\s*[\d.]+%/)
    expect(r!.fontFaces).toMatch(/descent-override:\s*[\d.]+%/)
    expect(r!.fontFaces).toMatch(/line-gap-override:\s*[\d.]+%/)
  })
  it('returns null for an unresolvable system fallback (graceful)', async () => {
    expect(await buildFallbackCss(UBUNTU, 'Nonexistent Font')).toBeNull()
  })
})

describe('resolveApplyToSelector (fallbackAdjust.applyTo)', () => {
  it('boolean / undefined fallbackAdjust → no binding (var-only)', () => {
    expect(resolveApplyToSelector(undefined)).toBeNull()
    expect(resolveApplyToSelector(true)).toBeNull()
    expect(resolveApplyToSelector(false)).toBeNull()
  })
  it('{ applyTo: true } → defaults to body', () => {
    expect(resolveApplyToSelector({ applyTo: true })).toBe('body')
  })
  it('{ applyTo: "<selector>" } → that selector verbatim', () => {
    expect(resolveApplyToSelector({ applyTo: ':root' })).toBe(':root')
    expect(resolveApplyToSelector({ applyTo: '.app' })).toBe('.app')
    expect(resolveApplyToSelector({ applyTo: '  body  ' })).toBe('body')
  })
  it('{ applyTo: false / "" } or no applyTo → null', () => {
    expect(resolveApplyToSelector({ applyTo: false })).toBeNull()
    expect(resolveApplyToSelector({ applyTo: '' })).toBeNull()
    expect(resolveApplyToSelector({})).toBeNull()
  })
})

describe('renderApplyFontFamily', () => {
  const fb = (slug: string) => ({
    family: slug,
    slug,
    fontFaces: '',
    fontFamily: `X, "X Fallback", Arial`,
  })
  it('binds the selector to the PRIMARY (first) family’s var', () => {
    const css = renderApplyFontFamily([fb('ubuntu'), fb('jetbrains-mono')], 'body')
    expect(css).toBe('body { font-family: var(--pyreon-font-ubuntu); }')
  })
  it('no selector → no rule (var-only)', () => {
    expect(renderApplyFontFamily([fb('ubuntu')], null)).toBe('')
  })
  it('no fallbacks → no rule', () => {
    expect(renderApplyFontFamily([], 'body')).toBe('')
  })
})

describe('renderFontFamilyVars / renderAutoFallbackFaces', () => {
  const fb = {
    family: 'Ubuntu',
    slug: 'ubuntu',
    fontFaces: '@font-face { font-family: "Ubuntu Fallback"; }',
    fontFamily: 'Ubuntu, "Ubuntu Fallback", Arial',
  }
  it('emits a :root var that puts the fallback in the cascade', () => {
    const css = renderFontFamilyVars([fb])
    expect(css).toContain(':root {')
    expect(css).toContain('--pyreon-font-ubuntu: Ubuntu, "Ubuntu Fallback", Arial;')
  })
  it('empty input → empty output (no stray :root)', () => {
    expect(renderFontFamilyVars([])).toBe('')
  })
  it('concatenates each family’s @font-face blocks', () => {
    expect(renderAutoFallbackFaces([fb])).toContain('Ubuntu Fallback')
  })
})

describe('computeAutoFallbacks', () => {
  it('CDN mode (no buffers): resolves metrics from capsize precomputed table', async () => {
    const out = await computeAutoFallbacks({ families: ['Ubuntu'] })
    expect(out.length).toBe(1)
    expect(out[0]!.slug).toBe('ubuntu')
    expect(out[0]!.fontFamily).toContain('"Ubuntu Fallback"')
  })
  it('skips families with a manual fallback (explicit wins)', async () => {
    const out = await computeAutoFallbacks({
      families: ['Ubuntu'],
      skipFamilies: new Set(['ubuntu']),
    })
    expect(out).toEqual([])
  })
  it('warns + skips a family whose metrics cannot be resolved (never throws)', async () => {
    const warn = vi.fn()
    const out = await computeAutoFallbacks({
      families: ['Totally Made Up Font 9000'],
      warn,
    })
    expect(out).toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]![0]).toContain('Totally Made Up Font 9000')
  })
  it('de-dupes a family listed twice', async () => {
    const out = await computeAutoFallbacks({ families: ['Ubuntu', 'Ubuntu'] })
    expect(out.length).toBe(1)
  })

  // GROUND-TRUTH buffer path: unpack a real downloaded woff2 and assert
  // the metrics come from the bytes (not the precomputed table). Network
  // (Google Fonts) → opt-in via PYREON_FONT_E2E=1 so CI never flakes on it;
  // the deterministic precomputed-path test above is the always-on gate.
  it.skipIf(!process.env.PYREON_FONT_E2E)(
    'self-host path: unpacks the actual woff2 for ground-truth metrics',
    async () => {
      const cssRes = await fetch(
        'https://fonts.googleapis.com/css2?family=Ubuntu:wght@400&display=swap',
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        },
      )
      const css = await cssRes.text()
      const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/)?.[1]
      expect(url).toBeTruthy()
      const buf = new Uint8Array(await (await fetch(url!)).arrayBuffer())
      const out = await computeAutoFallbacks({ families: ['Ubuntu'], fontBuffers: [buf] })
      expect(out.length).toBe(1)
      expect(out[0]!.fontFaces).toMatch(/size-adjust:\s*[\d.]+%/)
      expect(out[0]!.fontFamily).toContain('"Ubuntu Fallback"')
    },
  )
})
