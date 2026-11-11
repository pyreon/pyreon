/**
 * pyreon.dev marketing theme — the ONE file that holds every colour, size and
 * motion value the site shell and kit use. Components never write a hex, a
 * px size or an easing of their own; they read it from here, so tokens can be
 * swapped without touching a component.
 *
 * Values: the UNIFIED site + marketing token set (`pyreon-promo/09-site/theme.ts`,
 * 11 Nov 2026), which supersedes the canvas handoff theme. Section letters in
 * brackets ([A1], [C2]…) point at that file's `visual-alignment.md` decisions.
 * The structure differs on purpose — see "How the values reach CSS".
 *
 * How the values reach CSS:
 *   - Mode-aware colours are `{ dark, light }` pairs (`color`, `gradient`,
 *     `verdict`, `diff`, `syntax`). Kit components resolve them with
 *     rocketstyle's `mode(light, dark)` helper (`tone()` / `pair()` in
 *     `kit/bases.ts`). The site runs `@pyreon/ui-core`'s CSS-variables mode
 *     (`site/ui-init.ts`), so every pair becomes one hashed custom property and
 *     a dark/light flip is a single `data-theme` write on <html>: no re-render,
 *     no class churn, and the prerendered HTML serves both themes.
 *   - Sizes stay plain numbers (unistyle turns px into rem) and are read from
 *     this module directly, never through `<PyreonUI theme>`: the
 *     CSS-variables pass would emit them unitless.
 *   - `siteTheme` is the small object `<PyreonUI>` receives.
 */

/** A value that differs between the dark and the light theme. */
export interface Tone {
  readonly dark: string
  readonly light: string
}

const t = (dark: string, light: string): Tone => ({ dark, light })

// ─── Raw palette (reference only; components use the semantic tokens) ─────

export const palette = {
  ink: { 0: '#06060A', 1: '#0A0A0E', 2: '#111118', 3: '#181822', 4: '#23232E', 5: '#2E2E3B' },
  paper: { 0: '#FFFCF5', 1: '#F4EFE6', 2: '#E6E0D2', 3: '#FAF5EB', 4: '#EDE6D6', 5: '#E6DFD2' },
  ember: { plasma: '#FF1F8C', core: '#FF5E1A', warm: '#FFC83D' },
  /** Ember stops that pass 4.5:1 on paper (light-mode display gradient). [A2] */
  emberOnPaper: { plasma: '#D1106F', core: '#C2410C', warm: '#9A6200' },
  cyan: '#22D3EE',
  violet: '#A78BFA',
} as const

// ─── Semantic colours ─────────────────────────────────────────────────────

/**
 * Every text/background pair the kit uses is checked for WCAG AA (4.5:1
 * body text, 3:1 large) in both themes by `site/tests/contrast.test.ts`, and in
 * the real browser across the kit gallery by the shell browser spec.
 */
