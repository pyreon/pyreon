/** The Atlas theme system — 4 brand themes × light/dark, as flat token objects. */

/**
 * Typography, shape, and motion scales — the STRUCTURAL half of the theme.
 *
 * Every value that must stay CONSISTENT across the workbench (or would move
 * in a re-brand) lives here; per-component box geometry (paddings, gaps)
 * stays local to the component where it is honest one-off layout. The scale
 * values are the exact set the chrome already used — extraction, not
 * redesign, so nothing shifts a pixel.
 */
export interface ThemeScale {
  font: {
    /** UI text — the shell-wide sans stack. */
    sans: string
    /** Headings + the brand mark. */
    display: string
    /** Data, code, badges, metrics. */
    mono: string
  }
  /** Font sizes, smallest → largest, named by ROLE. */
  size: {
    /** 9px — verdict dots' labels, tiny glyph buttons. */
    nano: string
    /** 9.5px — tags on cards. */
    tag: string
    /** 10px — mono labels, eyebrows. */
    label: string
    /** 10.5px — mono metadata. */
    meta: string
    /** 11px — captions, group headers. */
    caption: string
    /** 11.5px — dense body, chips. */
    small: string
    /** 12px — panel body. */
    body: string
    /** 12.5px — emphasized body, scenario rows. */
    text: string
    /** 13px — inputs, primary rows. */
    input: string
    /** 13.5px — sidebar items. */
    item: string
    /** 14px — section headings. */
    heading: string
    /** 15px — view titles. */
    title: string
    /** 16px — the brand mark. */
    hero: string
  }
  /** Letter-spacing steps (uppercase labels want air). */
  tracking: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
    xxl: string
  }
  /** Corner radii, named by the surface they round. */
  radius: {
    bar: string
    chip: string
    control: string
    item: string
    button: string
    field: string
    panel: string
    card: string
    modal: string
    stage: string
    pill: string
    round: string
  }
  /** Motion durations. */
  motion: {
    fast: string
    base: string
    slow: string
  }
}

/** The structural scale is mode-independent — one frozen instance. */
export const SCALE: ThemeScale = {
  font: {
    sans: "'Public Sans','Inter',system-ui,-apple-system,sans-serif",
    display: "'Space Grotesk','Public Sans',system-ui,sans-serif",
    mono: "'JetBrains Mono','SF Mono',ui-monospace,monospace",
  },
  size: {
    nano: '9px',
    tag: '9.5px',
    label: '10px',
    meta: '10.5px',
    caption: '11px',
    small: '11.5px',
    body: '12px',
    text: '12.5px',
    input: '13px',
    item: '13.5px',
    heading: '14px',
    title: '15px',
    hero: '16px',
  },
  tracking: {
    xs: '.02em',
    sm: '.04em',
    md: '.05em',
    lg: '.06em',
    xl: '.08em',
    xxl: '.1em',
  },
  radius: {
    bar: '3px',
    chip: '5px',
    control: '6px',
    item: '7px',
    button: '8px',
    field: '9px',
    panel: '10px',
    card: '12px',
    modal: '14px',
    stage: '16px',
    pill: '20px',
    round: '50%',
  },
  motion: {
    fast: '.1s',
    base: '.12s',
    slow: '.15s',
  },
}

export interface ThemeTokens extends ThemeScale {
  /** `1px solid <border>` — the workbench's one hairline, derived per mode. */
  hairline: string
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

// NOTE — deliberately NO `declare module '@pyreon/rocketstyle'` augmentation here.
//
// Atlas ships its OWN flat token theme (it does NOT use @pyreon/ui-theme), and an
// earlier cut augmented rocketstyle's global `ThemeDefault` with `ThemeTokens` to
// type every `.theme()` callback's `t`. That is safe ONLY in an app where nothing
// else augments `ThemeDefault` — which is false the moment Atlas is used from a
// project that also loads `@pyreon/ui-theme` (it augments the SAME interface with
// its own `Theme`). The two augmentations declaration-MERGE: no property names
// collide, so there is no loud TS2320 — instead every `t` silently gains BOTH
// shapes, and `t.spacing` (ui-theme) typechecks inside Atlas while `t.bg` (Atlas)
// typechecks inside a ui-theme component. Both are `undefined` at runtime: the
// types lie in both directions.
//
// A library must not mutate a consumer's global type surface. Atlas therefore
// types `t` LOCALLY at each call site via the `T` alias in `./kit` — same DX, zero
// blast radius. See .claude/rules/anti-patterns.md "Duplicate module augmentation".

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
      ...SCALE,
      hairline: '1px solid #26262f',
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
    ...SCALE,
    hairline: '1px solid #e6e8ee',
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
