import type { ThemeModeCallback } from '@pyreon/rocketstyle'
import type { Theme } from '@pyreon/ui-theme'

/**
 * Shared theme fragments — the library's cross-cutting style decisions in ONE
 * place instead of copy-pasted into every component.
 *
 * Before this module the focus ring was hand-written at 30 sites across 20
 * components and the disabled treatment at 21 sites, each free to drift. A
 * fragment is a plain function returning a plain style object, so it composes
 * with spread and stays fully typed against the theme:
 *
 *   .theme((t) => ({ ...,
 *     focus: focusRing(t),                                   // whole ring
 *     focus: { ...focusRing(t), borderColor: t.color.system.primary.base },
 *     disabled: disabledState(),                             // standard
 *     disabled: { ...disabledState(), pointerEvents: 'none' },
 *   }))
 *
 * Tune the library's focus/disabled feel here once, not 30 times.
 */

/** System tones that carry a `[200]` ring color in the theme palette. */
export type FocusTone = 'primary' | 'error' | 'success'

/**
 * The canonical focus ring: a 3px tonal ring that REPLACES the UA outline.
 * Use in a base `.theme()` — it owns both the ring and `outline: 'none'`.
 */
export const focusRing = (t: Theme, tone: FocusTone = 'primary') => ({
  boxShadow: `0 0 0 3px ${t.color.system[tone][200]}`,
  outline: 'none',
})

/**
 * Ring COLOR only — for a `.states()` override (error/success) that re-tones a
 * ring whose `outline: 'none'` the base `.theme()` already established.
 * Deliberately does NOT re-declare `outline`, so a state override stays a pure
 * colour swap and the emitted CSS is byte-identical to the hand-written form.
 */
export const focusRingTone = (t: Theme, tone: FocusTone) => ({
  boxShadow: `0 0 0 3px ${t.color.system[tone][200]}`,
})

/**
 * The standard disabled treatment. Compose for stronger variants:
 * `{ ...disabledState(), pointerEvents: 'none' }` (fully inert) or
 * `{ ...disabledState(), backgroundColor: t.color.system.base[50] }` (surface).
 */
export const disabledState = () => ({
  opacity: 0.5,
  cursor: 'not-allowed',
})

/** System colours that carry the fill roles (`base` / `contrast` / `hover`) and `text` / `textDark`. */
export type FillTone = 'primary' | 'success' | 'info' | 'error' | 'warning'

/**
 * A solid fill with its text: `base` behind, `contrast` on it, `hover` when
 * hovered. The theme pairs these to pass 4.5:1, so a component never assumes
 * white text on a coloured fill (white on blue-500 is 3.68:1, on the brand's
 * ember 3.06:1).
 */
export const solidFill = (t: Theme, tone: FillTone) => ({
  backgroundColor: t.color.system[tone].base,
  color: t.color.system[tone].contrast,
  hover: { backgroundColor: t.color.system[tone].hover },
})

/**
 * Text in a tone, on the page or on that tone's tints (`50`–`200`): the theme's
 * `text` in light mode and `textDark` in dark mode. The opacity steps (`700`,
 * `800`) are not text colours — composited they are 1.8–2.7:1.
 */
export const tintText = (t: Theme, m: ThemeModeCallback, tone: FillTone) =>
  m(t.color.system[tone].text, t.color.system[tone].textDark)

/**
 * The active tone as plain theme keys, for a variant to read.
 *
 * `state` and `variant` are separate rocketstyle dimensions, and a variant
 * slice cannot see which state is active: a variant written against
 * `t.color.system.primary` drew primary whatever the state (#4425). Instead the
 * component's base `.theme()` and each `.states()` slice spread these keys,
 * and every variant is a transform (see `rs.ts`) that reads them back through
 * {@link toneVariant} — one definition per variant, in the state's hue.
 *
 * The keys are not CSS properties, so unistyle ignores them; mode-aware values
 * are already resolved by the time a transform runs.
 */
export const toneKeys = (t: Theme, m: ThemeModeCallback, tone: FillTone) =>
  ({
    /** The solid fill; also the outline colour. */
    toneFill: t.color.system[tone].base,
    /** Text and glyphs on {@link toneFill}. */
    toneContrast: t.color.system[tone].contrast,
    /** Text in the tone, on the page and on the tone's tints. */
    toneText: tintText(t, m, tone),
    toneTint50: t.color.system[tone][50],
    toneTint100: t.color.system[tone][100],
    toneTint200: t.color.system[tone][200],
  }) satisfies Record<ToneKey, unknown>

/** The tone keys a state sets. */
export type ToneKey = 'toneFill' | 'toneContrast' | 'toneText' | 'toneTint50' | 'toneTint100' | 'toneTint200'

/** The tone as a variant reads it: every key resolved for the current mode. */
export type Tone = Record<ToneKey, string>

/** Reads the tone keys back from a resolved theme. A key nobody set reads as `''`, which unistyle drops. */
const readTone = (theme: object): Tone => {
  const read = (key: ToneKey): string => {
    const value: unknown = Reflect.get(theme, key)
    return typeof value === 'string' ? value : ''
  }

  return {
    toneFill: read('toneFill'),
    toneContrast: read('toneContrast'),
    toneText: read('toneText'),
    toneTint50: read('toneTint50'),
    toneTint100: read('toneTint100'),
    toneTint200: read('toneTint200'),
  }
}

/**
 * A variant drawn in the active tone. Use as a `.variants()` value:
 *
 *   outline: toneVariant((tone) => ({ borderColor: tone.toneFill, color: tone.toneText })),
 *
 * The component must spread {@link toneKeys} into its base `.theme()` (the
 * tone with no state) and into each `.states()` slice.
 */
export const toneVariant =
  <S extends object>(styles: (tone: Tone) => S) =>
  (theme: object): S =>
    styles(readTone(theme))

/**
 * A colour a `.theme()` set, as a `.styles()` layer receives it in
 * `$rocketstyle`: already resolved for the mode. The declared type of a
 * `mode(light, dark)` value is its callback, so the key is read as `unknown`.
 * This is how a mode-aware colour reaches a selector an `extendCss` string
 * would otherwise carry (Tree's and Combobox's selected row).
 */
export const themeColor = (theme: Record<string, unknown>, key: string): string => {
  const value = theme[key]
  return typeof value === 'string' ? value : ''
}
