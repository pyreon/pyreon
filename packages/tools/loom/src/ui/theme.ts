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
    muted: '#666d7d',
    faint: '#9aa0ad',
    border: '#e4e6ec',
    accent: ACCENT,
    accentSoft: hexToRgba(ACCENT, 0.1),
    ext: '#3f6fbf',
    edge: '#d3d6de',
    dot: 'rgba(20,24,40,.05)',
    codeBg: '#f1f2f5',
    danger: '#d64545',
    dangerSoft: 'rgba(214,69,69,.08)',
    dangerRing: 'rgba(214,69,69,.28)',
    ok: '#2f9e6f',
    okSoft: 'rgba(47,158,111,.1)',
    okRing: 'rgba(47,158,111,.3)',
    warn: '#c98a20',
    warnSoft: 'rgba(201,138,32,.1)',
    warnRing: 'rgba(201,138,32,.3)',
  }
}
