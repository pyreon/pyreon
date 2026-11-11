/**
 * The Loom observatory theme — the design's dark/light token sets, flat.
 *
 * Same discipline as Atlas: NO rocketstyle `ThemeDefault` augmentation (a
 * library must not mutate a consumer's global type surface); every `.theme()`
 * callback types `t` locally via the `T` alias in `./kit`.
 */
export interface LoomTokens {
  bg: string
  surface: string
  surface2: string
  text: string
  muted: string
  faint: string
  border: string
  accent: string
  /** Text ON an accent fill: ink on the bright ember, white on the paper one. */
  accentText: string
  accentSoft: string
  /** External-package hue (the design's steel blue). */
  ext: string
  edge: string
  /**
   * Resting opacity of an unlit graph edge. Per mode because the same alpha
   * reads very differently on each ground: 0.1 is a whisper on near-black but
   * vanishes entirely on the light surface.
   */
  edgeAlpha: string
  dot: string
  codeBg: string
  danger: string
  dangerSoft: string
  dangerRing: string
  ok: string
  okSoft: string
  okRing: string
  warn: string
  warnSoft: string
  warnRing: string
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return `rgba(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)},${a})`
}

/**
 * The two palettes — the Pyreon design system's ink / paper / ember values
 * (pyreon.dev, the docs, Atlas), so Loom reads as the same product in both
 * modes. Every text role passes 4.5:1 on every surface it sits on, including
 * the tinted badge and selection grounds — pinned by `tests/theme.test.ts`,
 * which computes the WCAG ratios.
 *
 * Rules the numbers enforce: small ember text in light mode is the darker
 * `#A8380A` (the dark ember is 2.9:1 on paper), and the dark-mode faint ink is
 * one step lighter than the design's fog `#8A8696`, which measured 4.4:1 on a
 * tinted row.
 */
export const ACCENT = '#FF5E1A'
export const ACCENT_ON_PAPER = '#A8380A'

export function tokens(dark: boolean): LoomTokens {
  if (dark) {
    return {
      bg: '#0A0A0E',
      surface: '#111118',
      surface2: '#181822',
      text: '#F4EFE6',
      muted: '#C9C4B8',
      faint: '#8E8A9A',
      border: '#23232E',
      accent: ACCENT,
      accentText: '#0A0A0E',
      accentSoft: hexToRgba(ACCENT, 0.12),
      ext: '#22D3EE',
      edge: '#3A3846',
      edgeAlpha: '0.14',
      dot: 'rgba(255,255,255,.045)',
      codeBg: '#0A0A0E',
      danger: '#F87171',
      dangerSoft: 'rgba(248,113,113,.10)',
      dangerRing: 'rgba(248,113,113,.40)',
      ok: '#4ADE80',
      okSoft: 'rgba(74,222,128,.08)',
      okRing: 'rgba(74,222,128,.40)',
      warn: '#FACC15',
      warnSoft: 'rgba(250,204,21,.08)',
      warnRing: 'rgba(250,204,21,.40)',
    }
  }
  return {
    bg: '#FAF5EB',
    surface: '#FFFFFF',
    surface2: '#F4EFE6',
    text: '#14141C',
    muted: '#45414F',
    // The design's light-mode dim for Loom (Loom.html overrides `--dim`).
    faint: '#4F4B5C',
    border: '#E6DFD2',
    accent: ACCENT_ON_PAPER,
    accentText: '#FFFFFF',
    accentSoft: 'rgba(232,74,15,.08)',
    ext: '#0A6E89',
    edge: '#B9B2A6',
    edgeAlpha: '0.3',
    dot: 'rgba(20,20,28,.06)',
    codeBg: '#F4EFE6',
    danger: '#B91C1C',
    dangerSoft: 'rgba(185,28,28,.07)',
    dangerRing: 'rgba(185,28,28,.30)',
    ok: '#11692F',
    okSoft: 'rgba(17,105,47,.07)',
    okRing: 'rgba(17,105,47,.30)',
    warn: '#8A5A00',
    warnSoft: 'rgba(138,90,0,.07)',
    warnRing: 'rgba(138,90,0,.30)',
  }
}

/** Every token as a `--lm-<key>` custom property, for the plain-CSS layers
 * (graph SVG, matrix grid, manifest table) that are deliberately NOT
 * rocketstyle components — see `global-css.ts` for why. */
export function cssVars(t: LoomTokens): string {
  let out = ''
  for (const [key, value] of Object.entries(t)) out += `--lm-${key}:${value};`
  return out
}