export const color = {
  /** Page canvas. */
  bg: t('#0A0A0E', '#FAF5EB'),
  /** Card / raised surface. */
  card: t('#111118', '#FFFFFF'),
  /** Slightly raised (tile gradients). */
  raised: t('#181822', '#F4EFE6'),
  /** Recessed wells: benchmark tables, meters, code. */
  well: t('#0C0C11', '#FFFFFF'),
  /** Hairlines. */
  line: t('#23232E', '#E6DFD2'),
  line2: t('#2E2E3B', '#D6CFC2'),
  lineHover: t('#4A4654', '#B9B2A6'),
  /** Card 1px gradient border (top → bottom). */
  edgeA: t('#2E2E3B', '#E6DFD2'),
  edgeB: t('#181822', '#EFE9DC'),
  /** Faint top-left sheen inside cards. */
  sheen: t('rgba(255,255,255,.035)', 'rgba(255,94,26,.025)'),
  /** Ember glow inside `hot` cards. */
  glow: t('rgba(255,94,26,.10)', 'rgba(232,74,15,.07)'),
  /** Frosted nav bar. */
  glass: t('rgba(10,10,14,.72)', 'rgba(255,252,245,.82)'),
  /** Mega-menu panel. */
  panel: t('rgba(17,17,24,.98)', 'rgba(255,255,255,.98)'),
  /** Hover fill for menu rows. */
  hoverFill: t('rgba(255,255,255,.04)', 'rgba(20,20,28,.04)'),
  /** Floating panel shadow. */
  shadow: t('0 40px 80px -20px rgba(0,0,0,.8)', '0 30px 60px -24px rgba(20,20,28,.25)'),
  /** Card lift (light mode only; dark cards are flat). */
  cardShadow: t('none', '0 1px 2px rgba(20,20,28,.04), 0 12px 32px -18px rgba(20,20,28,.18)'),

  /** Body text. */
  text: t('#F4EFE6', '#14141C'),
  /** Headlines / strongest text. */
  strong: t('#FFFCF5', '#0A0A0E'),
  /** Secondary copy. */
  mist: t('#C9C4B8', '#45414F'),
  /** Tertiary copy, eyebrows, captions (5.58:1 on ink.1). */
  fog: t('#8A8696', '#67637A'),

  /** Ember for UI marks and small text (light: AA-safe dark ember). [A1] */
  accent: t('#FF5E1A', '#A8380A'),
  /** Ember for small text in cards (package names). */
  accentText: t('#FF8A4C', '#A8380A'),
  /** Gold text. */
  warmText: t('#FFC83D', '#8A5A00'),
  ok: t('#4ADE80', '#11692F'),
  warn: t('#FACC15', '#8A5A00'),
  err: t('#F87171', '#B91C1C'),
  link: t('#22D3EE', '#0A6E89'),
  /** The install command's `$` prompt is cyan everywhere. [A12] */
  prompt: t('#22D3EE', '#0A6E89'),
  /** Rival bar in benchmark comparisons. */
  bar: t('#3A3846', '#D9D2C4'),

  /** Solid pill: inverted surface. */
  solidBg: t('#F4EFE6', '#14141C'),
  solidHover: t('#FFFCF5', '#0A0A0E'),
  solidText: t('#0A0A0E', '#FFFCF5'),

  /** Focus ring (2px outline). */
  focus: t('#FF8A4C', '#A8380A'),
  /** Text selection. */
  selection: t('rgba(255,94,26,.38)', 'rgba(232,74,15,.30)'),
  /** Active item in a switcher strip. */
  currentBorder: t('rgba(255,94,26,.55)', 'rgba(168,56,10,.55)'),
  currentFill: t('rgba(255,94,26,.08)', 'rgba(232,74,15,.06)'),
  /** Scanline texture line (punch surfaces only). [A6b] */
  scanline: t('#23232E', '#E6DFD2'),
} as const satisfies Record<string, Tone>

export type ColorKey = keyof typeof color

/** Benchmark verdicts: one vocabulary for tables, cards and videos. Text label always present. [A7] */
export const verdict = {
  /** Win: ember gradient fill with ink text (≥5.48:1 on every stop). */
  winFill: 'linear-gradient(95deg, #FF1F8C 0%, #FF5E1A 55%, #FFC83D 100%)',
  winText: '#0A0A0E',
  tie: t('#22D3EE', '#0A6E89'),
  split: t('#C9C4B8', '#45414F'),
  loss: t('#F87171', '#B91C1C'),
  info: t('#8A8696', '#67637A'),
  experimental: t('#FACC15', '#8A5A00'),
} as const

/** "The code you delete" diff colours, from the marketing cards. [C2] */
export const diff = {
  delBar: t('#FF1F8C', '#D1106F'),
  delBg: t('rgba(255,31,140,.12)', 'rgba(209,16,111,.07)'),
  delText: t('#F7B9D6', '#8E0B4C'),
  insBar: t('#22D3EE', '#0A6E89'),
  insBg: t('rgba(34,211,238,.09)', 'rgba(10,110,137,.08)'),
  insText: t('#E9FBFF', '#0B4F63'),
} as const

/** Code colours: one syntax theme for site, cards and videos. [A9] */
export const syntax = {
  dark: { bg: '#0C0C11', fg: '#E6E0D2', kw: '#FF5E1A', str: '#FFC83D', num: '#FF1F8C', fn: '#22D3EE', type: '#A78BFA', com: '#8A8696', punct: '#8A8696' },
  /** On the light well (#FFFFFF / #F4EFE6): kw 4.52, str 5.18, num 5.27, fn 4.68, type 6.2, com 4.79. */
  light: { bg: '#FFFFFF', fg: '#14141C', kw: '#C2410C', str: '#8A5A00', num: '#BE185D', fn: '#0E7490', type: '#6D28D9', com: '#6B6776', punct: '#67637A' },
} as const

