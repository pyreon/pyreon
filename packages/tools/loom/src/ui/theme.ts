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

export const ACCENT = '#ff6b3d'

export function tokens(dark: boolean): LoomTokens {
  if (dark) {
    return {
      bg: '#0f0f14',
      surface: '#16161d',
      surface2: '#1c1c25',
      text: '#ececf0',
      muted: '#8a8a99',
      faint: '#55555f',
      border: '#26262f',
      accent: ACCENT,
      accentSoft: hexToRgba(ACCENT, 0.15),
      ext: '#5b8dd9',
      edge: '#33333f',
      edgeAlpha: '0.1',
      dot: 'rgba(255,255,255,.04)',
      codeBg: '#0a0a0e',
      danger: '#ef5f5f',
      dangerSoft: 'rgba(239,95,95,.12)',
      dangerRing: 'rgba(239,95,95,.35)',
      ok: '#3fb083',
      okSoft: 'rgba(63,176,131,.12)',
      okRing: 'rgba(63,176,131,.35)',
      warn: '#e0a53b',
      warnSoft: 'rgba(224,165,59,.12)',
      warnRing: 'rgba(224,165,59,.35)',
    }
  }
  return {
    bg: '#f6f6f8',
    surface: '#ffffff',
    surface2: '#f1f2f5',
    text: '#16171c',
    muted: '#5b6273',
    // Was #9aa0ad (2.4:1 on the light bg) — axis labels, eyebrows and the
    // table's secondary columns were near-unreadable. #7a8193 is ~4:1.
    faint: '#7a8193',
    border: '#e4e6ec',
    accent: ACCENT,
    accentSoft: hexToRgba(ACCENT, 0.1),
    ext: '#3f6fbf',
    edge: '#b3b8c5',
    edgeAlpha: '0.28',
    dot: 'rgba(20,24,40,.05)',
    codeBg: '#f1f2f5',
    danger: '#d64545',
    dangerSoft: 'rgba(214,69,69,.08)',
    dangerRing: 'rgba(214,69,69,.28)',
    // Darker than the dark-mode green: #2f9e6f on its own tint was ~3:1, so the
    // "fabric clean" pill read as disabled. #1f7f58 clears 4.5:1.
    ok: '#1f7f58',
    okSoft: 'rgba(47,158,111,.1)',
    okRing: 'rgba(47,158,111,.3)',
    warn: '#a86f0f',
    warnSoft: 'rgba(201,138,32,.1)',
    warnRing: 'rgba(201,138,32,.3)',
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
