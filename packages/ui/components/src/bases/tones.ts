import type { Theme } from '@pyreon/ui-theme'

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
 * surface, checked fill and the mark drawn on that fill, already resolved for
 * the current mode. The mark is a glyph on the `primary` fill, so it reads
 * `primary.contrast` like every other glyph or label on a fill (a Button's
 * text, Timeline's check): white on the brand's ember is 3.06:1, and on a
 * pale custom primary it would vanish.
 */
export const choiceBoxTheme = (t: Theme, m: ModeFn) => {
  const tone = tones(t, m)
  return {
    boxBorderColor: tone.border,
    boxBackground: tone.surface,
    boxCheckedColor: t.color.system.primary.base,
    boxMarkColor: t.color.system.primary.contrast,
  }
}

/** An SVG mark (check or dash) stroked in `color`, as a CSS `url()`. */
const markImage = (path: string, color: string | undefined) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path d='${path}' fill='none' stroke='${color}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
  )}")`

const CHECK_PATH = 'M3.5 8.5l3 3 6-7'

const DASH_PATH = 'M4 8h8'

type StyleCss = (strings: TemplateStringsArray, ...values: unknown[]) => unknown

type BoxTheme = {
  boxBorderColor?: string
  boxBackground?: string
  boxCheckedColor?: string
  boxMarkColor?: string
}

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
              : `background-color: ${s.boxCheckedColor}; background-image: ${markImage(CHECK_PATH, s.boxMarkColor)};`
          }
        }
        ${
          shape === 'square'
            ? `&[aria-checked='mixed']:not(:has([data-choice-indicator]))::before {
                border-color: ${s.boxCheckedColor};
                background-color: ${s.boxCheckedColor};
                background-image: ${markImage(DASH_PATH, s.boxMarkColor)};
              }`
            : ''
        }
      `
    }}
  `