/**
 * The paper "real app" surface used inside demos (`DemoSurface`). It keeps
 * these colours in BOTH themes: a demo shows a real app, not the site chrome.
 */
export const paper = {
  bg: '#FFFCF5',
  text: '#14141C',
  mist: '#45414F',
  fog: '#5E5A69',
  line: '#D6D0C4',
  field: '#FFFFFF',
  accent: '#A8380A',
  accentText: '#FFFFFF',
  err: '#B91C1C',
  ok: '#11692F',
  ring: 'inset 0 0 0 1px #E6DFD2',
} as const

/** Gradients. The ember gradient is for LARGE display type and marks only. [A2] */
export const gradient = {
  /** Display numerals and hook words; light mode uses the AA-safe stops. */
  ember: t(
    'linear-gradient(95deg, #FF1F8C 0%, #FF5E1A 55%, #FFC83D 100%)',
    'linear-gradient(95deg, #D1106F 0%, #C2410C 55%, #9A6200 100%)',
  ),
  /** Benchmark "Pyreon" bar (an area fill, not text). */
  bar: t(
    'linear-gradient(95deg, #FF1F8C 0%, #FF5E1A 55%, #FFC83D 100%)',
    'linear-gradient(95deg, #FF1F8C 0%, #FF5E1A 55%, #FFC83D 100%)',
  ),
  /** Hero spotlight behind product pages. */
  heroGlow: t(
    'radial-gradient(closest-side, rgba(255,94,26,.13), transparent 70%)',
    'radial-gradient(closest-side, rgba(255,94,26,.10), transparent 70%)',
  ),
  /** Corner flare on punch surfaces (proof band, hook hero, quote). */
  flare: t(
    'radial-gradient(closest-side, rgba(255,94,26,.30), rgba(255,31,140,.16) 60%, transparent 100%)',
    'radial-gradient(closest-side, rgba(255,94,26,.12), rgba(255,31,140,.07) 60%, transparent 100%)',
  ),
  /** Section divider rule. */
  rule: t('linear-gradient(90deg, transparent, #2E2E3B, transparent)', 'linear-gradient(90deg, transparent, #D6CFC2, transparent)'),
  /** SVG <linearGradient id="eg"> stops for product glyphs. */
  glyphStops: ['#FF1F8C', '#FF5E1A', '#FFC83D'] as const,
} as const

/** Scanline texture on punch surfaces, masked to fade out. [A6b] */
export const texture = {
  scanlineSize: '100% 34px',
  scanlineOpacity: t('0.45', '0.6'),
  scanlineMask: 'linear-gradient(180deg, transparent, #000 18%, #000 70%, transparent)',
} as const

// ─── Type ─────────────────────────────────────────────────────────────────

/**
 * Font stacks. The `--pyreon-font-*` variables come from zero's font plugin
 * (`zero({ font })` in vite.config.ts): self-hosted woff2 plus metric-matched
 * fallback faces, so the swap shifts nothing. The literal names after the
 * comma are what `vite dev` renders with. Weights loaded: Space Grotesk
 * 400/500/600/700, JetBrains Mono 400/500 (+600 for the docs).
 */
