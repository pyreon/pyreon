/** The Prism theme system — 4 brand themes × light/dark, as flat token objects. */

export interface ThemeTokens {
  bg: string
  surface: string
  surface2: string
  chrome: string
  text: string
  muted: string
  faint: string
  border: string
  accent: string
  accent2: string
  accentSoft: string
  accentText: string
  ok: string
  okSoft: string
  warn: string
  danger: string
  dotColor: string
  codeBg: string
  codeFg: string
}

export interface BrandTheme {
  id: string
  name: string
  accent: string
}

export const THEMES: readonly BrandTheme[] = [
  { id: 'ember', name: 'Ember', accent: '#ff6b3d' },
  { id: 'aurora', name: 'Aurora', accent: '#6d5efc' },
  { id: 'forest', name: 'Forest', accent: '#2f9e6f' },
  { id: 'contrast', name: 'Contrast', accent: '#141824' },
]

export function hexToRgba(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${a})`
}

const OK = '#2f9e6f'
const WARN = '#e0a53b'
const DANGER = '#e05b5b'

/** Resolve the full token set for a brand + mode. */
export function tokens(brand: BrandTheme, dark: boolean): ThemeTokens {
  // Contrast is monochrome — invert its accent per mode so it stays visible.
  const accent = brand.id === 'contrast' ? (dark ? '#e6e7ec' : '#141824') : brand.accent
  const accentText = brand.id === 'contrast' && dark ? '#141824' : '#fff'

  if (dark) {
    return {
      bg: '#0f0f14',
      surface: '#16161d',
      surface2: '#1c1c25',
      chrome: '#17171f',
      text: '#ececf0',
      muted: '#8a8a99',
      faint: '#55555f',
      border: '#26262f',
      accent,
      accent2: hexToRgba(accent, 0.7),
      accentSoft: hexToRgba(accent, 0.18),
      accentText,
      ok: OK,
      okSoft: hexToRgba(OK, 0.18),
      warn: WARN,
      danger: DANGER,
      dotColor: 'rgba(120,128,150,.14)',
      codeBg: '#0c0c11',
      codeFg: '#c9c9d4',
    }
  }
  return {
    bg: '#ffffff',
    surface: '#ffffff',
    surface2: '#f6f7fa',
    chrome: '#fafbfc',
    text: '#17181c',
    muted: '#697086',
    faint: '#9aa0b0',
    border: '#e6e8ee',
    accent,
    accent2: hexToRgba(accent, 0.7),
    accentSoft: hexToRgba(accent, 0.12),
    accentText,
    ok: OK,
    okSoft: hexToRgba(OK, 0.12),
    warn: WARN,
    danger: DANGER,
    dotColor: 'rgba(120,128,150,.16)',
    codeBg: '#f6f7fa',
    codeFg: '#3a3f4c',
  }
}
