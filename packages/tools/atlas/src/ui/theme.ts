/**
 * The Atlas theme system — the ONE place Atlas's colours live.
 *
 * Two token sets share the `ThemeTokens` shape:
 *
 * - The CHROME — the workbench's own UI. It follows the Pyreon design system
 *   (the same ink / paper / ember palette as pyreon.dev) and the SHARED theme
 *   preference: `localStorage['pyreon-theme']` (`'light' | 'dark'`), otherwise
 *   `prefers-color-scheme`. Its tokens are CSS custom properties
 *   (`var(--atlas-bg)`), and the two palettes below are emitted once as
 *   `:root` / `:root[data-theme="light"]` rules — so a mode flip is one
 *   attribute write (no re-render, no flash), and server-rendered chrome is
 *   correct for whichever mode the inline head script picks before first paint.
 * - The PREVIEW brands — `tokens(brand, dark)` for components a catalog builds
 *   on Atlas's own `el`/`txt` bases (Ember / Aurora / Forest / Contrast). These
 *   reach only the preview surface and the Theme Lab tiles, each inside its own
 *   `<PyreonUI>`, never the chrome.
 */
import { isServer } from '@pyreon/reactivity'

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
    // Snapped to the 4/8 grid (2px micro allowed): the twelve names keep
    // their semantic tiers but collapse onto {2,4,8,12,16,20}.
    bar: '2px',
    chip: '4px',
    control: '4px',
    item: '8px',
    button: '8px',
    field: '8px',
    panel: '12px',
    card: '12px',
    modal: '16px',
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
  /** The stronger hairline — chip outlines, switch tracks, dashed frames. */
  border2: string
  /** Selected-row / active-chip tint (the accent at ~10%). */
  glow: string
  /** Hover tint for rows. */
  sheen: string
  /** Links and element tags in data views. */
  link: string
  /** Dim layer behind the catalog drawer and dialogs. */
  scrim: string
  /** Drop shadow colour for floating surfaces. */
  shadow: string
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
// binds its tokens to its OWN factory with rocketstyle's `withTheme<ThemeTokens>()`
// (./bases) — every `t` built from it is inferred and checked, zero blast radius. See .agents/rules/anti-patterns.md "Duplicate module augmentation".

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
      border2: '#33333f',
      glow: hexToRgba(accent, 0.12),
      sheen: 'rgba(255,255,255,.035)',
      link: '#7cc7ff',
      scrim: 'rgba(8,10,16,.5)',
      shadow: 'rgba(0,0,0,.45)',
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
    border2: '#d5d8e0',
    glow: hexToRgba(accent, 0.08),
    sheen: 'rgba(15,18,30,.03)',
    link: '#1f5fbf',
    scrim: 'rgba(8,10,16,.5)',
    shadow: 'rgba(15,18,30,.18)',
  }
}

// ── The chrome ────────────────────────────────────────────────────────────

/** A chrome colour role. Every one is a CSS custom property `--atlas-<role>`. */
export type ChromeRole =
  | 'bg'
  | 'surface'
  | 'surface2'
  | 'line'
  | 'line2'
  | 'text'
  | 'muted'
  | 'faint'
  | 'accent'
  | 'accentText'
  | 'glow'
  | 'sheen'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'link'
  | 'well'
  | 'codeFg'
  | 'scrim'
  | 'shadow'

export type ChromePalette = Readonly<Record<ChromeRole, string>>

/**
 * The two chrome palettes — the Pyreon design system's luxe tokens (dark) and
 * their paper flip (light), the same values pyreon.dev uses.
 *
 * Every text role passes 4.5:1 on every surface it sits on in BOTH modes —
 * pinned by `tests/theme-contrast.test.ts`, which computes the WCAG ratios
 * rather than trusting this comment. Two rules from the design system that
 * the numbers enforce: small ember text in light mode is the darker
 * `#A8380A` (the dark ember is 2.9:1 on paper), and text ON an ember fill is
 * ink, not white (white on `#FF5E1A` is 2.9:1).
 */
