import type { Theme } from '@pyreon/ui-theme'
import { focusRingTone, type ToneKey } from './fragments'

/**
 * Mode-aware neutral tones for form controls — the light/dark decision in ONE
 * place.
 *
 * The theme's neutral palette is light-only: `light.base` is white,
 * `dark[800]` is slate text, and `base[N]` is slate-400 at N% alpha. Used
 * directly, a control stays white in dark mode, and the faint `base[300]`
 * border is ~1.3:1 against the page in EITHER mode (WCAG 1.4.11 wants 3:1 for
 * a control's boundary). Each tone here is `mode(light, dark)`, so a component
 * written as
 *
 *   .theme((t, m) => ({ ...fieldSurface(t, m), placeholder: { color: tones(t, m).placeholder } }))
 *
 * is right in both modes. The values are chosen against the page the
 * `<PyreonUI>` mode implies — white in light mode, `dark.base` (slate-900) in
 * dark mode — and are locked by `form-controls-contrast.browser.test.tsx`,
 * which measures them in real Chromium.
 */

/** Rocketstyle's `mode(light, dark)` helper, as `.theme()` / dimension callbacks receive it. */
export type { ThemeModeCallback as ModeFn } from '@pyreon/rocketstyle'
import type { ThemeModeCallback as ModeFn } from '@pyreon/rocketstyle'

/** The dark-mode field surface: slate-800, one step above the slate-900 page. */
const DARK_SURFACE = 'rgba(30, 41, 59, 1)'

export const tones = (t: Theme, m: ModeFn) => ({
  /** Field / control surface. */
  surface: m(t.color.system.light.base, DARK_SURFACE),
  /** A raised-but-subtle surface (hover, disabled, track). */
  surfaceMuted: m(t.color.system.base[100], t.color.system.light[100]),
  /** Primary text on a surface (≥ 4.5:1). */
  text: m(t.color.system.dark[800], t.color.system.light[900]),
  /** Secondary text: labels, descriptions, icons (≥ 4.5:1). */
  textMuted: m(t.color.system.dark[700], t.color.system.light[700]),
  /** Placeholder text (≥ 4.5:1 — it is text). */
  placeholder: m(t.color.system.dark[600], t.color.system.light[600]),
  /** A control's boundary: field borders, unchecked boxes, tracks (≥ 3:1 vs the page). */
  border: m(t.color.system.dark[500], t.color.system.light[400]),
  /** A divider or decorative edge that is NOT a control boundary. */
  divider: m(t.color.system.base[300], t.color.system.light[200]),
})

/** The status tones that carry a `text` shade in the theme palette. */
export type StatusTone = 'primary' | 'success' | 'info' | 'error' | 'warning'

// Light shades for status text on the dark page / dark tints (Tailwind 300s).
// The theme's `tone.text` is the matching dark shade for light mode; `tone[700]`
// (the tone at 70% alpha) is NOT text-safe in either mode.
const STATUS_TEXT_DARK: Record<StatusTone, string> = {
  primary: '#93c5fd',
  success: '#6ee7b7',
  info: '#7dd3fc',
  error: '#fca5a5',
  warning: '#fcd34d',
}

/** Legible text in a status tone (≥ 4.5:1 on the page and on that tone's `[100]` tint). */
export const toneText = (t: Theme, m: ModeFn, tone: StatusTone) =>
  m(t.color.system[tone].text, STATUS_TEXT_DARK[tone])

/**
 * `toneKeys` (in `fragments.ts`) for a neutral (`secondary`) state: a slate
 * outline, the mode's primary text, and the neutral tints. A neutral state has
 * no solid fill of its own, so `toneFill` / `toneContrast` are the outline and
 * the text.
 */
export const neutralToneKeys = (t: Theme, m: ModeFn) => {
  const tone = tones(t, m)
  return {
    toneFill: tone.border,
    toneContrast: tone.text,
    toneText: tone.text,
    toneTint50: t.color.system.base[50],
    toneTint100: t.color.system.base[100],
    toneTint200: t.color.system.base[200],
  } satisfies Record<ToneKey, unknown>
}

/** The field keys a text field's theme sets. */
export type FieldKey = 'fieldSurface' | 'fieldBorder' | 'fieldFocus' | 'fieldStatus'

/** The field keys as a variant reads them: every key resolved for the current mode. */
export type FieldKeys = Record<FieldKey, string>

/**
 * A text field's colours as plain theme keys, for its variants to read.
 * Spread into the field's base `.theme()`; a status state overrides them with
 * {@link fieldStatus}. The variants are transforms ({@link fieldVariant}), so a
 * `filled` or `underline` field keeps the state's border instead of drawing
 * its own (#4425).
 */
