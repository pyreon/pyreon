/**
 * The chrome palettes pass WCAG AA (4.5:1) for every text role on every
 * surface it sits on, in BOTH modes — computed, not asserted in a comment.
 *
 * Surfaces include the tinted ones a row or chip can sit on: the selected-row
 * `glow` and the hover `sheen`, each composited over the panel surfaces.
 */
import { describe, expect, it } from 'vitest'
import { composite, contrastRatio, parseColor } from '../contrast'
import {
  CHROME_PALETTES,
  CHROME_TOKENS,
  type ChromeRole,
  chromeThemeCss,
  chromeVar,
  resolveThemeMode,
  themeBootScript,
} from '../theme'

const TEXT: ChromeRole[] = ['text', 'muted', 'faint', 'accent', 'ok', 'warn', 'danger', 'link']
const SURFACES: ChromeRole[] = ['bg', 'surface', 'surface2']

describe('chrome palette contrast', () => {
  for (const mode of ['dark', 'light'] as const) {
    const p = CHROME_PALETTES[mode]
    const surfaces: [string, ReturnType<typeof parseColor>][] = []
    for (const s of SURFACES) {
      const base = parseColor(p[s])
      surfaces.push([s, base])
      surfaces.push([`glow on ${s}`, composite(parseColor(p.glow), base)])
      surfaces.push([`sheen on ${s}`, composite(parseColor(p.sheen), base)])
    }

    for (const role of TEXT) {
      it(`${mode}: ${role} text ≥ 4.5:1 on every surface`, () => {
        for (const [name, bg] of surfaces) {
          const ratio = contrastRatio(p[role], bg)
          expect(ratio, `${role} on ${name} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }

    it(`${mode}: text on an accent fill ≥ 4.5:1`, () => {
      expect(contrastRatio(p.accentText, p.accent)).toBeGreaterThanOrEqual(4.5)
    })

    it(`${mode}: code on the well ≥ 4.5:1`, () => {
      expect(contrastRatio(p.codeFg, p.well)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('fails a pair that really fails (the check is not vacuous)', () => {
    // The dark ember on paper — the reason light mode has its own accent.
    expect(contrastRatio(CHROME_PALETTES.dark.accent, CHROME_PALETTES.light.bg)).toBeLessThan(4.5)
    // White on the dark ember — the reason accent text is ink.
    expect(contrastRatio('#FFFFFF', CHROME_PALETTES.dark.accent)).toBeLessThan(4.5)
  })
})

describe('chrome tokens', () => {
  it('both palettes define the same roles', () => {
    expect(Object.keys(CHROME_PALETTES.light).sort()).toEqual(Object.keys(CHROME_PALETTES.dark).sort())
  })

  it('every colour token is a custom-property reference, never a raw value', () => {
    const colourKeys = ['bg', 'surface', 'surface2', 'text', 'muted', 'faint', 'border', 'accent', 'ok', 'warn', 'danger'] as const
    for (const k of colourKeys) expect(CHROME_TOKENS[k]).toMatch(/^var\(--atlas-/)
    expect(CHROME_TOKENS.hairline).toBe('1px solid var(--atlas-line)')
  })

  it('emits every role for both modes, light keyed on data-theme', () => {
    const css = chromeThemeCss()
    expect(chromeVar('codeFg')).toBe('--atlas-code-fg')
    for (const role of Object.keys(CHROME_PALETTES.dark) as ChromeRole[]) {
      expect(css).toContain(`${chromeVar(role)}:${CHROME_PALETTES.dark[role]};`)
      expect(css).toContain(`${chromeVar(role)}:${CHROME_PALETTES.light[role]};`)
    }
    expect(css).toContain(':root[data-theme="light"]{')
    expect(css).toContain('@media (prefers-color-scheme: light){:root:not([data-theme])')
  })
})

describe('the shared theme preference', () => {
  it('an explicit stored choice wins over the OS', () => {
    expect(resolveThemeMode('light', false)).toBe('light')
    expect(resolveThemeMode('dark', true)).toBe('dark')
  })

  it('falls back to the OS preference, then dark', () => {
    expect(resolveThemeMode(null, true)).toBe('light')
    expect(resolveThemeMode(undefined, false)).toBe('dark')
    expect(resolveThemeMode('sepia', true)).toBe('light')
  })

  it('the boot script applies the same rule before first paint', () => {
    const run = (stored: string | null, prefersLight: boolean) => {
      const attrs: Record<string, string> = {}
      const fn = new Function('localStorage', 'window', 'matchMedia', 'document', themeBootScript())
      const mm = () => ({ matches: prefersLight })
      fn(
        { getItem: () => stored },
        { matchMedia: mm },
        mm,
        { documentElement: { setAttribute: (k: string, val: string) => (attrs[k] = val) } },
      )
      return attrs['data-theme']
    }
    expect(run('light', false)).toBe('light')
    expect(run('dark', true)).toBe('dark')
    expect(run(null, true)).toBe('light')
    expect(run(null, false)).toBe('dark')
  })

  it('the boot script survives storage that throws', () => {
    const attrs: Record<string, string> = {}
    const fn = new Function('localStorage', 'window', 'matchMedia', 'document', themeBootScript())
    const mm = () => ({ matches: false })
    fn(
      {
        getItem: () => {
          throw new Error('blocked')
        },
      },
      { matchMedia: mm },
      mm,
      { documentElement: { setAttribute: (k: string, val: string) => (attrs[k] = val) } },
    )
    expect(attrs['data-theme']).toBe('dark')
  })
})