export const CHROME_PALETTES: Readonly<{ dark: ChromePalette; light: ChromePalette }> = {
  dark: {
    bg: '#0A0A0E',
    surface: '#111118',
    surface2: '#181822',
    line: '#23232E',
    line2: '#2E2E3B',
    text: '#F4EFE6',
    muted: '#C9C4B8',
    // The design's fog is #8A8696 (5.58:1 on ink) — but a caption on a
    // SELECTED row sits on glow-over-surface2, where it measures 4.43:1. One
    // step lighter clears AA there too (4.67:1) and is visually the same grey.
    faint: '#8E8A9A',
    accent: '#FF5E1A',
    accentText: '#0A0A0E',
    glow: 'rgba(255,94,26,.10)',
    sheen: 'rgba(255,255,255,.035)',
    ok: '#4ADE80',
    warn: '#FACC15',
    danger: '#F87171',
    link: '#22D3EE',
    well: '#0A0A0E',
    codeFg: '#E6E0D2',
    scrim: 'rgba(6,6,10,.62)',
    shadow: 'rgba(0,0,0,.5)',
  },
  light: {
    bg: '#FAF5EB',
    surface: '#FFFFFF',
    surface2: '#F4EFE6',
    line: '#E6DFD2',
    line2: '#D6CFC2',
    text: '#14141C',
    muted: '#45414F',
    faint: '#67637A',
    accent: '#A8380A',
    accentText: '#FFFFFF',
    glow: 'rgba(232,74,15,.07)',
    sheen: 'rgba(255,94,26,.025)',
    ok: '#11692F',
    warn: '#8A5A00',
    danger: '#B91C1C',
    link: '#0A6E89',
    well: '#F4EFE6',
    codeFg: '#14141C',
    scrim: 'rgba(20,20,28,.32)',
    shadow: 'rgba(20,20,28,.22)',
  },
}

const ROLES = Object.keys(CHROME_PALETTES.dark) as ChromeRole[]

