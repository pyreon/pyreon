import { describe, expect, it } from 'vitest'
import {
  filterCssBySubsets,
  fontCacheKey,
  fontVariables,
  googleFontsUrl,
  parseGoogleFamily,
  pickPreloadHrefs,
  resolveGoogleFont,
} from '../font'

describe('parseGoogleFamily', () => {
  it('parses family with weights', () => {
    const result = parseGoogleFamily('Inter:wght@400;500;700')
    expect(result.family).toBe('Inter')
    expect(result.variable).toBe(false)
    expect(result.italic).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 500, 700])
    }
  })

  it('parses family without weight spec', () => {
    const result = parseGoogleFamily('Roboto')
    expect(result.family).toBe('Roboto')
    expect(result.variable).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400])
    }
  })

  it('parses family with italic', () => {
    const result = parseGoogleFamily('Lora:ital,wght@400;700')
    expect(result.family).toBe('Lora')
    expect(result.italic).toBe(true)
    expect(result.variable).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 700])
    }
  })

  it('trims whitespace from family name', () => {
    const result = parseGoogleFamily('  Open Sans :wght@300')
    expect(result.family).toBe('Open Sans')
    if (!result.variable) {
      expect(result.weights).toEqual([300])
    }
  })

  it('parses variable font with weight range', () => {
    const result = parseGoogleFamily('Inter:wght@100..900')
    expect(result.family).toBe('Inter')
    expect(result.variable).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([100, 900])
    }
  })

  it('parses variable font with italic', () => {
    const result = parseGoogleFamily('Inter:ital,wght@100..900')
    expect(result.family).toBe('Inter')
    expect(result.variable).toBe(true)
    expect(result.italic).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([100, 900])
    }
  })

  it('parses variable font with partial range', () => {
    const result = parseGoogleFamily('Roboto Flex:wght@400..700')
    expect(result.family).toBe('Roboto Flex')
    expect(result.variable).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([400, 700])
    }
  })
})

describe('resolveGoogleFont', () => {
  it('passes through string to parseGoogleFamily', () => {
    const result = resolveGoogleFont('Inter:wght@400;700')
    expect(result.family).toBe('Inter')
    expect(result.variable).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 700])
    }
  })

  it('resolves static object config', () => {
    const result = resolveGoogleFont({
      family: 'Inter',
      weights: [400, 500, 700],
    })
    expect(result.family).toBe('Inter')
    expect(result.variable).toBe(false)
    expect(result.italic).toBe(false)
    if (!result.variable) {
      expect(result.weights).toEqual([400, 500, 700])
    }
  })

  it('resolves variable object config', () => {
    const result = resolveGoogleFont({
      family: 'Inter',
      variable: true,
      weightRange: [100, 900],
    })
    expect(result.family).toBe('Inter')
    expect(result.variable).toBe(true)
    if (result.variable) {
      expect(result.weightRange).toEqual([100, 900])
    }
  })

  it('resolves object config with italic', () => {
    const result = resolveGoogleFont({
      family: 'Lora',
      weights: [400, 700],
      italic: true,
    })
    expect(result.italic).toBe(true)
  })

  it('defaults italic to false for objects', () => {
    const result = resolveGoogleFont({ family: 'Inter', weights: [400] })
    expect(result.italic).toBe(false)
  })
})

describe('googleFontsUrl', () => {
  it('generates correct URL for single family', () => {
    const url = googleFontsUrl([
      {
        family: 'Inter',
        weights: [400, 700],
        italic: false,
        variable: false as const,
      },
    ])
    expect(url).toContain('fonts.googleapis.com/css2')
    expect(url).toContain('family=Inter:wght@400;700')
    expect(url).toContain('display=swap')
  })

  it('generates correct URL for multiple families', () => {
    const url = googleFontsUrl([
      {
        family: 'Inter',
        weights: [400],
        italic: false,
        variable: false as const,
      },
      {
        family: 'JetBrains Mono',
        weights: [400],
        italic: false,
        variable: false as const,
      },
    ])
    expect(url).toContain('family=Inter:wght@400')
    expect(url).toContain('family=JetBrains+Mono:wght@400')
  })

  it('handles italic families', () => {
    const url = googleFontsUrl([
      {
        family: 'Lora',
        weights: [400, 700],
        italic: true,
        variable: false as const,
      },
    ])
    expect(url).toContain('family=Lora:ital,wght@0,400;1,400;0,700;1,700')
  })

  it('uses custom display value', () => {
    const url = googleFontsUrl(
      [
        {
          family: 'Inter',
          weights: [400],
          italic: false,
          variable: false as const,
        },
      ],
      'optional',
    )
    expect(url).toContain('display=optional')
  })

  it('generates variable font URL with weight range', () => {
    const url = googleFontsUrl([
      {
        family: 'Inter',
        italic: false,
        variable: true as const,
        weightRange: [100, 900],
      },
    ])
    expect(url).toContain('family=Inter:wght@100..900')
  })

  it('generates variable font URL with italic and range', () => {
    const url = googleFontsUrl([
      {
        family: 'Inter',
        italic: true,
        variable: true as const,
        weightRange: [100, 900],
      },
    ])
    expect(url).toContain('family=Inter:ital,wght@0,100..900;1,100..900')
  })

  it('mixes static and variable families', () => {
    const url = googleFontsUrl([
      {
        family: 'Inter',
        italic: false,
        variable: true as const,
        weightRange: [100, 900],
      },
      {
        family: 'JetBrains Mono',
        weights: [400, 700],
        italic: false,
        variable: false as const,
      },
    ])
    expect(url).toContain('family=Inter:wght@100..900')
    expect(url).toContain('family=JetBrains+Mono:wght@400;700')
  })
})

