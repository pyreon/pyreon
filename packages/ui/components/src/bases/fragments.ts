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
