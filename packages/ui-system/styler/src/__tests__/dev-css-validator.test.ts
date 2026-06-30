import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSheet } from '../sheet'

// Dev-mode resolved-CSS validator — the safety net for CSS-variable themes.
// Var-leaf tokens are plain strings, so the two legacy hazards produce
// silently-invalid CSS the browser drops:
//   1. JS arithmetic:  t.spacing.small * 2  →  'NaN' / 'NaNrem'
//   2. string concat:  t.color.x + '99'     →  'var(--px-…)99'
// The validator warns ONCE per unique finding, naming the declaration.

describe('styler dev CSS validator', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns on NaN values (legacy arithmetic on a var token)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('padding: NaNrem;')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'NaN' value"))
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Pyreon]'))
  })

  it('warns on undefined/null values', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('color: undefined;')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'undefined'/'null' value"))
  })

  it('warns on malformed var() concatenation (alpha-suffix hack)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('background: var(--px-color-primary)99;')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('malformed var() concatenation'))
  })

  it('does NOT warn on valid var()/calc() usage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('padding: var(--px-spacing-small);')
    sheet.insert('width: calc(var(--px-spacing-small) * var(--px-ratio-medium));')
    sheet.insert('background: color-mix(in srgb, var(--px-c) 50%, transparent);')
    sheet.insert('font-family: Banana, sans-serif;') // 'Nan' inside a word must not match
    expect(warn).not.toHaveBeenCalled()
  })

  it('dedupes — the same offending declaration warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('margin: NaNpx; color: red;')
    // different cssText, same shape → still a distinct finding (different snippet)
    sheet.insert('margin: NaNpx; color: red;')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

// CLS footgun: `content-visibility: auto` reserves no box without
// `contain-intrinsic-size` — the runtime safety net complementing the static
// `pyreon/content-visibility-needs-intrinsic-size` lint rule (catches the
// case where the CSS is computed at runtime, which the static rule can't see).
describe('styler dev CSS validator — content-visibility CLS', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns on content-visibility:auto without contain-intrinsic-size', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('display: block; content-visibility: auto;')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("'content-visibility: auto' without 'contain-intrinsic-size'"),
    )
  })

  it('does NOT warn when contain-intrinsic-size is in the same rule', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('content-visibility: auto; contain-intrinsic-size: auto 800px;')
    expect(warn).not.toHaveBeenCalled()
  })

  it('does NOT warn when a contain-intrinsic-* longhand is present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('content-visibility: auto; contain-intrinsic-height: 800px;')
    expect(warn).not.toHaveBeenCalled()
  })

  it('does NOT warn on content-visibility: hidden / visible', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sheet = createSheet()
    sheet.insert('content-visibility: hidden;')
    sheet.insert('content-visibility: visible;')
    expect(warn).not.toHaveBeenCalled()
  })
})