export const fieldKeys = (t: Theme, m: ModeFn) => ({
  /** The resting surface; a `filled` field returns to it on focus. */
  fieldSurface: tones(t, m).surface,
  /** The resting boundary. */
  fieldBorder: tones(t, m).border,
  /** The boundary while focused. */
  fieldFocus: t.color.system.primary.base,
  /** The status colour, or `''` when the field has no status. */
  fieldStatus: '',
}) satisfies Record<FieldKey, unknown>

/** A status state (`error` / `success`) of a text field: its border, focused or not, and its focus ring. */
export const fieldStatus = (t: Theme, tone: 'error' | 'success') => ({
  fieldBorder: t.color.system[tone].base,
  fieldFocus: t.color.system[tone].base,
  fieldStatus: t.color.system[tone].base,
  borderColor: t.color.system[tone].base,
  focus: { ...focusRingTone(t, tone), borderColor: t.color.system[tone].base },
})


const readField = (theme: object): FieldKeys => {
  const read = (key: FieldKey): string => {
    const value: unknown = Reflect.get(theme, key)
    return typeof value === 'string' ? value : ''
  }

  return {
    fieldSurface: read('fieldSurface'),
    fieldBorder: read('fieldBorder'),
    fieldFocus: read('fieldFocus'),
    fieldStatus: read('fieldStatus'),
  }
}

/** A text-field variant drawn from {@link fieldKeys}, as a `.variants()` value. */
export const fieldVariant =
  <S extends object>(styles: (field: FieldKeys) => S) =>
  (theme: object): S =>
    styles(readField(theme))

/** The common text-field look: surface, text, boundary. */
export const fieldSurface = (t: Theme, m: ModeFn) => {
  const tone = tones(t, m)
  return {
    backgroundColor: tone.surface,
    color: tone.text,
    borderColor: tone.border,
  }
}

/**
 * Theme keys the {@link choiceBoxStyles} layer reads: the box's boundary,
 * surface and checked fill, already resolved for the current mode.
 */
export const choiceBoxTheme = (t: Theme, m: ModeFn) => {
  const tone = tones(t, m)
  return {
    boxBorderColor: tone.border,
    boxBackground: tone.surface,
    boxCheckedColor: t.color.system.primary.base,
  }
}

// White marks drawn over the checked fill (primary).
const CHECK_MARK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`
const DASH_MARK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8h8' stroke='white' stroke-width='2.2' stroke-linecap='round'/%3E%3C/svg%3E")`

type StyleCss = (strings: TemplateStringsArray, ...values: unknown[]) => unknown
type BoxTheme = { boxBorderColor?: string; boxBackground?: string; boxCheckedColor?: string }

/**
 * The visible box of a Checkbox / Radio. The headless bases render a label with
 * a visually-hidden native input and `data-checked` / `aria-checked`, so
 * without this layer the styled control showed NO box at all. Drawn as the
 * label's `::before`, so it needs no extra element and follows the checked
 * state through the attributes the base already maintains. A consumer who
 * composes the exported `CheckboxIndicator` / `RadioIndicator` keeps full
 * control: the built-in box steps aside when one is present.
 */
export const choiceBoxStyles = (shape: 'square' | 'circle') => (css: StyleCss) =>
  css`
    ${({ $rocketstyle }: { $rocketstyle: BoxTheme }) => {
      const s = $rocketstyle
      return css`
        &:not(:has([data-choice-indicator]))::before {
          content: '';
          box-sizing: border-box;
          flex-shrink: 0;
          width: 1.25em;
          height: 1.25em;
          border: 2px solid ${s.boxBorderColor};
          border-radius: ${shape === 'circle' ? '50%' : '4px'};
          background-color: ${s.boxBackground};
          background-position: center;
          background-repeat: no-repeat;
          background-size: 100%;
        }
        &[data-checked]:not(:has([data-choice-indicator]))::before {
          border-color: ${s.boxCheckedColor};
          ${
            shape === 'circle'
              ? `background-image: radial-gradient(circle, ${s.boxCheckedColor} 0 32%, transparent 36%);`
              : `background-color: ${s.boxCheckedColor}; background-image: ${CHECK_MARK};`
          }
        }
        ${
          shape === 'square'
            ? `&[aria-checked='mixed']:not(:has([data-choice-indicator]))::before {
                border-color: ${s.boxCheckedColor};
                background-color: ${s.boxCheckedColor};
                background-image: ${DASH_MARK};
              }`
            : ''
        }
      `
    }}
  `