/** `codeFg` → `--atlas-code-fg`. */
export function chromeVar(role: ChromeRole): string {
  return `--atlas-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
}

const v = (role: ChromeRole) => `var(${chromeVar(role)})`

/**
 * The chrome's typography and shape. Denser than the preview scale: the
 * design system's app shell is 13px with 28–32px rows and mono for data.
 */
export const CHROME_SCALE: ThemeScale = {
  font: {
    sans: "'Space Grotesk',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif",
    display: "'Space Grotesk',ui-sans-serif,system-ui,sans-serif",
    mono: "'JetBrains Mono',ui-monospace,'SFMono-Regular',Menlo,monospace",
  },
  size: {
    nano: '9px',
    tag: '10px',
    label: '10.5px',
    meta: '11px',
    caption: '11.5px',
    small: '12px',
    body: '12.5px',
    text: '13px',
    input: '12.5px',
    item: '13px',
    heading: '13px',
    title: '15px',
    hero: '20px',
  },
  tracking: {
    xs: '.02em',
    sm: '.04em',
    md: '.08em',
    lg: '.12em',
    xl: '.14em',
    xxl: '.16em',
  },
  radius: {
    bar: '2px',
    chip: '999px',
    control: '7px',
    item: '7px',
    button: '8px',
    field: '7px',
    panel: '10px',
    card: '12px',
    modal: '14px',
    stage: '12px',
    pill: '999px',
    round: '50%',
  },
  motion: {
    fast: '.1s',
    base: '.15s',
    slow: '.2s',
  },
}

/**
 * The chrome token set: every colour is a `var(--atlas-*)` reference, so the
 * components never change when the mode does — the custom properties do.
 */
export const CHROME_TOKENS: ThemeTokens = {
  ...CHROME_SCALE,
  hairline: `1px solid ${v('line')}`,
  bg: v('bg'),
  surface: v('surface'),
  surface2: v('surface2'),
  chrome: v('surface'),
  text: v('text'),
  muted: v('muted'),
  faint: v('faint'),
  border: v('line'),
  border2: v('line2'),
  accent: v('accent'),
  accent2: `color-mix(in srgb, ${v('accent')} 70%, transparent)`,
  accentSoft: v('glow'),
  accentText: v('accentText'),
  glow: v('glow'),
  sheen: v('sheen'),
  ok: v('ok'),
  okSoft: `color-mix(in srgb, ${v('ok')} 14%, transparent)`,
  warn: v('warn'),
  danger: v('danger'),
  link: v('link'),
  dotColor: v('line'),
  codeBg: v('well'),
  codeFg: v('codeFg'),
  scrim: v('scrim'),
  shadow: v('shadow'),
}

const declarations = (p: ChromePalette) => ROLES.map((r) => `${chromeVar(r)}:${p[r]};`).join('')

/**
 * The palettes as CSS: dark on `:root`, light when the root carries
 * `data-theme="light"` — and, before any script has run (or with none),
 * light when the OS asks for it and nothing chose otherwise.
 */
export function chromeThemeCss(): string {
  const light = declarations(CHROME_PALETTES.light)
  return (
    `:root{color-scheme:dark;${declarations(CHROME_PALETTES.dark)}}` +
    `:root[data-theme="light"]{color-scheme:light;${light}}` +
    `@media (prefers-color-scheme: light){:root:not([data-theme]){color-scheme:light;${light}}}` +
    `html,body{background:${v('bg')};color:${v('text')};}`
  )
}

// ── The shared theme preference ───────────────────────────────────────────

/** The key every Pyreon UI (site, docs, Atlas, Loom) reads and writes. */
export const THEME_STORAGE_KEY = 'pyreon-theme'

export type ThemeMode = 'light' | 'dark'

/**
 * The preference rule, pure: an explicit stored choice wins, otherwise the
 * OS preference, otherwise dark.
 */
export function resolveThemeMode(stored: string | null | undefined, prefersLight: boolean): ThemeMode {
  if (stored === 'light' || stored === 'dark') return stored
  return prefersLight ? 'light' : 'dark'
}

/**
 * The inline `<head>` script that applies the preference BEFORE first paint.
 * Same logic as `resolveThemeMode`, written out because it runs before any
 * module loads. Every read is guarded: storage can throw in a private window.
 */
export function themeBootScript(): string {
  return (
    `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}` +
    `if(t!=="light"&&t!=="dark")t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";` +
    `document.documentElement.setAttribute("data-theme",t)})()`
  )
}

/** Read the shared preference in the browser (dark on the server). */
export function readThemeMode(): ThemeMode {
  if (isServer) return 'dark'
  let stored: string | null = null
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // Storage unavailable — fall through to the OS preference.
  }
  const prefersLight =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches
  return resolveThemeMode(stored, prefersLight)
}

/** Persist an explicit choice. A failed write only means it does not survive a reload. */
export function writeThemeMode(mode: ThemeMode): void {
  if (isServer) return
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage unavailable.
  }
}

/**
 * The ember gradient's stops — the Pyreon mark's disc. Brand constants, the
 * same in both modes (the mark is display art, not text).
 */
export const EMBER_STOPS = ['#FF1F8C', '#FF5E1A', '#FFC83D'] as const

/**
 * Fixed colours the PREVIEW tools paint with — Addons → Background's fixed
 * surfaces (so a component can be checked against the opposite mode without
 * switching the workbench), the checker grid, and the debug overlays drawn on
 * the user's component (Outline, the A11y highlight). Deliberately not chrome
 * tokens: they must look the same in both workbench modes.
 */
export const PREVIEW_COLORS = {
  light: '#ffffff',
  dark: '#0f0f14',
  checker: 'rgba(128,128,128,.18)',
  outline: 'rgba(255,45,85,.45)',
  highlight: '#ff2d55',
} as const
