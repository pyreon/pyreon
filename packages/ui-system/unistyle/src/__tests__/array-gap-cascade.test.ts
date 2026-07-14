import { describe, expect, it } from 'vitest'
import makeItResponsive from '../responsive/makeItResponsive'
import normalizeTheme from '../responsive/normalizeTheme'
import styles from '../styles/styles/index'

/**
 * Regression: mobile-first array GAP semantics.
 *
 * A `null`/`undefined` slot in a mobile-first array (`['red', null, 'blue']`)
 * is a "skip this breakpoint" gap — it must inherit the PREVIOUS breakpoint's
 * value (mobile-first `min-width` cascade), exactly like a breakpoint object
 * with a missing key. styled-system and theme-ui both define null-in-array
 * this way.
 *
 * The pre-fix `handleArrayCb` did `arr[i] ?? arr[arr.length - 1]` — it filled
 * EVERY gap with the LAST array element, so:
 *   - `['red', null, 'blue']` turned blue at `sm` instead of `md`
 *     (one breakpoint too EARLY — a user-visible wrong-color bug), and
 *   - `[a, null, b, null, null]` (trailing element null) dropped interior
 *     gaps to `null` (no declaration at all).
 * The fix forward-fills from the previous resolved breakpoint, so arrays and
 * objects share ONE cascade semantic.
 */

const bpKeys = ['xs', 'sm', 'md', 'lg', 'xl']

describe('normalizeTheme — mobile-first array gaps forward-fill from previous breakpoint', () => {
  it('interior null gap inherits the PREVIOUS value, not the last element', () => {
    const result = normalizeTheme({ theme: { color: ['red', null, 'blue'] }, breakpoints: bpKeys })
    // sm is a gap → inherits xs (red), NOT the last element (blue).
    expect(result.color).toEqual({ xs: 'red', sm: 'red', md: 'blue', lg: 'blue', xl: 'blue' })
  })

  it('arrays and breakpoint objects with the same shape normalize identically', () => {
    const arr = normalizeTheme({ theme: { color: ['red', null, 'blue'] }, breakpoints: bpKeys })
    const obj = normalizeTheme({ theme: { color: { xs: 'red', md: 'blue' } }, breakpoints: bpKeys })
    expect(arr.color).toEqual(obj.color)
  })

  it('preserves the trailing-fill contract (array shorter than breakpoints)', () => {
    // Unchanged behavior: [12, 14] fills md/lg/xl with the last value (14).
    const result = normalizeTheme({ theme: { fontSize: [12, 14] }, breakpoints: bpKeys })
    expect(result.fontSize).toEqual({ xs: 12, sm: 14, md: 14, lg: 14, xl: 14 })
  })

  it('a trailing null element no longer poisons interior gaps', () => {
    const result = normalizeTheme({
      theme: { color: ['red', null, 'blue', null, null] },
      breakpoints: bpKeys,
    })
    expect(result.color).toEqual({ xs: 'red', sm: 'red', md: 'blue', lg: 'blue', xl: 'blue' })
  })

  it('does not treat 0 / false as a gap (real falsy values survive)', () => {
    expect(
      normalizeTheme({ theme: { opacity: [0, null, 1] }, breakpoints: bpKeys }).opacity,
    ).toEqual({ xs: 0, sm: 0, md: 1, lg: 1, xl: 1 })
    expect(
      normalizeTheme({ theme: { block: [true, false, true] }, breakpoints: bpKeys }).block,
    ).toEqual({ xs: true, sm: false, md: true, lg: true, xl: true })
  })
})

// ─── End-to-end through the full responsive engine ──────────────────────────
// normalize → transform → optimize → delta → @media wrap, using the REAL
// `styles` engine (not a mock stringifier) so we assert the emitted CSS.

const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

/** A media map that tags each non-base breakpoint's output so we can assert
 *  WHICH `@media` block a declaration lands in. */
const makeMedia = (sorted: string[]) => {
  const media: Record<string, (s: TemplateStringsArray, ...v: any[]) => string> = {}
  for (const bp of sorted) {
    media[bp] =
      bp === 'xs'
        ? mockCss
        : (s: TemplateStringsArray, ...v: any[]) => `@${bp}{${mockCss(s, ...v)}}`
  }
  return media
}

describe('makeItResponsive — array gap emits the color change at the RIGHT breakpoint', () => {
  const sorted = ['xs', 'sm', 'md', 'lg', 'xl']

  const run = (internalTheme: Record<string, unknown>) => {
    const responsive = makeItResponsive({
      theme: internalTheme,
      css: mockCss,
      styles,
      normalize: true,
    })
    const result = responsive({
      theme: {
        rootSize: 16,
        breakpoints: { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 },
        __PYREON__: { sortedBreakpoints: sorted, media: makeMedia(sorted) },
      },
    }) as unknown[]
    return result.map(String).join('\n')
  }

  it("color: ['red', null, 'blue'] turns blue at md, not sm", () => {
    const out = run({ color: ['red', null, 'blue'] })
    // Base breakpoint (xs) carries red.
    expect(out).toContain('color: red;')
    // The blue delta must be inside the `@md` block…
    expect(out).toContain('@md{color: blue;}')
    // …and there must be NO `@sm` block emitting blue (the pre-fix bug).
    expect(out).not.toContain('@sm{color: blue;}')
  })

  it('array and object inputs produce identical emitted CSS', () => {
    expect(run({ color: ['red', null, 'blue'] })).toBe(run({ color: { xs: 'red', md: 'blue' } }))
  })
})