describe('fontVariables', () => {
  it('generates CSS variables', () => {
    const css = fontVariables({
      sans: '"Inter", system-ui, sans-serif',
      mono: '"JetBrains Mono", monospace',
    })
    expect(css).toContain(':root {')
    expect(css).toContain('--font-sans: "Inter", system-ui, sans-serif;')
    expect(css).toContain('--font-mono: "JetBrains Mono", monospace;')
    expect(css).toContain('}')
  })
})

describe('filterCssBySubsets', () => {
  // Mirrors the real css2 shape: a `/* <subset> */` comment label
  // immediately before each @font-face, with its own unicode-range +
  // gstatic woff2 url. One weight, four subsets.
  const CSS2 = `/* cyrillic-ext */
@font-face {
  font-family: 'Ubuntu';
  font-weight: 300;
  src: url(https://fonts.gstatic.com/s/ubuntu/cyr-ext.woff2) format('woff2');
  unicode-range: U+0460-052F, U+1C80-1C88;
}
/* greek */
@font-face {
  font-family: 'Ubuntu';
  font-weight: 300;
  src: url(https://fonts.gstatic.com/s/ubuntu/greek.woff2) format('woff2');
  unicode-range: U+0370-03FF;
}
/* latin-ext */
@font-face {
  font-family: 'Ubuntu';
  font-weight: 300;
  src: url(https://fonts.gstatic.com/s/ubuntu/lat-ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+1E00-1EFF;
}
/* latin */
@font-face {
  font-family: 'Ubuntu';
  font-weight: 300;
  src: url(https://fonts.gstatic.com/s/ubuntu/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`

  const subsetsIn = (css: string) => [
    ...new Set([...css.matchAll(/\/\*\s*([\w-]+)\s*\*\//g)].map((m) => m[1])),
  ]

  it('keeps only allowlisted subsets and drops the rest', () => {
    const out = filterCssBySubsets(CSS2, ['latin'])
    expect(subsetsIn(out)).toEqual(['latin'])
    expect(out).toContain('lat.woff2')
    expect(out).not.toContain('cyr-ext.woff2')
    expect(out).not.toContain('greek.woff2')
    expect(out).not.toContain('lat-ext.woff2')
  })

  it('keeps a multi-subset allowlist', () => {
    const out = filterCssBySubsets(CSS2, ['latin', 'latin-ext'])
    expect(subsetsIn(out)).toEqual(['latin-ext', 'latin'])
    expect(out).toContain('lat.woff2')
    expect(out).toContain('lat-ext.woff2')
    expect(out).not.toContain('greek.woff2')
  })

  it('preserves the full @font-face body of kept blocks', () => {
    const out = filterCssBySubsets(CSS2, ['latin'])
    expect(out).toContain('unicode-range: U+0000-00FF, U+0131;')
    expect(out).toContain("font-family: 'Ubuntu';")
    expect(out).toContain('font-weight: 300;')
  })

  it('keeps EVERY block matching the allowlist across multiple weights', () => {
    const twoWeights =
      CSS2 +
      `/* latin */
@font-face {
  font-family: 'Ubuntu';
  font-weight: 500;
  src: url(https://fonts.gstatic.com/s/ubuntu/lat-500.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`
    const out = filterCssBySubsets(twoWeights, ['latin'])
    expect(out).toContain('lat.woff2')
    expect(out).toContain('lat-500.woff2')
    expect((out.match(/@font-face/g) ?? []).length).toBe(2)
  })

  it('filters variable-font blocks the same way (per-subset, weight-range src)', () => {
    const variable = `/* cyrillic */
@font-face {
  font-family: 'Inter';
  font-weight: 100 900;
  src: url(https://fonts.gstatic.com/s/inter/cyr.woff2) format('woff2');
  unicode-range: U+0400-045F;
}
/* latin */
@font-face {
  font-family: 'Inter';
  font-weight: 100 900;
  src: url(https://fonts.gstatic.com/s/inter/lat.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
`
    const out = filterCssBySubsets(variable, ['latin'])
    expect(out).toContain('inter/lat.woff2')
    expect(out).not.toContain('inter/cyr.woff2')
    expect(out).toContain('font-weight: 100 900;')
  })

  it('FAIL-SAFE: an allowlist matching no subset keeps ALL subsets (never fontless)', () => {
    const out = filterCssBySubsets(CSS2, ['lateen']) // typo
    expect(subsetsIn(out)).toEqual(['cyrillic-ext', 'greek', 'latin-ext', 'latin'])
    expect(out).toContain('cyr-ext.woff2')
  })

  it('FAIL-SAFE: CSS with no recognizable labels is returned unchanged', () => {
    const noLabels = `@font-face { src: url(x.woff2) format('woff2'); }`
    expect(filterCssBySubsets(noLabels, ['latin'])).toBe(noLabels)
  })

  it('an empty allowlist is a no-op (keeps all)', () => {
    expect(filterCssBySubsets(CSS2, [])).toBe(CSS2)
  })

  it('parses very large input in linear time (no pathological backtracking)', () => {
    // The label-index scan is O(n). This is a forward-looking guard: it does
    // NOT distinguish the old lazy-body-plus-look-ahead form (V8 happens not
    // to blow up on this particular input — CodeQL flags that shape
    // statically, and the real fix is removing it), but it WOULD catch a
    // future rewrite reintroducing a genuinely super-linear pattern (many do
    // blow up in V8).
    const large = '/*-*/'.repeat(50_000)
    const start = performance.now()
    const out = filterCssBySubsets(large, ['latin'])
    expect(performance.now() - start).toBeLessThan(500)
    // None of the bogus `-` labels match `latin` → fail-safe keeps input.
    expect(out).toBe(large)
  })
})

describe('pickPreloadHrefs', () => {
  // Rewritten (self-hosted) CSS: local /assets/fonts/ urls, subsets ordered
  // as css2 returns them — cyrillic-ext FIRST, latin LAST.
  const SELF_HOSTED = `/* cyrillic-ext */
@font-face { font-family: 'Ubuntu'; src: url(/assets/fonts/cyr-ext.woff2) format('woff2'); }
/* greek */
@font-face { font-family: 'Ubuntu'; src: url(/assets/fonts/greek.woff2) format('woff2'); }
/* latin-ext */
@font-face { font-family: 'Ubuntu'; src: url(/assets/fonts/lat-ext.woff2) format('woff2'); }
/* latin */
@font-face { font-family: 'Ubuntu'; src: url(/assets/fonts/lat.woff2) format('woff2'); }
`

  it('preloads the LATIN file, not the cyrillic-ext file css2 returns first', () => {
    expect(pickPreloadHrefs(SELF_HOSTED, 'latin', 1)).toEqual(['/assets/fonts/lat.woff2'])
  })

  it('honors a non-latin primary subset', () => {
    expect(pickPreloadHrefs(SELF_HOSTED, 'greek', 1)).toEqual(['/assets/fonts/greek.woff2'])
  })

  it('caps the result at `limit` (the original one-per-family budget)', () => {
    expect(pickPreloadHrefs(SELF_HOSTED, 'latin', 1)).toHaveLength(1)
    expect(pickPreloadHrefs(SELF_HOSTED, 'latin', 0)).toEqual([])
  })

  it('FALLS BACK to the first files when the primary subset is absent', () => {
    // No `vietnamese` block → fall back to the first `limit` files, in order.
    expect(pickPreloadHrefs(SELF_HOSTED, 'vietnamese', 1)).toEqual(['/assets/fonts/cyr-ext.woff2'])
  })

  it('composes with subset filtering (latin-only CSS still preloads latin)', () => {
    const latinOnly = filterCssBySubsets(SELF_HOSTED, ['latin'])
    expect(pickPreloadHrefs(latinOnly, 'latin', 1)).toEqual(['/assets/fonts/lat.woff2'])
  })

  it('returns [] when there are no local font urls', () => {
    expect(pickPreloadHrefs("/* latin */\n@font-face { font-family: X; }", 'latin', 2)).toEqual([])
  })
})

describe('fontCacheKey', () => {
  const url = 'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap'

  it('is stable for the same url + subsets', () => {
    expect(fontCacheKey(url, ['latin'])).toBe(fontCacheKey(url, ['latin']))
  })

  it('DIFFERS when only the subset allowlist differs (the collision fix)', () => {
    expect(fontCacheKey(url, ['latin'])).not.toBe(fontCacheKey(url, ['latin', 'cyrillic']))
    expect(fontCacheKey(url, ['latin'])).not.toBe(fontCacheKey(url))
  })

  it('treats undefined and an empty allowlist as the same (both keep all)', () => {
    expect(fontCacheKey(url, undefined)).toBe(fontCacheKey(url, []))
  })

  it('is filesystem-safe (base64url — no / or +)', () => {
    expect(fontCacheKey(url, ['latin', 'latin-ext'])).not.toMatch(/[/+]/)
  })
})