export const font = {
  sans: "var(--pyreon-font-space-grotesk, 'Space Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif)",
  mono: "var(--pyreon-font-jetbrains-mono, 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace)",
  /** The paper demo surface reads like a native app. */
  system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const

/** Fluid display sizes: clamp(min px, vw, max px). */
export const display = {
  hero: { min: 40, vw: 5.8, max: 80, lineHeight: 1, tracking: '-.048em', weight: 500 },
  /** The hook hero: bold, tighter, one ember word. [C3] */
  hook: { min: 44, vw: 7.2, max: 112, lineHeight: 0.94, tracking: '-.055em', weight: 700 },
  section: { min: 32, vw: 4.2, max: 56, lineHeight: 0.98, tracking: '-.045em', weight: 500 },
  landingSection: { min: 38, vw: 5, max: 70, lineHeight: 0.98, tracking: '-.045em', weight: 500 },
  end: { min: 34, vw: 4.6, max: 60, lineHeight: 1.04, tracking: '-.045em', weight: 500 },
  /** Big proof numerals (the cards' `.big`). [A4] */
  numeral: { min: 64, vw: 8, max: 132, lineHeight: 0.86, tracking: '-.06em', weight: 700 },
  /** Quote block text. [C4] */
  quote: { min: 34, vw: 4.6, max: 64, lineHeight: 1.02, tracking: '-.045em', weight: 700 },
  stat: { min: 30, vw: 4, max: 46, lineHeight: 1.05, tracking: '-.03em', weight: 500 },
} as const

export const clampSize = (d: { min: number; vw: number; max: number }): string =>
  `clamp(${d.min}px, ${d.vw}vw, ${d.max}px)`

/** Fixed text sizes (px), line heights, tracking and weights. */
export const text = {
  card: { size: 24, lineHeight: 1.15, tracking: '-.03em' },
  step: { size: 20, lineHeight: 1.3, tracking: '-.01em' },
  /** Lede/body weight is 400 (300 renders thin on non-retina). [A3] */
  ledeHero: { size: 19, lineHeight: 1.6 },
  ledeSection: { size: 18, lineHeight: 1.65 },
  body: { size: 15, lineHeight: 1.65 },
  small: { size: 14.5, lineHeight: 1.6 },
  faq: { size: 17, lineHeight: 1.45 },
  ui: { size: 13.5 },
  caption: { size: 12.5, lineHeight: 1.5 },
  code: { size: 12.8, lineHeight: 1.8 },
  mono: { size: 12 },
  /** One eyebrow style everywhere: .16em, weight 500. [A6] */
  eyebrow: { size: 11, tracking: '.16em', weight: 500 },
  eyebrowTight: { size: 10.5, tracking: '.16em' },
  /** The caveat line under any benchmark number. [A8] */
  caveat: { size: 11.5, tracking: '.01em' },
  navLink: { size: 13.5 },
  sheetLink: { size: 22 },
  wordmark: { size: 18, weight: 600 },
} as const

export const weight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const

// ─── Space, shape, layout ─────────────────────────────────────────────────

export const radius = {
  card: 22,
  cardInner: 21,
  proof: 28,
  bench: 20,
  panel: 20,
  demo: 16,
  tile: 15,
  pane: 14,
  note: 12,
  control: 10,
  small: 6,
  pill: 9999,
} as const

export const layout = {
  maxWidth: 1240,
  gutter: { xs: 16, md: 40 },
  navTop: 16,
  navHeight: 54,
  navMaxWidth: 1080,
  /** Below this width the nav collapses into the menu button + sheet (_nav.json mobile.breakpoint). */
  navCollapse: 960,
  sheetPadTop: 88,
} as const

/** Section rhythm (px). `tight` = sections after the first on product pages. [A10] */
export const section = {
  padY: 112,
  padYMobile: 72,
  tightTop: 20,
  headGap: 56,
  heroTop: 160,
  heroTopMobile: 120,
  heroBottom: 80,
  endBottom: 140,
} as const

/** Breakpoints (min-width, px), as the unified theme sets them. */
export const breakpoints = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 } as const

/** `@media` for "nav collapsed" / "nav expanded" (960px is not a theme breakpoint). */
export const navMedia = {
  collapsed: `@media (max-width: ${layout.navCollapse - 0.02}px)`,
  expanded: `@media (min-width: ${layout.navCollapse}px)`,
} as const

// ─── Motion ───────────────────────────────────────────────────────────────

export const motion = {
  /** 700ms / 16px (the reference's 1s / 24px read as slow). */
  reveal: { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)', distance: 16 },
  hover: '.2s ease',
  bars: '.6s cubic-bezier(.2,.7,.2,1)',
  panel: '.18s ease',
  /** Signal pulse, only where a value changes. */
  pulse: { duration: 200, easing: 'cubic-bezier(.2,.7,.3,1)' },
} as const

// ─── Z layers ─────────────────────────────────────────────────────────────

export const z = { sheet: 90, nav: 95, panel: 96, skip: 100 } as const

// ─── The object <PyreonUI theme> receives ─────────────────────────────────

/**
 * Passed to the ROOT `<PyreonUI>` once, as the same object on every request
 * (unistyle memoizes enrichment on identity). Only keys the UI system itself
 * reads live here; the kit reads everything above directly.
 */
export const siteTheme = {
  rootSize: 16,
  breakpoints,
  fontFamily: { base: font.sans, mono: font.mono },
} as const

export type SiteTheme = typeof siteTheme
