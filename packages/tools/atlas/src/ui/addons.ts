/**
 * Workbench addons — the Storybook-inspired canvas tools, as DATA.
 *
 * Storybook ships these as separate npm addons (`@storybook/addon-viewport`,
 * `-backgrounds`, `-outline`, `-measure`, `-pseudo-states`). Atlas ships them
 * built in, because on the Pyreon stack they cost almost nothing: a viewport is
 * a width, a background is a token, an outline is one CSS rule, and a pseudo
 * state is a PROP rocketstyle already understands.
 *
 * Everything here is pure — presets + resolvers, no signals and no DOM — so the
 * whole addon surface is unit-testable and the reactive wiring stays in
 * `./model` (state) and `./views/*` (render). Adding an addon means adding an
 * entry here, not touching the shell.
 */
import type { ThemeTokens } from './theme'

// ── viewport ────────────────────────────────────────────────────────────────

/**
 * Open string: the shipped ids autocomplete nowhere special — a project's
 * `atlas.config.ts` presets name their own.
 */
export type ViewportId = string

export interface ViewportPreset {
  /** A custom CSS width is carried on the preset itself — see `width`. */
  id: ViewportId
  label: string
  /** Canvas width in px — `null` means "fill the stage" (no constraint). */
  width: number | null
  /** Shown next to the label so the sizes are readable at a glance. */
  hint: string
}

/**
 * Deliberately the same breakpoints `@pyreon/unistyle` ships (sm/md/lg), so a
 * component checked at "tablet" here is checked at the width its responsive
 * theme actually switches on — not an arbitrary device size.
 */
export const VIEWPORTS: readonly ViewportPreset[] = [
  { id: 'full', label: 'Full', width: null, hint: 'fluid' },
  { id: 'mobile', label: 'Mobile', width: 375, hint: '375px' },
  { id: 'tablet', label: 'Tablet', width: 768, hint: '768px' },
  { id: 'desktop', label: 'Desktop', width: 1280, hint: '1280px' },
]

export function viewportById(id: ViewportId): ViewportPreset {
  return VIEWPORTS.find((v) => v.id === id) ?? VIEWPORTS[0]!
}

/**
 * The CSS width for a viewport. Returns `'100%'` for the fluid preset so the
 * caller can always assign it — no conditional style branch at the call site.
 */
export function viewportWidth(id: ViewportId): string {
  const w = viewportById(id).width
  return w === null ? '100%' : `${w}px`
}

/**
 * Addon id → rocketstyle dimension key.
 *
 * The canvas renders these as DIMENSIONS rather than inline styles (the
 * workbench ships none), so the view needs the key, not the raw CSS. Keeping
 * the mapping here — beside the presets it mirrors — means a new preset is a
 * one-file change and the `dimension key exists for every preset` invariant is
 * unit-testable instead of only discoverable by clicking.
 */
export const VIEWPORT_SIZE: Record<ViewportId, string> = {
  full: 'vFull',
  mobile: 'vMobile',
  tablet: 'vTablet',
  desktop: 'vDesktop',
}

// ── backgrounds ─────────────────────────────────────────────────────────────

/** Open string — see `ViewportId`. */
export type BackgroundId = string

export interface BackgroundPreset {
  id: BackgroundId
  label: string
  /** CSS color for a per-project preset; the shipped ids style via variants. */
  color?: string
}

export const BACKGROUNDS: readonly BackgroundPreset[] = [
  { id: 'theme', label: 'Theme' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'checker', label: 'Checker' },
]

/**
 * Resolve a background to a CSS `background` value.
 *
 * `theme` follows the active brand/mode (the default — what the component will
 * actually sit on); `light`/`dark` force a fixed surface so you can eyeball
 * contrast against the opposite mode without switching the whole workbench;
 * `checker` is the transparency grid, for components with translucent
 * surfaces or shadows.
 */
/** Background id → rocketstyle `variant` key (see `VIEWPORT_SIZE`). */
export const BACKGROUND_VARIANT: Record<BackgroundId, string> = {
  theme: 'bgTheme',
  light: 'bgLight',
  dark: 'bgDark',
  checker: 'bgChecker',
}

export function backgroundCss(id: BackgroundId, t: ThemeTokens): string {
  switch (id) {
    case 'light':
      return '#ffffff'
    case 'dark':
      return '#0f0f14'
    case 'checker':
      // 8px checkerboard from two 45°/-45° gradient pairs — no asset needed.
      return (
        'repeating-conic-gradient(rgba(128,128,128,.18) 0% 25%, transparent 0% 50%)' +
        ' 50% / 16px 16px'
      )
    case 'theme':
    default:
      return t.surface
  }
}

// ── pseudo states ───────────────────────────────────────────────────────────

export type PseudoId = 'hover' | 'focus' | 'active' | 'disabled'

export interface PseudoPreset {
  id: PseudoId
  label: string
}

export const PSEUDO_STATES: readonly PseudoPreset[] = [
  { id: 'hover', label: 'Hover' },
  { id: 'focus', label: 'Focus' },
  { id: 'active', label: 'Active' },
  { id: 'disabled', label: 'Disabled' },
]

/**
 * Props that force a pseudo state on a rocketstyle component.
 *
 * This is the one addon that is genuinely CHEAPER on this stack than on
 * Storybook's. `@storybook/addon-pseudo-states` has to rewrite the emitted
 * stylesheet — rename `:hover` rules to `.pseudo-hover` classes — because the
 * browser will not let you force a real pseudo class. rocketstyle already
 * models pseudo state as DATA: `hover`/`active`/`focus` are reserved props that
 * land in `$rocketstate.pseudo`, and the bases apply the matching theme block
 * unconditionally when the flag is set (`disabled` likewise drives the disabled
 * block plus `aria-disabled`). So forcing a state is just passing a prop, and
 * what renders is exactly the same CSS a real interaction produces — not a
 * lookalike class.
 *
 * Returns `{}` for `null` so a catalog can spread it unconditionally.
 */
export function pseudoProps(active: PseudoId | null): Record<string, boolean> {
  if (active === null) return {}
  // `disabled` is not a rocketstyle PSEUDO_KEY — it is a real prop that the
  // bases branch on (and that suppresses hover/active). Emitting it under the
  // same switch keeps the caller's API to one field.
  return { [active]: true }
}

// ── outline ─────────────────────────────────────────────────────────────────

/**
 * Storybook splits this into `addon-outline` (see every box) and
 * `addon-measure` (hover to read a box's dimensions). The outline half is the
 * one that catches real layout bugs — a stray wrapper, a collapsed flex child,
 * padding that belongs to the wrong element — and it is a single rule, applied
 * to the preview subtree only so the workbench chrome stays readable.
 */
export const OUTLINE_CSS =
  '& *, & *::before, & *::after { outline: 1px solid rgba(255,45,85,.45) !important; outline-offset: -1px; }'

// ── registry ────────────────────────────────────────────────────────────────

// ── locale / direction ──────────────────────────────────────────────────────

export type LocaleId = string

export interface LocalePreset {
  /** BCP-47 tag, handed to the catalog verbatim (`ctx.locale`). */
  id: LocaleId
  label: string
  /** Writing direction — drives `dir=` on the preview. */
  dir: 'ltr' | 'rtl'
}

/**
 * Locales offered by the Locale addon.
 *
 * Storybook covers this with `addon-toolbars`/globals plus a community RTL
 * addon; the pairing matters more than the list. A locale is only half the
 * test — the half that catches real layout bugs is **direction**, because an
 * RTL flip exposes hardcoded `margin-left`, one-sided borders, and icons that
 * should mirror. Arabic is included for exactly that reason, not for coverage.
 *
 * The list is a sensible default, not a fixed set: a host reads `LOCALES` and
 * can render its own switcher over its real catalogue of locales.
 */
export const LOCALES: readonly LocalePreset[] = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'cs', label: 'Čeština', dir: 'ltr' },
  { id: 'de', label: 'Deutsch', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
]

export function localeById(id: LocaleId): LocalePreset {
  return LOCALES.find((l) => l.id === id) ?? LOCALES[0]!
}

/**
 * Writing direction for a locale — `'ltr'` for anything unknown, so a host that
 * supplies its own locale ids never renders an undefined `dir`.
 */
export function localeDir(id: LocaleId): 'ltr' | 'rtl' {
  return localeById(id).dir
}

// ── panel registry ──────────────────────────────────────────────────────────

/** The tabs in the addon panel. */
export type AddonTabId = 'controls' | 'actions' | 'a11y' | 'canvas'

export interface AddonTab {
  id: AddonTabId
  title: string
  /** One-line explanation of what the tab is for. */
  hint: string
}

/**
 * The addon panel's tabs, in order. The panel renders FROM this list, so the
 * shell has no hand-written button-per-tab — adding a tab is a data entry.
 *
 * Mapping to Storybook's addon set: `controls` ≈ addon-controls (args),
 * `actions` ≈ addon-actions, `a11y` ≈ addon-a11y, and `canvas` folds together
 * addon-viewport, addon-backgrounds, addon-pseudo-states and addon-outline —
 * four packages there, four rows here, because none of them needs more than a
 * preset list on this stack.
 */
export const ADDON_TABS: readonly AddonTab[] = [
  { id: 'controls', title: 'Controls', hint: 'Edit the component props live' },
  { id: 'actions', title: 'Actions', hint: 'Log events the component emits' },
  { id: 'a11y', title: 'A11y', hint: 'Static accessibility checks' },
  { id: 'canvas', title: 'Canvas', hint: 'Viewport, background, pseudo state, outline' },
]
